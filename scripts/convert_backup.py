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
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Optional, List, Dict
from urllib.parse import urlparse

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from rich.console import Console
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TaskID,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from tenacity import retry, stop_after_attempt, wait_fixed

import inquirer
from supabase import create_client  # type: ignore

console = Console()

logger = logging.getLogger(__name__)


def create_progress() -> Progress:
    """创建一个美观的 rich 进度条"""
    return Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(bar_width=40),
        TaskProgressColumn(),
        MofNCompleteColumn(),
        TextColumn("•"),
        TimeElapsedColumn(),
        TextColumn("•"),
        TimeRemainingColumn(),
        TextColumn("[green]{task.fields[success]}✓[/green] [red]{task.fields[failed]}✗[/red]"),
        console=console,
        refresh_per_second=10,
    )
QUESTION_BANK_FOR_QUESTIONS = "typical questions"
LEGACY_QUESTION_BANK_FOR_QUESTIONS = 0


# === Error Reporting System ===
class ErrorType(str, Enum):
    """错误类型枚举"""
    MISSING_IMAGE = "missing_image"
    CHAPTER_MAPPING_FAILED = "chapter_mapping_failed"
    INVALID_DATA_FORMAT = "invalid_data_format"
    DATABASE_ERROR = "database_error"
    UPLOAD_FAILED = "upload_failed"
    FILE_NOT_FOUND = "file_not_found"
    VALIDATION_ERROR = "validation_error"


class ConversionError:
    """转换错误详情"""
    def __init__(
        self,
        source_id: str,
        error_type: ErrorType,
        message: str,
        context: Dict[str, Any],
        timestamp: Optional[str] = None,
    ):
        self.source_id = source_id
        self.error_type = error_type
        self.message = message
        self.context = context
        self.timestamp = timestamp or datetime.now().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，用于JSON序列化"""
        return {
            "source_id": self.source_id,
            "error_type": self.error_type.value,
            "message": self.message,
            "context": self.context,
            "timestamp": self.timestamp,
        }


class ErrorReport:
    """错误报告容器"""
    def __init__(self):
        self.errors: List[ConversionError] = []
        self.total_processed = 0
        self.successful = 0
        self.failed = 0

    def add_error(self, error: ConversionError):
        """添加错误"""
        self.errors.append(error)
        self.failed += 1

    def add_success(self):
        """添加成功计数"""
        self.successful += 1

    def increment_processed(self):
        """增加处理计数"""
        self.total_processed += 1

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "summary": {
                "total_processed": self.total_processed,
                "successful": self.successful,
                "failed": self.failed,
                "error_types": Counter(e.error_type.value for e in self.errors),
                "generated_at": datetime.now().isoformat(),
            },
            "errors": [e.to_dict() for e in self.errors],
        }

    def save(self, output_path: Path):
        """保存错误报告到文件"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False, default=str),
            encoding="utf-8",
        )
        logger.info(f"错误报告已保存到: {output_path}")
        logger.info(f"处理统计: 总数={self.total_processed}, 成功={self.successful}, 失败={self.failed}")


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


def parse_chapter_name(raw_chapter: str) -> tuple[str, str | None]:
    """解析章节名称，支持 chapter@sub-chapter 格式。

    Args:
        raw_chapter: 原始章节名称，可能包含 @ 分隔符

    Returns:
        (parent_chapter, sub_chapter) 元组
        如果没有 sub-chapter，sub_chapter 为 None
    """
    if "@" in raw_chapter:
        parts = raw_chapter.split("@", 1)
        return parts[0].strip(), parts[1].strip()
    return raw_chapter, None


def get_chapter_key(parent: str, sub: str | None) -> str:
    """生成 chapter_map 的 key。

    对于有 sub-chapter 的情况，使用 parent@sub 格式作为 key。
    """
    if sub:
        return f"{parent}@{sub}"
    return parent


def flatten_options(options: Iterable[Any]) -> list[str]:
    """扁平化 options 列表，返回所有章节名称（不保留层级关系）"""
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


def parse_chapter_hierarchy(options: Iterable[Any]) -> dict[str, list[str]]:
    """解析 options 列表，返回章节层级关系。

    Returns:
        dict: parent_name -> [child_names] 的映射
              顶级章节的 parent 为空字符串 ""
    """
    hierarchy: dict[str, list[str]] = {"": []}  # "" 表示顶级章节

    for opt in options:
        if isinstance(opt, dict):
            name = opt.get("name")
            if name:
                parent_name = str(name)
                hierarchy[""].append(parent_name)  # 添加为顶级章节
                children = opt.get("children")
                if isinstance(children, list) and children:
                    child_names: list[str] = []
                    for child in children:
                        if isinstance(child, str):
                            child_names.append(child)
                        elif isinstance(child, dict) and "name" in child:
                            child_names.append(str(child["name"]))
                    if child_names:
                        hierarchy[parent_name] = child_names
        elif isinstance(opt, str):
            hierarchy[""].append(opt)

    return hierarchy


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


def read_questions_with_stats_and_cache(
    questions_path: Path,
    subjects_to_cache: Optional[set[str]] = None
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """Read questions file once, returning stats and optionally cached data.

    Args:
        questions_path: Path to questions NDJSON file
        subjects_to_cache: Set of subject IDs to cache data for (None = cache nothing)

    Returns:
        Tuple of (stats_dict, cache_dict) where:
        - stats_dict: {subject_id: {"total": int, "years": Counter, "chapters": Counter}}
        - cache_dict: {subject_id: [question_dict, ...]} (only for subjects in subjects_to_cache)
    """
    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "years": Counter(), "chapters": Counter()}
    )
    cache: dict[str, list[dict[str, Any]]] = defaultdict(list)

    with questions_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            subject_id = obj.get("subject")
            if not subject_id:
                continue

            # Update statistics
            properties = obj.get("properties", {}) or {}
            chapter = properties.get("chapter")
            year = properties.get("year")
            st = stats[subject_id]
            st["total"] += 1
            if chapter:
                st["chapters"][str(chapter)] += 1
            if year:
                st["years"][str(year)] += 1

            # Cache data if requested for this subject
            if subjects_to_cache is not None and subject_id in subjects_to_cache:
                cache[subject_id].append(obj)

    return dict(stats), cache


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


def choose_subjects_interactive(options: list[dict[str, Any]], enable_multi: bool = True) -> List[dict[str, Any]]:
    """Interactive subject selection using inquirer (arrow keys + spacebar)

    Args:
        options: List of subject dictionaries
        enable_multi: Whether to enable multi-selection mode

    Returns:
        Selected subjects list (empty if user cancels)
    """
    if not options:
        return []

    # Format options for inquirer display
    inquirer_choices = []
    for idx, opt in enumerate(options, start=1):
        # Create a compact display string
        exam = opt.get('exam', '-')[:12]
        name = opt.get('name', '(unknown)')[:30]
        total = opt.get('total', 0)
        top_years = ", ".join(f"{y}({c})" for y, c in opt.get('years', Counter()).most_common(3)) or "-"
        display = f"{idx:>2}. {exam:<12} {name:<30} {total:>4}题  {top_years:<20}"
        inquirer_choices.append((display, idx - 1))  # store display and index

    if enable_multi:
        # Multi-selection with checkboxes
        questions = [
            inquirer.Checkbox(
                'selected',
                message="选择科目 (空格键选择/取消，回车确认)",
                choices=[choice[0] for choice in inquirer_choices],
                default=[],
            )
        ]

        try:
            answers = inquirer.prompt(questions)
            if not answers or 'selected' not in answers:
                logger.info("已取消选择。")
                return []

            selected_displays = answers['selected']
            # Map back to original options
            selected_indices = []
            for display in selected_displays:
                # Find the index by matching display string
                for idx, (disp, opt_idx) in enumerate(inquirer_choices):
                    if disp == display:
                        selected_indices.append(opt_idx)
                        break

            selected = [options[i] for i in selected_indices]
            if selected:
                logger.info(f"已选择 {len(selected)} 个科目: {', '.join(s['name'] for s in selected)}")
            return selected

        except KeyboardInterrupt:
            logger.info("\n已中断选择。")
            return []
        except Exception as e:
            logger.warning(f"交互式选择失败: {e}, 回退到文本模式")
            # Fall back to text-based selection
            return choose_multiple_options_text(options, enable_multi)
    else:
        # Single selection with list
        questions = [
            inquirer.List(
                'selected',
                message="选择科目 (上下键选择，回车确认)",
                choices=[choice[0] for choice in inquirer_choices],
            )
        ]

        try:
            answers = inquirer.prompt(questions)
            if not answers or 'selected' not in answers:
                logger.info("已取消选择。")
                return []

            selected_display = answers['selected']
            # Find the selected index
            selected_index = None
            for idx, (disp, opt_idx) in enumerate(inquirer_choices):
                if disp == selected_display:
                    selected_index = opt_idx
                    break

            if selected_index is not None:
                selected = [options[selected_index]]
                logger.info(f"已选择科目: {selected[0]['name']}")
                return selected
            return []

        except KeyboardInterrupt:
            logger.info("\n已中断选择。")
            return []
        except Exception as e:
            logger.warning(f"交互式选择失败: {e}, 回退到文本模式")
            # Fall back to text-based selection
            return choose_multiple_options_text(options, enable_multi)


def choose_multiple_options_text(options: list[dict[str, Any]], enable_multi: bool = True) -> List[dict[str, Any]]:
    """Text-based subject selection (fallback when inquirer fails)

    Args:
        options: List of subject dictionaries
        enable_multi: Whether to enable multi-selection mode

    Returns:
        Selected subjects list (empty if user cancels)
    """
    # Print subject list for text-based selection
    print_subjects(options)

    while True:
        if enable_multi:
            print("\n选择方式：")
            print("  - 单个: 1")
            print("  - 多个: 1,3,5")
            print("  - 范围: 1-3")
            print("  - 混合: 1,3-5,7")
            print("  - 全部: all")
            print("  - 退出: q")
            raw = input("输入选择：").strip()
        else:
            raw = input("输入序号选择 subject（或 q 退出）：").strip()

        if raw.lower() in {"q", "quit", "exit"}:
            logger.info("已退出。")
            return []

        if raw.lower() == "all":
            return options

        if not enable_multi:
            # 单选模式
            if not raw.isdigit():
                logger.warning("请输入数字编号。")
                continue
            idx = int(raw)
            if 1 <= idx <= len(options):
                return [options[idx - 1]]
            logger.warning(f"编号超出范围 (1-{len(options)})，请重试。")
            continue

        # 多选模式
        try:
            selected_indices = parse_multi_selection(raw, len(options))
            if not selected_indices:
                logger.warning("没有有效的选择")
                continue

            selected = [options[i-1] for i in selected_indices]
            logger.info(f"已选择 {len(selected)} 个subject: {', '.join(s['name'] for s in selected)}")
            return selected

        except ValueError as e:
            logger.warning(f"输入错误: {e}")
            continue


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


def parse_multi_selection(input_str: str, max_option: int) -> List[int]:
    """解析多种选择格式：单个、逗号分隔、范围

    支持格式：
    - 单个: "1"
    - 多个: "1,3,5"
    - 范围: "1-3"
    - 混合: "1,3-5,7"
    """
    selected_indices = set()
    parts = [p.strip() for p in input_str.split(",") if p.strip()]

    for part in parts:
        if "-" in part:
            # 处理范围
            try:
                start_str, end_str = part.split("-", 1)
                start = int(start_str.strip())
                end = int(end_str.strip())
                if start < 1 or end > max_option or start > end:
                    raise ValueError(f"无效范围: {part}")
                selected_indices.update(range(start, end + 1))
            except ValueError as e:
                raise ValueError(f"无效范围格式 '{part}': {e}")
        else:
            # 处理单个数字
            try:
                idx = int(part)
                if idx < 1 or idx > max_option:
                    raise ValueError(f"编号 {idx} 超出范围 (1-{max_option})")
                selected_indices.add(idx)
            except ValueError as e:
                raise ValueError(f"无效数字 '{part}': {e}")

    return sorted(selected_indices)


def choose_multiple_options(options: list[dict[str, Any]], enable_multi: bool = True) -> List[dict[str, Any]]:
    """交互式选择多个subject（使用现代化界面：上下键+空格键）

    Args:
        options: 可选subject列表
        enable_multi: 是否启用多选模式（True: 多选，False: 单选）

    Returns:
        选中的subject列表（可能为空，表示用户退出）
    """
    # Use the new interactive selection by default
    return choose_subjects_interactive(options, enable_multi)


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
) -> tuple[Optional[list[str]], list[str]]:
    """提取图片路径，如果图片缺失则返回None和缺失文件列表"""
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
            missing.add(str(fallback))
            missing_local.append(str(fallback))
            # 不添加不存在的路径，返回None表示图片缺失
            return None, missing_local
    return paths, missing_local


def build_output_item(
    obj: dict[str, Any],
    image_root: Path,
    chapter_map: dict[str, int],
    missing_images: set[str],
    error_report: Optional[ErrorReport] = None,
    subject_name: str | None = None,
) -> tuple[Optional[dict[str, Any]], list[str]]:
    properties = obj.get("properties", {}) or {}
    raw_chapter_name = properties.get("chapter")

    # 解析 chapter@sub-chapter 格式
    chapter_id: int | None = None
    chapter_name = raw_chapter_name
    parent_chapter_name: str | None = None
    sub_chapter_name: str | None = None

    if raw_chapter_name is not None:
        parent_chapter_name, sub_chapter_name = parse_chapter_name(str(raw_chapter_name))

        # 查找 chapter_id 的优先级：
        # 1. 完整的 parent@sub 格式
        # 2. 仅 sub-chapter 名称（如果存在）
        # 3. 仅 parent chapter 名称（如果没有 sub-chapter）
        full_key = get_chapter_key(parent_chapter_name, sub_chapter_name)
        if full_key in chapter_map:
            chapter_id = chapter_map[full_key]
        elif sub_chapter_name and sub_chapter_name in chapter_map:
            # 尝试仅使用 sub-chapter 名称查找
            chapter_id = chapter_map[sub_chapter_name]
        elif parent_chapter_name in chapter_map and not sub_chapter_name:
            # 没有 sub-chapter，使用 parent
            chapter_id = chapter_map[parent_chapter_name]

    blocks = obj.get("blocks", []) or []
    question_images, missing_q = extract_images(
        blocks, "image", image_root, missing_images)
    answer_images, missing_a = extract_images(
        blocks, "imageAnswer", image_root, missing_images)

    missing_local = missing_q + missing_a

    # 检查图片是否缺失（extract_images返回None表示缺失）
    if question_images is None or answer_images is None:
        # 图片缺失，返回None并记录错误（如果有error_report）
        if error_report:
            missing_filenames = []
            if question_images is None:
                missing_filenames.extend(missing_q)
            if answer_images is None:
                missing_filenames.extend(missing_a)
            error_report.add_error(ConversionError(
                source_id=obj.get("_id", "unknown"),
                error_type=ErrorType.MISSING_IMAGE,
                message=f"Missing images: {', '.join(missing_filenames)}",
                context={
                    "missing_question_images": missing_q if question_images is None else [],
                    "missing_answer_images": missing_a if answer_images is None else [],
                    "subject_id": obj.get("subject"),
                    "subject_name": subject_name,
                    "exam": obj.get("exam"),
                },
            ))
        return None, missing_local

    # 章节映射失败处理（不阻止转换，但记录警告）
    if chapter_map and raw_chapter_name is not None and chapter_id is None:
        marker = f"chapter:{raw_chapter_name}"
        missing_local.append(marker)
        missing_images.add(marker)
        if error_report:
            error_report.add_error(ConversionError(
                source_id=obj.get("_id", "unknown"),
                error_type=ErrorType.CHAPTER_MAPPING_FAILED,
                message=f"Chapter '{raw_chapter_name}' not found in mapping",
                context={
                    "raw_chapter_name": raw_chapter_name,
                    "parent_chapter": parent_chapter_name,
                    "sub_chapter": sub_chapter_name,
                    "available_chapters": list(chapter_map.keys()),
                    "subject_id": obj.get("subject"),
                    "subject_name": subject_name,
                },
            ))
        # 注意：这里不返回None，允许chapterId为null继续转换

    item = {
        "chapterId": chapter_id,
        "chapterName": chapter_name,
        "marks": properties.get("mark"),
        "difficulty": obj.get("difficulty") or 1,
        "calculator": bool(obj.get("calculator", True)),
        "questionImages": question_images or [],  # 确保是列表
        "answerImages": answer_images or [],      # 确保是列表
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


def count_questions_for_subject(questions_path: Path, subject_id: str) -> int:
    """快速统计指定subject的题目数量"""
    count = 0
    with questions_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if obj.get("subject") == subject_id:
                    count += 1
            except json.JSONDecodeError:
                continue
    return count


def convert_subject(
    subject_id: str,
    questions_path: Path,
    image_root: Path,
    chapter_map: dict[str, int],
    limit: int | None,
    error_report: Optional[ErrorReport] = None,
    show_progress: bool = True,
    subject_name: str | None = None,
) -> tuple[list[dict[str, Any]], set[str]]:
    """转换指定subject的题目，支持错误报告和进度条"""
    results: list[dict[str, Any]] = []
    missing_images: set[str] = set()
    max_items = limit if limit is not None and limit > 0 else None

    # 统计题目总数用于进度条
    total_count = count_questions_for_subject(questions_path, subject_id)
    if max_items and max_items < total_count:
        total_count = max_items

    success_count = 0
    failed_count = 0

    def process_questions(task_id: TaskID | None = None, progress: Progress | None = None):
        nonlocal success_count, failed_count
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
                    error_report=error_report,
                    subject_name=subject_name,
                )

                if error_report:
                    error_report.increment_processed()

                if missing_local:
                    failed_count += 1
                    if progress and task_id is not None:
                        progress.update(task_id, advance=1, success=success_count, failed=failed_count)
                    continue

                if item:
                    results.append(item)
                    success_count += 1
                    if error_report:
                        error_report.add_success()

                if progress and task_id is not None:
                    progress.update(task_id, advance=1, success=success_count, failed=failed_count)

    if show_progress and total_count > 0:
        with create_progress() as progress:
            task_id = progress.add_task(
                f"转换 {subject_name or subject_id[:8]}...",
                total=total_count,
                success=0,
                failed=0,
            )
            process_questions(task_id, progress)
        if error_report:
            console.print(f"[green]转换完成:[/green] {len(results)} 成功, {error_report.failed} 失败")
    else:
        process_questions()
        if error_report:
            logger.info(f"转换完成: {len(results)} 成功, {error_report.failed} 失败")

    return results, missing_images


def convert_subject_from_cache(
    subject_id: str,
    cached_questions: list[dict[str, Any]],
    image_root: Path,
    chapter_map: dict[str, int],
    limit: int | None,
    error_report: Optional[ErrorReport] = None,
    show_progress: bool = True,
    subject_name: str | None = None,
) -> tuple[list[dict[str, Any]], set[str]]:
    """Convert subject questions from cached data (no file I/O).

    Args:
        subject_id: Subject ID (for logging)
        cached_questions: List of question objects from cache
        image_root: Root directory for images
        chapter_map: Chapter name to ID mapping
        limit: Maximum number of questions to convert
        error_report: Optional error report object
        show_progress: Whether to show progress bar
        subject_name: Subject name for error reporting

    Returns:
        Tuple of (converted_items, missing_images)
    """
    results: list[dict[str, Any]] = []
    missing_images: set[str] = set()
    max_items = limit if limit is not None and limit > 0 else None

    # Total count for progress bar
    total_count = len(cached_questions)
    if max_items and max_items < total_count:
        total_count = max_items

    success_count = 0
    failed_count = 0

    def process_cached(task_id: TaskID | None = None, progress: Progress | None = None):
        nonlocal success_count, failed_count
        for obj in cached_questions:
            if max_items is not None and len(results) >= max_items:
                break

            item, missing_local = build_output_item(
                obj,
                image_root=image_root,
                chapter_map=chapter_map,
                missing_images=missing_images,
                error_report=error_report,
                subject_name=subject_name,
            )

            if error_report:
                error_report.increment_processed()

            if missing_local:
                failed_count += 1
                if progress and task_id is not None:
                    progress.update(task_id, advance=1, success=success_count, failed=failed_count)
                continue

            if item:
                results.append(item)
                success_count += 1
                if error_report:
                    error_report.add_success()

            if progress and task_id is not None:
                progress.update(task_id, advance=1, success=success_count, failed=failed_count)

    if show_progress and total_count > 0:
        with create_progress() as progress:
            task_id = progress.add_task(
                f"转换 {subject_name or subject_id[:8]}...",
                total=total_count,
                success=0,
                failed=0,
            )
            process_cached(task_id, progress)
        if error_report:
            console.print(f"[green]转换完成:[/green] {len(results)} 成功, {error_report.failed} 失败")
    else:
        process_cached()
        if error_report:
            logger.info(f"转换完成: {len(results)} 成功, {error_report.failed} 失败")

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
    error_report: Optional[ErrorReport] = None,
    show_progress: bool = True,
    verbose: bool = False,
) -> int:
    """Upload converted items into Supabase DB + storage. Returns success count."""
    success = 0
    failed = 0

    def upload_single_item(item_idx: int, item: dict[str, Any]) -> bool:
        """Upload a single item. Returns True if successful."""
        nonlocal success, failed

        chapter_id = item.get("chapterId")
        if chapter_id is None:
            error_msg = "上传需要 chapterId，请提供 --chapter-map 或使用 --sync-db 生成映射。"
            if error_report:
                error_report.add_error(ConversionError(
                    source_id=item.get("meta", {}).get("sourceId", f"item_{item_idx}"),
                    error_type=ErrorType.VALIDATION_ERROR,
                    message=error_msg,
                    context={"item_index": item_idx, "chapter_id": chapter_id},
                ))
                failed += 1
                return False
            else:
                raise ValueError(error_msg)

        marks = item.get("marks")
        difficulty = item.get("difficulty") or 1
        calculator = bool(item.get("calculator", False))
        q_imgs = item.get("questionImages") or []
        a_imgs = item.get("answerImages") or []

        try:
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
            if q_error or not q_data or not isinstance(q_data, list) or len(q_data) == 0:
                message = getattr(q_error, "message", None) or "创建 question 失败"
                raise RuntimeError(message)
            q_id = q_data[0].get('id')
            if q_id is None:
                raise RuntimeError("创建 question 失败: 返回数据中没有 id 字段")

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
                if verbose:
                    console.print(f"[red]题目 #{q_id} 上传失败，已删除 question 记录。错误: {exc}[/red]")

                if error_report:
                    error_report.add_error(ConversionError(
                        source_id=item.get("meta", {}).get("sourceId", f"item_{item_idx}"),
                        error_type=ErrorType.UPLOAD_FAILED,
                        message=f"上传失败: {exc}",
                        context={
                            "question_id": q_id,
                            "chapter_id": chapter_id,
                            "item_index": item_idx,
                            "error_details": str(exc),
                        },
                    ))
                raise

            success += 1
            if error_report:
                error_report.add_success()
            if verbose:
                console.print(f"[green]已上传题目 #{q_id}[/green]")
            return True

        except Exception as exc:  # noqa: BLE001
            if error_report:
                error_report.add_error(ConversionError(
                    source_id=item.get("meta", {}).get("sourceId", f"item_{item_idx}"),
                    error_type=ErrorType.UPLOAD_FAILED,
                    message=f"上传失败: {exc}",
                    context={
                        "item_index": item_idx,
                        "chapter_id": chapter_id,
                        "error_details": str(exc),
                    },
                ))
                failed += 1
                if verbose:
                    console.print(f"[red]题目 #{item_idx} 上传失败: {exc}[/red]")
                return False
            else:
                raise

    if show_progress and len(items) > 0:
        with create_progress() as progress:
            task_id = progress.add_task("上传题目", total=len(items), success=0, failed=0)
            for item_idx, item in enumerate(items, start=1):
                upload_single_item(item_idx, item)
                progress.update(task_id, advance=1, success=success, failed=failed)
        console.print(f"[green]上传完成:[/green] {success}/{len(items)} 成功")
    else:
        for item_idx, item in enumerate(items, start=1):
            upload_single_item(item_idx, item)
        logger.info(f"上传完成: {success}/{len(items)} 成功")

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
    parser.add_argument(
        "--multi-select",
        action="store_true",
        default=True,
        help="启用多选subject模式（支持 1,3,5 或 1-3 格式），默认启用",
    )
    parser.add_argument(
        "--error-report",
        type=Path,
        default=Path("data/conversion_errors.json"),
        help="错误报告输出路径（默认：data/conversion_errors.json）",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        default=False,
        help="禁用进度条显示",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        default=False,
        help="显示详细日志（包括 HTTP 请求）",
    )
    parser.add_argument(
        "--generate-converted-json",
        action="store_true",
        default=False,
        help="生成中间converted JSON文件（默认不生成）",
    )
    parser.add_argument(
        "--subjects",
        type=str,
        default=None,
        help="直接指定subject ID（逗号分隔），跳过交互选择",
    )
    parser.add_argument(
        "--questions-file",
        type=Path,
        default=None,
        help="questions NDJSON 文件路径（默认：data/database_export-myquestionbank-9gcfve68fe4574af-questions.json）",
    )
    parser.add_argument(
        "--exams-file",
        type=Path,
        default=None,
        help="exams NDJSON 文件路径（默认：data/database_export-myquestionbank-9gcfve68fe4574af-exams.json）",
    )
    parser.add_argument(
        "--subjects-file",
        type=Path,
        default=None,
        help="subjects NDJSON 文件路径（默认：data/database_export-myquestionbank-9gcfve68fe4574af-subjects.json）",
    )
    parser.add_argument(
        "--tags-file",
        type=Path,
        default=None,
        help="tags NDJSON 文件路径（默认：data/database_export-myquestionbank-9gcfve68fe4574af-tags.json）",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    # 控制 HTTP 请求日志（httpx/httpcore）
    if not args.verbose:
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("hpack").setLevel(logging.WARNING)

    if args.env_file is None:
        logger.error("Error: Missing --env_file, please specify the environment variable file path.")
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
    # Determine file paths
    default_questions = data_dir / "database_export-myquestionbank-9gcfve68fe4574af-questions.json"
    default_exams = data_dir / "database_export-myquestionbank-9gcfve68fe4574af-exams.json"
    default_subjects = data_dir / "database_export-myquestionbank-9gcfve68fe4574af-subjects.json"
    default_tags = data_dir / "database_export-myquestionbank-9gcfve68fe4574af-tags.json"

    questions_path = args.questions_file or default_questions
    exams_path = args.exams_file or default_exams
    subjects_path = args.subjects_file or default_subjects
    tags_path = args.tags_file or default_tags
    supabase_client = None

    if args.sync_db or args.upload:
        if not supabase_url or not supabase_key:
            logger.error(
                "Error: Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables, cannot connect to Supabase."
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

    # 选择subjects（支持多种方式）
    chosen_subjects = []

    if args.subjects:
        # 通过--subjects参数直接指定
        subject_ids = [s.strip() for s in args.subjects.split(",") if s.strip()]
        for subject_id in subject_ids:
            found = [s for s in subject_rows if s["id"] == subject_id]
            if found:
                chosen_subjects.extend(found)
            else:
                logger.warning(f"未找到subject ID: {subject_id}")

        if not chosen_subjects:
            logger.error("未找到任何指定的subject，请检查--subjects参数")
            return
    else:
        # 交互式选择
        chosen_subjects = choose_multiple_options(
            subject_rows,
            enable_multi=args.multi_select
        )

    if not chosen_subjects:
        logger.info("未选择任何subject，退出。")
        return

    # 记录选择结果
    logger.info("\n已选择科目：")
    for i, chosen in enumerate(chosen_subjects, start=1):
        logger.info(f"  {i}. {chosen['exam']} - {chosen['name']} (ID: {chosen['id']}, 题目数: {chosen['total']})")

    # 为所有选中的subject获取配置信息
    subject_configs = []
    for chosen in chosen_subjects:
        subject_id = chosen["id"]
        subject_name = chosen["name"]
        exam_name = chosen["exam"]

        # 从tags获取章节和年份配置
        tag_chapters: list[str] = []
        tag_years: list[str] = []
        chapter_hierarchy: dict[str, list[str]] = {}  # parent -> [children]
        for tag in tags:
            if tag.get("subject") != subject_id:
                continue
            if tag.get("name") == "chapter":
                opts = tag.get("options") or []
                tag_chapters = flatten_options(opts)
                chapter_hierarchy = parse_chapter_hierarchy(opts)
            if tag.get("name") == "year":
                opts = tag.get("options") or []
                tag_years = flatten_options(opts)

        subject_configs.append({
            "subject_id": subject_id,
            "subject_name": subject_name,
            "exam_name": exam_name,
            "tag_chapters": tag_chapters,
            "tag_years": tag_years,
            "chapter_hierarchy": chapter_hierarchy,  # 新增：章节层级关系
            "total_questions": chosen["total"],
            "chapters": chosen["chapters"],
            "years": chosen["years"],
        })

    # 显示每个subject的配置信息
    for config in subject_configs:
        logger.info(f"\n科目: {config['exam_name']} - {config['subject_name']}")
        if config['tag_chapters']:
            logger.info(
                f"  章节（来自tags，{len(config['tag_chapters'])}个）: "
                f"{', '.join(config['tag_chapters'][:5])}"
                f"{' …' if len(config['tag_chapters']) > 5 else ''}"
            )
        else:
            top_chapters = ", ".join(
                name for name, _ in config['chapters'].most_common(5)) or "-"
            logger.info(f"  章节（从题目提取）: {top_chapters}")

        if config['tag_years']:
            logger.info(f"  年份（来自tags）: {', '.join(config['tag_years'][:5])}")
        else:
            top_years = ", ".join(
                year for year, _ in config['years'].most_common(5)) or "-"
            logger.info(f"  年份（从题目提取）: {top_years}")

    # 询问转换限制（对所有subject适用）
    total_questions = sum(c["total_questions"] for c in subject_configs)
    default_limit_label = (
        str(args.count) if args.count else f"全部({total_questions})"
    )
    try:
        limit_raw = input(
            f"要导出的总题目数量? [默认 {default_limit_label}]: ").strip()
        limit = int(limit_raw) if limit_raw else args.count
    except ValueError:
        logger.warning("输入非法，使用默认全部。")
        limit = args.count

    # 询问输出路径（仅在需要生成 JSON 时）
    output_path: Path | None = None
    if args.generate_converted_json:
        if len(subject_configs) == 1 and not args.output:
            default_output = data_dir / f"converted_{slugify(subject_configs[0]['subject_name'])}.json"
        else:
            default_output = args.output or (data_dir / "converted_multiple_subjects.json")

        output_path_raw = input(f"输出文件路径? [默认 {default_output}]: ").strip()
        output_path = Path(output_path_raw) if output_path_raw else Path(default_output)

    # 初始化错误报告
    error_report = ErrorReport()
    show_progress = not args.no_progress

    # subject_id -> database_id 映射（在 sync_db 模式下填充）
    subject_db_mappings: dict[str, int] = {}

    # 数据库同步（如果需要）
    if args.sync_db:
        if supabase_client is None:
            logger.error("Error: Missing Supabase configuration, cannot sync database.")
            return

        consent = input(
            "允许在 Supabase 创建缺失的 exam/subject/chapters 吗? (y/N): ").strip().lower()
        if consent not in {"y", "yes"}:
            logger.info("已取消同步数据库。")
            return

        logger.info("开始同步数据库...")

        # 为每个subject同步数据库
        exam_db_ids: dict[str, int] = {}  # exam_name -> database_id 映射

        for config in subject_configs:
            exam_name = config["exam_name"]
            subject_name = config["subject_name"]
            tag_chapters = config["tag_chapters"]
            subject_id = config["subject_id"]

            logger.info(f"\n同步科目: {exam_name} - {subject_name}")

            # 处理exam_board
            question_bank_value = resolve_question_bank_value(
                supabase_client,
                QUESTION_BANK_FOR_QUESTIONS,
                LEGACY_QUESTION_BANK_FOR_QUESTIONS,
            )

            if exam_name not in exam_db_ids:
                exam_resp = (
                    supabase_client.table("exam_boards")
                    .select("id")
                    .eq("name", exam_name)
                    .eq("question_bank", question_bank_value)
                    .execute()
                )
                data = getattr(exam_resp, 'data', [])
                if data and isinstance(data, list) and len(data) > 0:
                    exam_id = data[0].get('id')
                else:
                    exam_id = None
                if not exam_id:
                    try:
                        insert_exam = (
                            supabase_client.table("exam_boards")
                            .insert(
                                {"name": exam_name, "question_bank": question_bank_value},
                            )
                            .execute()
                        )
                        insert_data = getattr(insert_exam, 'data', [])
                        if insert_data and isinstance(insert_data, list) and len(insert_data) > 0:
                            exam_id = insert_data[0].get('id')
                        else:
                            exam_id = None
                        if exam_id:
                            logger.info(f"已创建 exam_board: {exam_name} (id={exam_id})")
                        else:
                            raise RuntimeError(f"Failed to create exam_board: {exam_name}, no data returned")
                    except Exception as exc:  # noqa: BLE001
                        logger.error(f"Error: Failed to create exam_board: {exc}")
                        error_report.add_error(ConversionError(
                            source_id=f"exam_{exam_name}",
                            error_type=ErrorType.DATABASE_ERROR,
                            message=f"Failed to create exam_board: {exc}",
                            context={"exam_name": exam_name},
                        ))
                        continue
                else:
                    logger.info(f"已存在 exam_board: {exam_name} (id={exam_id})")
                exam_db_ids[exam_name] = exam_id
            else:
                exam_id = exam_db_ids[exam_name]

            # 处理subject
            subject_resp = (
                supabase_client.table("subjects")
                .select("id")
                .eq("name", subject_name)
                .eq("exam_board_id", exam_id)
                .execute()
            )
            subject_data = getattr(subject_resp, 'data', [])
            if subject_data and isinstance(subject_data, list) and len(subject_data) > 0:
                subject_db_id = subject_data[0].get('id')
            else:
                subject_db_id = None
            if not subject_db_id:
                try:
                    insert_subj = (
                        supabase_client.table("subjects")
                        .insert({"name": subject_name, "exam_board_id": exam_id})
                        .execute()
                    )
                    insert_subj_data = getattr(insert_subj, 'data', [])
                    if insert_subj_data and isinstance(insert_subj_data, list) and len(insert_subj_data) > 0:
                        subject_db_id = insert_subj_data[0].get('id')
                    else:
                        subject_db_id = None
                    if subject_db_id:
                        logger.info(f"已创建 subject: {subject_name} (id={subject_db_id})")
                    else:
                        raise RuntimeError(f"Failed to create subject: {subject_name}, no data returned")
                except Exception as exc:  # noqa: BLE001
                    logger.error(f"Error: Failed to create subject: {exc}")
                    error_report.add_error(ConversionError(
                        source_id=subject_id,
                        error_type=ErrorType.DATABASE_ERROR,
                        message=f"Failed to create subject: {exc}",
                        context={"subject_name": subject_name, "exam_id": exam_id},
                    ))
                    continue
            else:
                logger.info(f"已存在 subject: {subject_name} (id={subject_db_id})")

            subject_db_mappings[subject_id] = subject_db_id

            # 处理chapters（使用 tags 中的层级关系）
            chapter_hierarchy: dict[str, list[str]] = config.get("chapter_hierarchy", {})

            # 从 hierarchy 提取 parent 和 sub-chapter
            parent_chapters: list[str] = chapter_hierarchy.get("", [])  # 顶级章节
            sub_chapters: dict[str, str] = {}  # sub_name -> parent_name
            for parent_name, children in chapter_hierarchy.items():
                if parent_name == "":
                    continue  # 跳过顶级列表
                for child_name in children:
                    sub_chapters[child_name] = parent_name

            # 获取数据库中已存在的章节（包括 parent_chapter_id）
            chapter_resp = (
                supabase_client.table("chapters")
                .select("id,name,position,parent_chapter_id")
                .eq("subject_id", subject_db_id)
                .execute()
            )
            chapter_data = getattr(chapter_resp, 'data', [])
            if not isinstance(chapter_data, list):
                chapter_data = []

            # 构建现有章节映射：name -> (id, position, parent_id)
            existing_by_name: dict[str, tuple[int, int, int | None]] = {}
            existing_by_id: dict[int, str] = {}
            for row in chapter_data:
                if isinstance(row, dict):
                    name = row.get('name')
                    row_id = row.get('id')
                    position = row.get('position', 0)
                    parent_id = row.get('parent_chapter_id')
                    if isinstance(position, (int, float)):
                        position = int(position)
                    else:
                        position = 0
                    if name is not None and row_id is not None:
                        existing_by_name[str(name)] = (int(row_id), position, parent_id)
                        existing_by_id[int(row_id)] = str(name)

            # 构建 local_chapter_map，使用 parent@sub 格式作为 key
            local_chapter_map: dict[str, int] = {}
            for name, (cid, _, parent_id) in existing_by_name.items():
                if parent_id is not None and parent_id in existing_by_id:
                    # 这是一个 sub-chapter，使用 parent@sub 格式
                    parent_name = existing_by_id[parent_id]
                    full_key = get_chapter_key(parent_name, name)
                    local_chapter_map[full_key] = cid
                    # 也添加仅 sub-chapter 名称的映射（用于回退查找）
                    local_chapter_map[name] = cid
                else:
                    # 这是一个 parent chapter
                    local_chapter_map[name] = cid

            if existing_by_name:
                logger.info(f"已存在 {len(existing_by_name)} 个章节")

            # 第一步：创建缺失的 parent chapters（保持原始顺序）
            missing_parents = [p for p in parent_chapters if p and p not in existing_by_name]
            if missing_parents:
                if existing_by_name:
                    max_pos = max(pos for _, pos, _ in existing_by_name.values())
                    next_pos = max_pos + 1
                else:
                    next_pos = 1
                to_insert = [
                    {"name": name, "subject_id": subject_db_id,
                        "position": idx + next_pos, "parent_chapter_id": None}
                    for idx, name in enumerate(missing_parents)
                ]
                try:
                    insert_resp = supabase_client.table("chapters").insert(to_insert).execute()
                    insert_data = getattr(insert_resp, 'data', [])
                    if not isinstance(insert_data, list):
                        insert_data = []

                    for row in insert_data:
                        if isinstance(row, dict):
                            name = row.get('name')
                            row_id = row.get('id')
                            pos = row.get('position', 0)
                            if name is not None and row_id is not None:
                                existing_by_name[str(name)] = (int(row_id), pos, None)
                                existing_by_id[int(row_id)] = str(name)
                                local_chapter_map[str(name)] = int(row_id)
                                logger.info(f"已创建父章节: {name} (id={row_id})")
                    logger.info(f"已创建 {len(missing_parents)} 个父章节")
                except Exception as exc:  # noqa: BLE001
                    logger.error(f"Error: Failed to create parent chapters: {exc}")
                    error_report.add_error(ConversionError(
                        source_id=subject_id,
                        error_type=ErrorType.DATABASE_ERROR,
                        message=f"Failed to create parent chapters: {exc}",
                        context={
                            "subject_name": subject_name,
                            "missing_parents": missing_parents,
                        },
                    ))
                    continue

            # 第二步：创建缺失的 sub-chapters
            missing_subs: list[tuple[str, str]] = []  # (sub_name, parent_name)
            for sub_name, parent_name in sub_chapters.items():
                full_key = get_chapter_key(parent_name, sub_name)
                if full_key not in local_chapter_map and sub_name not in existing_by_name:
                    missing_subs.append((sub_name, parent_name))

            if missing_subs:
                # 获取最大 position
                if existing_by_name:
                    max_pos = max(pos for _, pos, _ in existing_by_name.values())
                    next_pos = max_pos + 1
                else:
                    next_pos = 1

                to_insert = []
                for idx, (sub_name, parent_name) in enumerate(missing_subs):
                    parent_info = existing_by_name.get(parent_name)
                    parent_id = parent_info[0] if parent_info else None
                    if parent_id is None:
                        logger.warning(f"无法找到父章节 '{parent_name}'，跳过子章节 '{sub_name}'")
                        continue
                    to_insert.append({
                        "name": sub_name,
                        "subject_id": subject_db_id,
                        "position": idx + next_pos,
                        "parent_chapter_id": parent_id,
                    })

                if to_insert:
                    try:
                        insert_resp = supabase_client.table("chapters").insert(to_insert).execute()
                        insert_data = getattr(insert_resp, 'data', [])
                        if not isinstance(insert_data, list):
                            insert_data = []

                        for row in insert_data:
                            if isinstance(row, dict):
                                name = row.get('name')
                                row_id = row.get('id')
                                parent_id = row.get('parent_chapter_id')
                                if name is not None and row_id is not None and parent_id is not None:
                                    parent_name = existing_by_id.get(parent_id, "")
                                    full_key = get_chapter_key(parent_name, str(name))
                                    local_chapter_map[full_key] = int(row_id)
                                    local_chapter_map[str(name)] = int(row_id)
                                    logger.info(f"已创建子章节: {name} (id={row_id}, parent={parent_name})")
                        logger.info(f"已创建 {len(to_insert)} 个子章节")
                    except Exception as exc:  # noqa: BLE001
                        logger.error(f"Error: Failed to create sub-chapters: {exc}")
                        error_report.add_error(ConversionError(
                            source_id=subject_id,
                            error_type=ErrorType.DATABASE_ERROR,
                            message=f"Failed to create sub-chapters: {exc}",
                            context={
                                "subject_name": subject_name,
                                "missing_subs": [s[0] for s in missing_subs],
                            },
                        ))
                        continue

            # 更新全局chapter_map（如果提供了外部映射，优先使用）
            if not chapter_map:  # 如果未提供外部映射，使用数据库映射
                # 确保类型兼容：local_chapter_map -> dict[str, int]
                typed_local_map = {str(k): int(v) for k, v in local_chapter_map.items()}
                chapter_map.update(typed_local_map)

        logger.info(f"数据库同步完成: {len(subject_db_mappings)}/{len(subject_configs)} 个subject同步成功")

    # 转换所有选中的subject
    logger.info("\n开始转换题目（仅保留图片齐全的题目）...")
    all_converted = []
    all_missing_images = set()

    for config in subject_configs:
        subject_id = config["subject_id"]
        subject_name = config["subject_name"]

        logger.info(f"\n转换科目: {subject_name}")

        # 如果有数据库映射，使用数据库中的subject_id
        db_subject_id = subject_db_mappings.get(subject_id)
        effective_chapter_map = chapter_map

        converted, missing_images = convert_subject(
            subject_id=subject_id,
            questions_path=questions_path,
            image_root=image_root,
            chapter_map=effective_chapter_map,
            limit=limit,  # 注意：这里的limit是所有subject共享的
            error_report=error_report,
            show_progress=show_progress,
            subject_name=subject_name,
        )

        # 如果使用了数据库同步，更新converted中的subject引用
        if db_subject_id:
            for item in converted:
                if "meta" in item:
                    item["meta"]["db_subject_id"] = db_subject_id

        all_converted.extend(converted)
        all_missing_images.update(missing_images)

        logger.info(f"科目 {subject_name} 转换完成: {len(converted)} 个题目")

    # 保存转换结果（如果启用）
    if args.generate_converted_json and output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(
            all_converted, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info(f"已写入 {len(all_converted)} 条题目到 {output_path}")
    else:
        logger.info(f"转换完成: {len(all_converted)} 个题目（未生成中间JSON文件）")

    # 上传到Supabase（如果需要）
    if args.upload:
        if supabase_client is None:
            logger.error(
                "Error: Upload requires Supabase configuration, please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
            return

        # 检查是否有缺少chapterId的题目
        missing_chapter_items = [i for i, item in enumerate(all_converted) if item.get("chapterId") is None]
        if missing_chapter_items:
            logger.warning(f"Warning: {len(missing_chapter_items)} questions are missing chapterId")
            if error_report:
                for idx in missing_chapter_items[:10]:  # 只报告前10个
                    item = all_converted[idx]
                    error_report.add_error(ConversionError(
                        source_id=item.get("meta", {}).get("sourceId", f"item_{idx+1}"),
                        error_type=ErrorType.VALIDATION_ERROR,
                        message="Missing chapterId, cannot upload",
                        context={"item_index": idx + 1, "subject": item.get("meta", {}).get("subject")},
                    ))
            logger.warning("These questions will be skipped during upload")
            # 过滤掉缺少chapterId的题目
            upload_items_list = [item for item in all_converted if item.get("chapterId") is not None]
        else:
            upload_items_list = all_converted

        if not upload_items_list:
            logger.error("Error: No valid questions to upload (all questions are missing chapterId)")
            return

        logger.info(
            f"开始上传到 Supabase（question_bucket={question_bucket}, answer_bucket={answer_bucket}）..."
        )
        try:
            uploaded = upload_items(
                supabase_client,
                upload_items_list,
                question_bucket=question_bucket,
                answer_bucket=answer_bucket,
                error_report=error_report,
                show_progress=show_progress,
                verbose=args.verbose,
            )
            console.print(f"[green]上传完成:[/green] {uploaded}/{len(upload_items_list)} 条。")
        except Exception as exc:  # noqa: BLE001
            logger.exception(f"Error: Upload failed: {exc}")
            # 错误已通过error_report记录

    # 保存错误报告
    if error_report.total_processed > 0:
        error_report.save(args.error_report)

    # 最终统计
    logger.info(f"\n{'='*50}")
    logger.info("转换统计:")
    logger.info(f"  处理科目数: {len(subject_configs)}")
    logger.info(f"  总题目数: {error_report.total_processed}")
    logger.info(f"  成功转换: {error_report.successful}")
    logger.info(f"  失败: {error_report.failed}")

    if not chapter_map and not args.sync_db:
        logger.warning(
            "Warning: No chapter-map provided, chapterId will be null, only chapterName is preserved. Please map chapter IDs before import.")
    if all_missing_images:
        missing_list = ", ".join(sorted(list(all_missing_images))[:10])  # 只显示前10个
        logger.warning(
            f"Warning: {len(all_missing_images)} images not found in {image_root} (examples: {missing_list}...)")
        logger.info("(These questions have been skipped)")
    else:
        logger.info("Image/chapter check: All found.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n已中断。")
