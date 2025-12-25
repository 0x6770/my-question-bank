#!/usr/bin/env bash
set -euo pipefail
set -x

# Run the bulk import with default paths.
# Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

uv run --project "${SCRIPT_DIR}" "${SCRIPT_DIR}/bulk_import_exam_papers.py" \
  --env-file  "${PROJECT_ROOT}/.env.production" \
  --questions "${PROJECT_ROOT}/data/database_export-myquestionbank-9gcfve68fe4574af-questions.json" \
  --exams     "${PROJECT_ROOT}/data/database_export-myquestionbank-9gcfve68fe4574af-exams.json" \
  --subjects  "${PROJECT_ROOT}/data/database_export-myquestionbank-9gcfve68fe4574af-subjects.json" \
  --pdf-dir   images/pdf \
  --errors    errors_exam_papers.json \
  --n-paper   100 \
  # --dry-run \
  --auto-create \
