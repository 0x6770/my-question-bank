-- Fix regex on exam_papers PDF constraints (previous pattern was over-escaped).

ALTER TABLE public.exam_papers
  DROP CONSTRAINT IF EXISTS question_pdf_only,
  DROP CONSTRAINT IF EXISTS mark_scheme_pdf_only;

ALTER TABLE public.exam_papers
  ADD CONSTRAINT question_pdf_only CHECK (
    question_paper_path IS NULL
    OR lower(question_paper_path) LIKE '%.pdf'
  ),
  ADD CONSTRAINT mark_scheme_pdf_only CHECK (
    mark_scheme_path IS NULL
    OR lower(mark_scheme_path) LIKE '%.pdf'
  );
