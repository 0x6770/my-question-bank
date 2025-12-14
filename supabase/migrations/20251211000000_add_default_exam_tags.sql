-- Ensure every subject has baseline exam tags: paper, season, year, time zone.

-- Helper function to insert defaults for one subject
CREATE OR REPLACE FUNCTION public.ensure_default_exam_tags_for_subject()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.subject_exam_tags (subject_id, name, position)
  SELECT NEW.id, tag_name, ord::smallint
  FROM unnest(ARRAY['paper','season','year','time zone']) WITH ORDINALITY AS t(tag_name, ord)
  ON CONFLICT (subject_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill for existing subjects
INSERT INTO public.subject_exam_tags (subject_id, name, position)
SELECT s.id, t.tag_name, t.ord::smallint
FROM public.subjects s
CROSS JOIN LATERAL (
  SELECT tag_name, ord
  FROM unnest(ARRAY['paper','season','year','time zone']) WITH ORDINALITY AS t(tag_name, ord)
) t
ON CONFLICT (subject_id, name) DO NOTHING;

-- Trigger for future subjects
DROP TRIGGER IF EXISTS ensure_default_exam_tags_for_subject ON public.subjects;
CREATE TRIGGER ensure_default_exam_tags_for_subject
AFTER INSERT ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.ensure_default_exam_tags_for_subject();
