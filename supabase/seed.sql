WITH eb AS (
  INSERT INTO public.exam_boards (name, question_bank)
  VALUES ('Alevel', 'topical questions')
  ON CONFLICT (name, question_bank) DO UPDATE
    SET name = EXCLUDED.name,
        question_bank = EXCLUDED.question_bank
  RETURNING id
),
sub AS (
  INSERT INTO public.subjects (exam_board_id, name)
  SELECT id, 'Mathematics'
  FROM eb
  ON CONFLICT (exam_board_id, name) DO UPDATE
    SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO public.chapters (subject_id, parent_chapter_id, name, position)
SELECT id, NULL, 'Introduction', 1
FROM sub
ON CONFLICT (subject_id, name) DO UPDATE
  SET name = EXCLUDED.name
RETURNING *;
