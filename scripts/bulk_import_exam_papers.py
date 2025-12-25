#!/usr/bin/env python3
"""Bulk import exam papers from legacy backup (questionBank == 2) with upfront planning.

流程（尽量减少往返查询）：
1) 读取 questions NDJSON（questionBank==2）、exams NDJSON、subjects NDJSON，收集：
   - 需要的 exam 名称
   - 需要的 subject 名称（按 exam 名称分组）
   - 每个 subject 需要的默认标签及其值：paper / season / year / time zone
2) 收集完所需 exam/subject/tag/tag_value 后直接 upsert 覆盖写入（dry-run 不写库）。
3) 创建 tag/tag_value 后缓存 id。
4) 再遍历记录：先上传 PDF（本地 images/pdf/<filename>），再创建 exam_papers，写入 exam_paper_tag_values。
5) 错误/缺失写入 errors_exam_papers.json，继续下一条。

要求环境变量：SUPABASE_URL、SUPABASE_SECRET_KEY。
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import uuid
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional

from dotenv import load_dotenv
from supabase import Client, create_client  # type: ignore

logger = logging.getLogger("bulk_import_exam_papers")

DEFAULT_TAGS = ["paper", "season", "year", "time zone"]
QUESTION_BANK_EXAM_PAPERS = "exam paper"


# -------------------- Utils -------------------- #
def load_ndjson_stream(path: Path) -> Iterable[dict[str, Any]]:
  decoder = json.JSONDecoder()
  text = path.read_text(encoding="utf-8").lstrip()
  while text:
    obj, idx = decoder.raw_decode(text)
    yield obj
    text = text[idx:].lstrip()


def parse_year(value: Any) -> Optional[int]:
  try:
    return int(str(value).strip())
  except Exception:
    return None


# -------------------- Data classes -------------------- #
@dataclass
class LegacyExam:
  id: str
  name: str


@dataclass
class LegacySubject:
  id: str
  name: str
  exam_id: str


@dataclass
class Record:
  raw: dict[str, Any]
  subject_old: str
  exam_old: str
  paper: str
  season: str
  year: int
  timezone: str | None
  question_url: str | None
  answer_url: str | None


# -------------------- Supabase helpers -------------------- #
def require_service_key(url: str | None, key: str | None) -> Client:
  if not url or not key:
    raise SystemExit("❌ SUPABASE_URL / SUPABASE_SECRET_KEY 缺失")
  return create_client(url, key)


def ensure_exam_board(client: Client, name: str, dry_run: bool) -> Optional[int]:
  if dry_run:
    logger.info("[dry-run] 创建 exam_board: %s", name)
    return None
  payload = {"name": name, "question_bank": QUESTION_BANK_EXAM_PAPERS}
  resp = client.table("exam_boards").upsert(payload, on_conflict="name").execute()
  data = resp.data or []
  return data[0]["id"] if data else None


def ensure_subject(client: Client, name: str, exam_board_id: Optional[int], dry_run: bool) -> Optional[int]:
  if dry_run:
    logger.info("[dry-run] 创建 subject: %s (exam_board_id=%s)", name, exam_board_id)
    return None
  payload: dict[str, Any] = {"name": name}
  if exam_board_id is not None:
    payload["exam_board_id"] = exam_board_id
  resp = client.table("subjects").upsert(payload, on_conflict="name,exam_board_id").execute()
  data = resp.data or []
  return data[0]["id"] if data else None


def ensure_tag(client: Client, subject_id: int, name: str, position: int, dry_run: bool) -> Optional[int]:
  if dry_run:
    logger.info("[dry-run] 创建 tag: subject=%s name=%s", subject_id, name)
    return None
  resp = (
    client.table("subject_exam_tags")
    .upsert({"subject_id": subject_id, "name": name, "position": position}, on_conflict="subject_id,name")
    .execute()
  )
  data = resp.data or []
  return data[0]["id"] if data else None


def ensure_tag_value(client: Client, tag_id: int, value: str, dry_run: bool) -> Optional[int]:
  if dry_run:
    logger.info("[dry-run] 创建 tag value: tag_id=%s value=%s", tag_id, value)
    return None
  resp = (
    client.table("subject_exam_tag_values")
    .upsert({"tag_id": tag_id, "value": value}, on_conflict="tag_id,value")
    .execute()
  )
  data = resp.data or []
  return data[0]["id"] if data else None


# -------------------- Core logic -------------------- #
def collect_records(questions_path: Path, exams: dict[str, LegacyExam], subjects: dict[str, LegacySubject]):
  records: list[Record] = []
  errors: list[dict[str, Any]] = []
  required_exams: set[str] = set()
  required_subjects: dict[str, set[str]] = defaultdict(set)  # exam_name -> subject_names
  required_tag_values: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))  # subject_old_id -> tag -> values

  for rec in load_ndjson_stream(questions_path):
    if rec.get("questionBank") != 2:
      continue
    props = rec.get("properties") or {}
    paper = props.get("paper")
    season = props.get("season")
    year = props.get("year")
    tz = props.get("timezone")
    subject_old = rec.get("subject")
    exam_old = rec.get("exam")
    question_url = (rec.get("question") or {}).get("url")
    answer_url = (rec.get("answer") or {}).get("url")

    year_int = parse_year(year)
    if not subject_old or not exam_old or not paper or not season or year_int is None or not question_url:
      errors.append({"reason": "missing fields/question url", "record": rec})
      continue

    subj_obj = subjects.get(str(subject_old))
    exam_obj = exams.get(str(exam_old))
    if not subj_obj or not exam_obj:
      errors.append({"reason": "legacy subject/exam not found", "record": rec})
      continue

    required_exams.add(exam_obj.name)
    required_subjects[exam_obj.name].add(subj_obj.name)
    required_tag_values[subj_obj.id]["paper"].add(str(paper))
    required_tag_values[subj_obj.id]["season"].add(str(season))
    required_tag_values[subj_obj.id]["year"].add(str(year))
    if tz is not None:
      required_tag_values[subj_obj.id]["time zone"].add(str(tz))

    records.append(
      Record(
        raw=rec,
        subject_old=subj_obj.id,
        exam_old=exam_obj.id,
        paper=str(paper),
        season=str(season),
        year=year_int,
        timezone=str(tz) if tz is not None else None,
        question_url=question_url,
        answer_url=answer_url,
      )
    )

  return records, errors, required_exams, required_subjects, required_tag_values


def main():
  parser = argparse.ArgumentParser(description="Bulk import exam papers (questionBank==2)")
  parser.add_argument("--env-file", default=".env.development", help="Env file")
  parser.add_argument("--questions", default="data/database_export-myquestionbank-9gcfve68fe4574af-questions.json")
  parser.add_argument("--exams", default="data/database_export-myquestionbank-9gcfve68fe4574af-exams.json")
  parser.add_argument("--subjects", default="data/database_export-myquestionbank-9gcfve68fe4574af-subjects.json")
  parser.add_argument("--pdf-dir", default="images/pdf")
  parser.add_argument("--errors", default="errors_exam_papers.json")
  parser.add_argument("--dry-run", action="store_true")
  parser.add_argument("--auto-create", action="store_true", help="缺失对象自动创建（非 dry-run 时生效）")
  parser.add_argument("--n-paper", "--n_paper", type=int, help="限制上传的 exam paper 数量（按成功导入计数）")
  args = parser.parse_args()

  logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

  env_path = Path(args.env_file)
  if env_path.exists():
    load_dotenv(env_path)
  else:
    logger.info("环境文件未找到：%s", env_path)

  questions_path = Path(args.questions)
  exams_path = Path(args.exams)
  subjects_path = Path(args.subjects)
  pdf_dir = Path(args.pdf_dir)
  errors_path = Path(args.errors)

  # load legacy exams/subjects
  exams: dict[str, LegacyExam] = {}
  for obj in load_ndjson_stream(exams_path):
    if obj.get("_id") and obj.get("name"):
      exams[str(obj["_id"])] = LegacyExam(id=str(obj["_id"]), name=str(obj["name"]))

  subjects: dict[str, LegacySubject] = {}
  for obj in load_ndjson_stream(subjects_path):
    if obj.get("_id") and obj.get("name"):
      subjects[str(obj["_id"])] = LegacySubject(
        id=str(obj["_id"]),
        name=str(obj["name"]),
        exam_id=str(obj.get("exam")) if obj.get("exam") else "",
      )

  records, early_errors, required_exams, required_subjects, required_tag_values = collect_records(
    questions_path, exams, subjects
  )

  # Supabase
  supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
  supabase_key = os.getenv("SUPABASE_SECRET_KEY")
  client: Client | None = None
  if not args.dry_run:
    client = require_service_key(supabase_url, supabase_key)
  else:
    if supabase_url and supabase_key:
      client = require_service_key(supabase_url, supabase_key)
    else:
      client = None

  def append_error(rec: dict[str, Any], reason: str):
    errors_path.parent.mkdir(parents=True, exist_ok=True)
    with errors_path.open("a", encoding="utf-8") as f:
      f.write(json.dumps({"reason": reason, "record": rec}, ensure_ascii=False) + "\n")

  # 将前期错误也写入 NDJSON
  for err in early_errors:
    append_error(err["record"], err["reason"])

  # bulk upsert exam boards
  exam_name_to_id: dict[str, Optional[int]] = {}
  if not args.dry_run and client:
    for exam_name in required_exams:
      new_id = ensure_exam_board(client, exam_name, dry_run=False)
      if not new_id:
        logger.info("创建 exam_board 失败: %s", exam_name)
      exam_name_to_id[exam_name] = new_id
  else:
    for exam_name in required_exams:
      logger.info("[dry-run] 覆盖 exam_board: %s", exam_name)
      exam_name_to_id[exam_name] = None

  # bulk upsert subjects
  subject_old_to_new: dict[str, Optional[int]] = {}
  dummy_subject_id = -1
  for subj_id, subj in subjects.items():
    if subj_id not in required_tag_values:
      continue
    exam_name = exams.get(subj.exam_id).name if subj.exam_id in exams else None
    eb_id = exam_name_to_id.get(exam_name) if exam_name else None
    if not args.dry_run and client:
      new_id = ensure_subject(client, subj.name, eb_id, dry_run=False)
      if not new_id:
        logger.info("创建 subject 失败: %s (exam=%s)", subj.name, exam_name)
      subject_old_to_new[subj_id] = new_id
    else:
      logger.info("[dry-run] 覆盖 subject: %s (exam=%s)", subj.name, exam_name)
      subject_old_to_new[subj_id] = dummy_subject_id
      dummy_subject_id -= 1

  # ensure tags and tag values per subject (upsert)
  tag_cache: dict[int, dict[str, dict[str, Any]]] = {}
  tag_value_cache: dict[int, dict[str, dict[str, int]]] = {}
  dummy_tag_id = -1
  dummy_value_id = -1
  for subj_old, tags_needed in required_tag_values.items():
    subj_new = subject_old_to_new.get(subj_old)
    if not subj_new:
      continue
    tag_cache[subj_new] = {}
    tag_value_cache[subj_new] = {}
    pos_map = {name: idx for idx, name in enumerate(DEFAULT_TAGS, start=1)}
    for tag_name in DEFAULT_TAGS:
      if not args.dry_run and client:
        tag_id = ensure_tag(client, subj_new, tag_name, pos_map[tag_name], dry_run=False)
        if not tag_id:
          logger.info("创建 tag 失败: subject=%s tag=%s", subj_new, tag_name)
          continue
      else:
        logger.info("[dry-run] 覆盖 tag: subject=%s tag=%s", subj_new, tag_name)
        tag_id = dummy_tag_id
        dummy_tag_id -= 1
      tag_cache[subj_new][tag_name] = {"id": tag_id, "name": tag_name, "values": []}
      tag_value_cache[subj_new][tag_name] = {}
    for tag_name, values in tags_needed.items():
      tag = tag_cache[subj_new].get(tag_name)
      if not tag:
        continue
      cache = tag_value_cache[subj_new].setdefault(tag_name, {})
      for val in values:
        if not args.dry_run and client:
          new_id = ensure_tag_value(client, tag["id"], val, dry_run=False)
        else:
          logger.info("[dry-run] 覆盖 tag value: subject=%s tag=%s value=%s", subj_new, tag_name, val)
          new_id = dummy_value_id
          dummy_value_id -= 1
        if new_id:
          cache[val] = new_id

  # process records -> uploads then insert exam_papers
  pdf_missing = 0
  result = {"processed": 0, "imported": 0, "skipped": 0, "failed": 0}
  for rec in records:
    if args.n_paper is not None and result["imported"] >= args.n_paper:
      logger.info("达到 n_paper 上限（%s），提前结束", args.n_paper)
      break
    result["processed"] += 1
    subj_new = subject_old_to_new.get(rec.subject_old)
    if not subj_new:
      append_error(rec.raw, "subject unresolved")
      result["failed"] += 1
      continue
    tags = tag_cache.get(subj_new, {})
    vals = tag_value_cache.get(subj_new, {})
    try:
      paper_tag_id = vals.get("paper", {}).get(rec.paper)
      season_tag_id = vals.get("season", {}).get(rec.season)
      year_tag_id = vals.get("year", {}).get(str(rec.year))
      tz_tag_id = vals.get("time zone", {}).get(rec.timezone) if rec.timezone else None
      if not (paper_tag_id and season_tag_id and year_tag_id):
        append_error(rec.raw, "tag value missing")
        result["failed"] += 1
        continue

      def local_pdf(url: str | None) -> Optional[Path]:
        if not url:
          return None
        return pdf_dir / Path(url).name

      qp_local = local_pdf(rec.question_url)
      ms_local = local_pdf(rec.answer_url)
      if qp_local is None:
        append_error(rec.raw, "question pdf missing (url absent)")
        result["failed"] += 1
        continue
      missing_files = []
      if not qp_local.exists():
        missing_files.append(str(qp_local))
      if ms_local and not ms_local.exists():
        missing_files.append(str(ms_local))
      if missing_files:
        append_error(rec.raw, f"missing pdf {missing_files}")
        result["failed"] += 1
        pdf_missing += 1
        continue

      uploaded_paths: list[str] = []
      question_path = None
      mark_path = None
      if not args.dry_run and client:
        dup = (
          client.table("exam_papers")
          .select("id")
          .eq("subject_id", subj_new)
          .eq("year", rec.year)
          .eq("season", rec.season)
          .eq("paper_code", rec.paper)
          .limit(1)
          .execute()
        )
        if dup.data:
          result["skipped"] += 1
          continue
        upload_prefix = f"imports/{uuid.uuid4().hex}"
        question_path = f"{upload_prefix}/question.pdf"
        mark_path = f"{upload_prefix}/mark-scheme.pdf" if ms_local else None
        if qp_local:
          try:
            with qp_local.open("rb") as f:
              resp = client.storage.from_("exam_papers").upload(
                question_path, f, file_options={"content-type": "application/pdf"}
              )
            # supabase-py may return dict or object with error attribute
            if isinstance(resp, dict) and resp.get("error"):
              raise Exception(resp["error"])
            uploaded_paths.append(question_path)
          except Exception as exc:  # noqa: BLE001
            append_error(rec.raw, f"upload question failed: {exc}")
            result["failed"] += 1
            continue
        if ms_local and mark_path:
          try:
            with ms_local.open("rb") as f:
              resp = client.storage.from_("exam_papers").upload(
                mark_path, f, file_options={"content-type": "application/pdf"}
              )
            if isinstance(resp, dict) and resp.get("error"):
              raise Exception(resp["error"])
            uploaded_paths.append(mark_path)
          except Exception as exc:  # noqa: BLE001
            append_error(rec.raw, f"upload mark scheme failed: {exc}")
            result["failed"] += 1
            if uploaded_paths:
              try:
                client.storage.from_("exam_papers").remove(uploaded_paths)
              except Exception:  # noqa: BLE001
                logger.info("清理上传文件失败: %s", uploaded_paths)
            continue
      else:
        logger.info(
          "[dry-run] 上传/创建 exam_paper subject=%s year=%s season=%s paper=%s tz=%s",
          subj_new,
          rec.year,
          rec.season,
          rec.paper,
          rec.timezone,
        )

      paper_id = None
      if not args.dry_run and client and question_path:
        try:
          insert_resp = (
            client.table("exam_papers")
            .insert(
              {
                "subject_id": subj_new,
                "year": rec.year,
                "season": rec.season,
                "paper_code": rec.paper,
                "paper_label": rec.paper,
                "time_zone": rec.timezone,
                "question_paper_path": question_path,
                "mark_scheme_path": mark_path,
              }
            )
            .execute()
          )
          paper_id = insert_resp.data[0]["id"]
        except Exception as exc:  # noqa: BLE001
          append_error(rec.raw, f"create exam paper failed: {exc}")
          result["failed"] += 1
          if uploaded_paths:
            try:
              client.storage.from_("exam_papers").remove(uploaded_paths)
            except Exception:  # noqa: BLE001
              logger.info("清理上传文件失败: %s", uploaded_paths)
          continue

      if not args.dry_run and client and paper_id:
        tv_rows = [{"exam_paper_id": paper_id, "tag_value_id": tv} for tv in [paper_tag_id, season_tag_id, year_tag_id] if tv]
        if tz_tag_id:
          tv_rows.append({"exam_paper_id": paper_id, "tag_value_id": tz_tag_id})
        if tv_rows:
          try:
            client.table("exam_paper_tag_values").upsert(tv_rows, on_conflict="exam_paper_id,tag_value_id").execute()
          except Exception as exc:  # noqa: BLE001
            append_error(rec.raw, f"tag value upsert failed: {exc}")
            result["failed"] += 1
            try:
              client.table("exam_papers").delete().eq("id", paper_id).execute()
            except Exception:  # noqa: BLE001
              logger.info("回滚 exam_paper 失败: %s", paper_id)
            if uploaded_paths:
              try:
                client.storage.from_("exam_papers").remove(uploaded_paths)
              except Exception:  # noqa: BLE001
                logger.info("清理上传文件失败: %s", uploaded_paths)
            continue

      result["imported"] += 1
    except Exception as exc:  # noqa: BLE001
      append_error(rec.raw, f"异常: {exc}")
      result["failed"] += 1
      continue

  logger.info("完成：processed=%s imported=%s skipped=%s failed=%s missing_pdf=%s", result["processed"], result["imported"], result["skipped"], result["failed"], pdf_missing)


if __name__ == "__main__":
  main()
