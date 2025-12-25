#!/usr/bin/env python3
"""Convert legacy NDJSON export into bulk_import input with a small TUI.

Features
- 读取 data/ 下的 exams/subjects/tags/questions NDJSON（路径可自定义）
- 显示 exam / subject 列表、题目数量、常见年份
- 交互式选择 subject（默认导出全部题目）并生成 bulk_import.py 期望的 JSON 数组
- 自动把远程图片 URL 映射为本地 images/ 下的文件名（已下载好的情况）
- 可选：提供章节名称 -> ID 的映射文件（JSON），否则保留 chapterName 并将 chapterId 置为 null

用法示例
  python scripts/convert_backup.py \
    --env_file .env.development \
    --data-dir data \
    --images-dir images \
    --output data/converted.json

交互流程
 1) 列出所有 subject（含 exam 名称、题目数量、年份分布）
 2) 输入编号选择一个 subject
 3) 选择导出题目数量（默认全部）
 4) 确认后生成 JSON 文件，报告缺失的图片
"""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import re
import sys
import uuid
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from tenacity import retry, stop_after_attempt, wait_fixed

from supabase import create_client  # type: ignore

logger = logging.getLogger(__name__)
QUESTION_BANK_FOR_QUESTIONS = "typical questions"
LEGACY_QUESTION_BANK_FOR_QUESTIONS = 0


def resolve_question_bank_value(client, preferred: str, fallback: int) -> str | int:
    try:
        client.table("exam_boards").select("id").eq("question_bank", preferred).limit(1).execute()
        return preferred
    except Exception as exc:  # noqa: BLE001
        message = None
        if getattr(exc, "args", None):
            details = exc.args[0]
            if isinstance(details, dict):
                message = details.get("message")
        message = message or str(exc)
        if "invalid input syntax for type integer" in message:
            logger.warning(
                "question_bank is still integer in the database; using legacy value 0. "
                "Apply migrations to use the enum values.",
            )
            return fallback
        raise


def load_ndjson(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()
    return slug or "subject"


def flatten_options(options: Iterable[Any]) -> list[str]:
    names: list[str] = []
    for opt in options:
        if isinstance(opt, dict):
            if "name" in opt:
                names.append(str(opt["name"]))
            children = opt.get("children")
            if isinstance(children, list):
                names.extend(flatten_options(children))
        elif isinstance(opt, str):
            names.append(opt)
    return names


def load_chapter_map(path: Path | None) -> dict[str, int]:
    if path is None:
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(
            'Chapter map must be a JSON object: {"Chapter Name": 123}')
    result: dict[str, int] = {}
    for key, value in data.items():
        try:
            result[str(key)] = int(value)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(
                f"Invalid chapter id for {key!r}: {value!r}") from exc
    return result


class Settings(BaseSettings):
    supabase_url: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    supabase_secret_key: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "SUPABASE_SECRET_KEY",
        ),
    )
    question_bucket: str = Field(
        "question_images",
        validation_alias=AliasChoices(
            "QUESTION_BUCKET", "QUESTION_IMAGES_BUCKET"),
    )
    answer_bucket: str = Field(
        "answer_images",
        validation_alias=AliasChoices("ANSWER_BUCKET", "ANSWER_IMAGES_BUCKET"),
    )

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )


def summarize_questions(questions_path: Path) -> dict[str, dict[str, Any]]:
    """Return per-subject stats: total, years counter, chapters counter."""
    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "years": Counter(), "chapters": Counter()}
    )
    with questions_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            subject_id = obj.get("subject")
            if not subject_id:
                continue
            properties = obj.get("properties", {}) or {}
            chapter = properties.get("chapter")
            year = properties.get("year")
            st = stats[subject_id]
            st["total"] += 1
            if chapter:
                st["chapters"][str(chapter)] += 1
            if year:
                st["years"][str(year)] += 1
    return stats


def print_subjects(options: list[dict[str, Any]]):
    logger.info("\n可选科目 (按 exam / subject 排序)：")
    header = f"{'序号':<4} {'Exam':<15} {'Subject':<40} {'题目数':>7} {'年份(Top5)':<30}"
    logger.info(header)
    logger.info("-" * len(header))
    for idx, opt in enumerate(options, start=1):
        top_years = ", ".join(
            f"{y}({c})" for y, c in opt["years"].most_common(5)) or "-"
        logger.info(
            f"{idx:<4} {opt['exam']:<15} {opt['name']:<40} {opt['total']:<7} {top_years:<30}"
        )


def choose_option(options: list[dict[str, Any]]) -> dict[str, Any]:
    while True:
        raw = input("输入序号选择 subject（或 q 退出）：").strip()
        if raw.lower() in {"q", "quit", "exit"}:
            logger.info("已退出。")
            sys.exit(0)
        if not raw.isdigit():
            logger.warning("请输入数字编号。")
            continue
        idx = int(raw)
        if 1 <= idx <= len(options):
            return options[idx - 1]
        logger.warning("编号超出范围，请重试。")


def find_image_path(relative_path: Path | None, filename: str, root: Path) -> Path | None:
    """Return an existing image path under the given root (prefers the URL subpath)."""
    if relative_path:
        candidate = root / relative_path
        if candidate.exists():
            return candidate
    candidate = root / filename
    if candidate.exists():
        return candidate
    return None


def extract_images(
    blocks: list[dict[str, Any]],
    kind: str,
    image_root: Path,
    missing: set[str],
) -> tuple[list[str], list[str]]:
    paths: list[str] = []
    missing_local: list[str] = []
    for block in blocks:
        if block.get("type") != kind:
            continue
        file_info = (block.get("data") or {}).get("file") or {}
        url = file_info.get("url") or ""
        url_path = Path(urlparse(url).path)
        filename = url_path.name
        relative_path = Path(str(url_path).lstrip("/")) if filename else None
        if not filename:
            continue
        found = find_image_path(relative_path, filename, image_root)
        if found:
            paths.append(str(found))
        else:
            fallback = relative_path or Path(filename)
            paths.append(str(image_root / fallback))
            missing.add(str(fallback))
            missing_local.append(str(fallback))
    return paths, missing_local


def build_output_item(
    obj: dict[str, Any],
    image_root: Path,
    chapter_map: dict[str, int],
    missing_images: set[str],
) -> tuple[dict[str, Any] | None, list[str]]:
    properties = obj.get("properties", {}) or {}
    chapter_name = properties.get("chapter")
    chapter_id = chapter_map.get(
        str(chapter_name)) if chapter_name is not None else None

    blocks = obj.get("blocks", []) or []
    question_images, missing_q = extract_images(
        blocks, "image", image_root, missing_images)
    answer_images, missing_a = extract_images(
        blocks, "imageAnswer", image_root, missing_images)
    missing_local = missing_q + missing_a
    if chapter_map and chapter_name is not None and chapter_id is None:
        marker = f"chapter:{chapter_name}"
        missing_local.append(marker)
        missing_images.add(marker)

    item = {
        "chapterId": chapter_id,
        "chapterName": chapter_name,
        "marks": properties.get("mark"),
        "difficulty": obj.get("difficulty") or 1,
        "calculator": bool(obj.get("calculator", True)),
        "questionImages": question_images,
        "answerImages": answer_images,
        "meta": {
            "year": properties.get("year"),
            "paper": properties.get("paper"),
            "season": properties.get("season"),
            "timezone": properties.get("timezone"),
            "exam": obj.get("exam"),
            "subject": obj.get("subject"),
            "sourceId": obj.get("_id"),
        },
    }
    return (item if not missing_local else None, missing_local)


def convert_subject(
    subject_id: str,
    questions_path: Path,
    image_root: Path,
    chapter_map: dict[str, int],
    limit: int | None,
) -> tuple[list[dict[str, Any]], set[str]]:
    results: list[dict[str, Any]] = []
    missing_images: set[str] = set()
    max_items = limit if limit is not None and limit > 0 else None
    with questions_path.open("r", encoding="utf-8") as f:
        for line in f:
            if max_items is not None and len(results) >= max_items:
                break
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("subject") != subject_id:
                continue
            item, missing_local = build_output_item(
                obj,
                image_root=image_root,
                chapter_map=chapter_map,
                missing_images=missing_images,
            )
            if missing_local:
                continue  # 只保留图片齐全的题目
            if item:
                results.append(item)
    return results, missing_images


@retry(wait=wait_fixed(2), stop=stop_after_attempt(3), reraise=True)
def upload_file(supabase, bucket: str, file_path: Path) -> str:
    if not file_path.exists():
        raise FileNotFoundError(f"图片文件不存在: {file_path}")
    # 从文件名里抽取真实扩展（兼容 foo-1.png-123 这类带时间戳后缀的名称）
    known_exts = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff")
    raw_name = file_path.name
    ext_guess = None
    lowered = raw_name.lower()
    for ext in known_exts:
        idx = lowered.find(ext)
        if idx != -1:
            ext_guess = raw_name[idx: idx + len(ext)]
            break
    if ext_guess is None:
        name_for_guess = raw_name.split("-", 1)[0]
        ext_guess = Path(name_for_guess).suffix or file_path.suffix or ".bin"

    # 优先用常见映射，再用 mimetypes 猜测
    ext_lower = ext_guess.lower()
    content_type = (
        {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".tiff": "image/tiff",
        }.get(ext_lower)
        or mimetypes.guess_type(f"dummy{ext_guess}")[0]
        or mimetypes.guess_type(raw_name)[0]
        or mimetypes.guess_type(raw_name.split("-", 1)[0])[0]
        or "application/octet-stream"
    )
    with file_path.open("rb") as f:
        storage_path = f"questions/{uuid.uuid4()}{ext_guess}"
        try:
            supabase.storage.from_(bucket).upload(
                storage_path,
                f,
                file_options={"content-type": content_type},
            )
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"上传失败: {file_path} -> {bucket}/{storage_path} (content-type: {content_type}): {exc}"
            ) from exc
    return storage_path


def insert_images(supabase, table: str, rows: list[dict[str, Any]]):
    if not rows:
        return
    supabase.table(table).insert(rows).execute()


def upload_items(
    supabase,
    items: list[dict[str, Any]],
    question_bucket: str,
    answer_bucket: str,
) -> int:
    """Upload converted items into Supabase DB + storage. Returns success count."""
    success = 0
    for item in items:
        chapter_id = item.get("chapterId")
        if chapter_id is None:
            raise ValueError(
                "上传需要 chapterId，请提供 --chapter-map 或使用 --sync-db 生成映射。")

        marks = item.get("marks")
        difficulty = item.get("difficulty") or 1
        calculator = bool(item.get("calculator", False))
        q_imgs = item.get("questionImages") or []
        a_imgs = item.get("answerImages") or []

        q_resp = (
            supabase.table("questions")
            .insert(
                {
                    "chapter_id": chapter_id,
                    "marks": marks,
                    "difficulty": difficulty,
                    "calculator": calculator,
                }
            )
            .execute()
        )
        q_error = getattr(q_resp, "error", None)
        q_data = getattr(q_resp, "data", None)
        if q_error or not q_data:
            message = getattr(q_error, "message", None) or "创建 question 失败"
            raise RuntimeError(message)
        q_id = q_data[0]["id"]

        uploaded_q: list[dict[str, Any]] = []
        uploaded_a: list[dict[str, Any]] = []

        try:
            for idx, img_path in enumerate(q_imgs):
                storage_path = upload_file(
                    supabase, question_bucket, Path(img_path))
                uploaded_q.append(
                    {
                        "question_id": q_id,
                        "storage_path": storage_path,
                        "position": idx + 1,
                    }
                )
            insert_images(supabase, "question_images", uploaded_q)

            for idx, img_path in enumerate(a_imgs):
                storage_path = upload_file(
                    supabase, answer_bucket, Path(img_path))
                uploaded_a.append(
                    {
                        "question_id": q_id,
                        "storage_path": storage_path,
                        "position": idx + 1,
                    }
                )
            insert_images(supabase, "answer_images", uploaded_a)

        except Exception as exc:  # noqa: BLE001
            supabase.table("questions").delete().eq("id", q_id).execute()
            logger.error(f"题目 #{q_id} 上传失败，已删除 question 记录。错误: {exc}")
            raise

        success += 1
        logger.info(f"已上传题目 #{q_id}")

    return success


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert legacy NDJSON backup into bulk_import input")
    parser.add_argument("--data-dir", type=Path,
                        default=Path("data"), help="目录，包含备份 NDJSON 文件")
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=Path("images"),
        help="图片根目录（按 URL 子路径查找，默认 images/）",
    )
    parser.add_argument(
        "--sync-db",
        action="store_true",
        help="检查并在 Supabase 中创建 exam/subject/chapters（需服务密钥），仅保留对应章节的题目",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="完成转换后直接上传题目和图片到 Supabase（需服务密钥）",
    )
    parser.add_argument(
        "--question-bucket",
        type=str,
        default=None,
        help="题目图片 bucket（默认取环境变量 QUESTION_BUCKET 或 question_images）",
    )
    parser.add_argument(
        "--answer-bucket",
        type=str,
        default=None,
        help="答案图片 bucket（默认取环境变量 ANSWER_BUCKET 或 answer_images）",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=None,
        help="导出题目数量（默认全部）",
    )
    parser.add_argument("--output", type=Path, default=None,
                        help="输出路径（默认 data/converted_<subject>.json）")
    parser.add_argument("--chapter-map", type=Path,
                        default=None, help="可选：章节名称到 ID 的映射 JSON 文件")
    parser.add_argument(
        "--env-file",
        "--env_file",
        dest="env_file",
        type=Path,
        default=None,
        help="环境变量文件路径（必填）",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    if args.env_file is None:
        logger.error("❌ 缺少 --env_file，请指定环境变量文件路径。")
        return
    env_file = args.env_file
    settings = Settings(  # type: ignore[call-arg]
        _env_file=env_file,
        _env_file_encoding="utf-8",
    )

    data_dir: Path = args.data_dir
    image_root: Path = args.images_dir
    supabase_url = settings.supabase_url
    supabase_key = settings.supabase_secret_key
    question_bucket = args.question_bucket or settings.question_bucket
    answer_bucket = args.answer_bucket or settings.answer_bucket
    questions_path = data_dir / \
        "database_export-myquestionbank-9gcfve68fe4574af-questions.json"
    exams_path = data_dir / "database_export-myquestionbank-9gcfve68fe4574af-exams.json"
    subjects_path = data_dir / \
        "database_export-myquestionbank-9gcfve68fe4574af-subjects.json"
    tags_path = data_dir / "database_export-myquestionbank-9gcfve68fe4574af-tags.json"
    supabase_client = None

    if args.sync_db or args.upload:
        if not supabase_url or not supabase_key:
            logger.error(
                "❌ 缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY 环境变量，无法连接 Supabase。"
            )
            return
        supabase_client = create_client(supabase_url, supabase_key)

    exams = load_ndjson(exams_path)
    subjects = load_ndjson(subjects_path)
    tags = load_ndjson(tags_path)
    chapter_map = load_chapter_map(args.chapter_map)

    stats = summarize_questions(questions_path)

    exam_by_id = {row["_id"]: row for row in exams}
    subject_rows = []
    for subj in subjects:
        subject_id = subj.get("_id")
        st = stats.get(
            subject_id, {"total": 0, "years": Counter(), "chapters": Counter()})
        exam_name = exam_by_id.get(subj.get("exam", ""), {}).get("name", "-")
        subject_rows.append(
            {
                "id": subject_id,
                "name": subj.get("name", "(unknown)"),
                "exam": exam_name,
                "total": st["total"],
                "years": st["years"],
                "chapters": st["chapters"],
            }
        )

    subject_rows.sort(key=lambda x: (x["exam"], x["name"]))
    print_subjects(subject_rows)

    chosen = choose_option(subject_rows)
    subject_id = chosen["id"]
    subject_name = chosen["name"]
    exam_name = chosen["exam"]
    logger.info("\n已选择：")
    logger.info(f"  Exam   : {exam_name}")
    logger.info(f"  Subject: {subject_name} (ID: {subject_id})")
    logger.info(f"  题目数 : {chosen['total']}")

    # 尝试从 tags 里拿章节/年份配置
    tag_chapters: list[str] = []
    tag_years: list[str] = []
    for tag in tags:
        if tag.get("subject") != subject_id:
            continue
        if tag.get("name") == "chapter":
            opts = tag.get("options") or []
            tag_chapters = flatten_options(opts)
        if tag.get("name") == "year":
            opts = tag.get("options") or []
            tag_years = flatten_options(opts)

    if tag_chapters:
        logger.info(
            f"章节（来自 tags，{len(tag_chapters)} 个）：{', '.join(tag_chapters[:10])}"
            f"{' …' if len(tag_chapters) > 10 else ''}"
        )
    else:
        top_chapters = ", ".join(
            name for name, _ in chosen["chapters"].most_common(10)) or "-"
        logger.info(f"章节（从题目中提取）：{top_chapters}")

    if tag_years:
        logger.info(f"年份（来自 tags）：{', '.join(tag_years)}")
    else:
        top_years = ", ".join(
            year for year, _ in chosen["years"].most_common(10)) or "-"
        logger.info(f"年份（从题目中提取）：{top_years}")

    default_limit_label = (
        str(args.count) if args.count else f"全部({chosen['total']})"
    )
    try:
        limit_raw = input(
            f"要导出的题目数量? [默认 {default_limit_label}]: ").strip()
        limit = int(limit_raw) if limit_raw else args.count
    except ValueError:
        logger.warning("输入非法，使用默认全部。")
        limit = args.count

    default_output = args.output or (
        data_dir / f"converted_{slugify(subject_name)}.json")
    output_path_raw = input(f"输出文件路径? [默认 {default_output}]: ").strip()
    output_path = Path(
        output_path_raw) if output_path_raw else Path(default_output)

    if args.sync_db:
        if supabase_client is None:
            logger.error("❌ 缺少 Supabase 配置，无法同步数据库。")
            return
        consent = input(
            "允许在 Supabase 创建缺失的 exam/subject/chapters 吗? (y/N): ").strip().lower()
        if consent not in {"y", "yes"}:
            logger.info("已取消同步数据库。")
            return

        question_bank_value = resolve_question_bank_value(
            supabase_client,
            QUESTION_BANK_FOR_QUESTIONS,
            LEGACY_QUESTION_BANK_FOR_QUESTIONS,
        )
        exam_resp = (
            supabase_client.table("exam_boards")
            .select("id")
            .eq("name", exam_name)
            .eq("question_bank", question_bank_value)
            .execute()
        )
        exam_id = exam_resp.data[0]["id"] if exam_resp.data else None
        if not exam_id:
            try:
                insert_exam = (
                    supabase_client.table("exam_boards")
                    .insert(
                        {"name": exam_name, "question_bank": question_bank_value},
                    )
                    .execute()
                )
                exam_id = insert_exam.data[0]["id"]
                logger.info(f"已创建 exam_board: {exam_name} (id={exam_id})")
            except Exception as exc:  # noqa: BLE001
                logger.error(f"❌ 创建 exam_board 失败（可能是 RLS 或权限问题）: {exc}")
                return
        else:
            logger.info(f"已存在 exam_board: {exam_name} (id={exam_id})")

        subject_resp = (
            supabase_client.table("subjects")
            .select("id")
            .eq("name", subject_name)
            .eq("exam_board_id", exam_id)
            .execute()
        )
        subject_db_id = subject_resp.data[0]["id"] if subject_resp.data else None
        if not subject_db_id:
            try:
                insert_subj = (
                    supabase_client.table("subjects")
                    .insert({"name": subject_name, "exam_board_id": exam_id})
                    .execute()
                )
                subject_db_id = insert_subj.data[0]["id"]
                logger.info(
                    f"已创建 subject: {subject_name} (id={subject_db_id})")
            except Exception as exc:  # noqa: BLE001
                logger.error(f"❌ 创建 subject 失败（可能是 RLS 或权限问题）: {exc}")
                return
        else:
            logger.info(f"已存在 subject: {subject_name} (id={subject_db_id})")

        desired_chapters = tag_chapters or [
            name for name, _ in chosen["chapters"].most_common()]
        desired_chapters = [c for c in desired_chapters if c]

        chapter_resp = (
            supabase_client.table("chapters")
            .select("id,name,position")
            .eq("subject_id", subject_db_id)
            .execute()
        )
        existing_chapters = {row["name"]: (row["id"], row.get(
            "position", 0) or 0) for row in (chapter_resp.data or [])}
        chapter_map = {name: cid for name,
                       (cid, _) in existing_chapters.items()}
        if existing_chapters:
            logger.info(f"已存在 {len(existing_chapters)} 个章节：")
            for name, (cid, pos) in existing_chapters.items():
                logger.info(f"  - {name} (id={cid}, position={pos})")

        missing_chapters = [
            c for c in desired_chapters if c not in chapter_map]
        if missing_chapters:
            next_pos = max(
                (pos for _, pos in existing_chapters.values()), default=0) + 1
            to_insert = [
                {"name": name, "subject_id": subject_db_id,
                    "position": idx + next_pos, "parent_chapter_id": None}
                for idx, name in enumerate(missing_chapters)
            ]
            try:
                insert_chapters = supabase_client.table(
                    "chapters").insert(to_insert).execute()
                for row in insert_chapters.data or []:
                    chapter_map[row["name"]] = row["id"]
                    logger.info(
                        f"已创建章节: {row.get('name', '(unknown)')} "
                        f"(id={row.get('id')}, position={row.get('position')})"
                    )
                logger.info(f"已创建 {len(missing_chapters)} 个章节。")
            except Exception as exc:  # noqa: BLE001
                logger.error(f"❌ 创建章节失败（可能是 RLS 或权限问题）: {exc}")
                return
        logger.info(f"章节映射完成：{len(chapter_map)} 个章节可用。")

    logger.info("\n开始转换（仅保留图片齐全的题目）...")
    converted, missing_images = convert_subject(
        subject_id=subject_id,
        questions_path=questions_path,
        image_root=image_root,
        chapter_map=chapter_map,
        limit=limit,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(
        converted, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"已写入 {len(converted)} 条到 {output_path}")

    if args.upload:
        if supabase_client is None:
            logger.error(
                "❌ 上传需要 Supabase 配置，请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY。")
            return
        if any(item.get("chapterId") is None for item in converted):
            logger.error(
                "❌ 上传需要 chapterId，请提供 --chapter-map 或启用 --sync-db 生成映射后重试。")
            return
        logger.info(
            f"开始上传到 Supabase（question_bucket={question_bucket}, answer_bucket={answer_bucket}）..."
        )
        try:
            uploaded = upload_items(
                supabase_client,
                converted,
                question_bucket=question_bucket,
                answer_bucket=answer_bucket,
            )
            logger.info(f"上传完成：{uploaded}/{len(converted)} 条。")
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"❌ 上传失败：{exc}")
            return

    if not chapter_map and not args.sync_db:
        logger.warning(
            "⚠️ 未提供 chapter-map，chapterId 为 null，仅保留 chapterName。导入前请映射章节 ID。")
    if missing_images:
        missing_list = ", ".join(sorted(missing_images))
        logger.warning(
            f"⚠️ 有 {len(missing_images)} 张图片在 {image_root} 未找到：{missing_list}")
        logger.info("（这些题目已被跳过）")
    else:
        logger.info("图片/章节检查：全部存在。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n已中断。")
