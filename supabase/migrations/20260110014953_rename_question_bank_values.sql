-- Rename question bank enum values to match new naming.
ALTER TYPE public.question_bank
  RENAME VALUE 'past paper questions' TO 'questionbank';

ALTER TYPE public.question_bank
  RENAME VALUE 'topical questions' TO 'checkpoint';

-- Update stored text values in generated papers.
UPDATE public.generated_papers
SET question_bank = 'questionbank'
WHERE question_bank = 'past paper questions';

UPDATE public.generated_papers
SET question_bank = 'checkpoint'
WHERE question_bank = 'topical questions';

COMMENT ON COLUMN public.generated_papers.question_bank IS
  'Question bank used: "questionbank", "checkpoint", or "exam paper"';
