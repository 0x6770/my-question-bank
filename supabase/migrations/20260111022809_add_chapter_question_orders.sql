-- Add per-chapter question ordering (independent across chapter/sub-chapter).

-- ============================================================================
-- 1) TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chapter_question_orders (
  chapter_id  bigint NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  question_id bigint NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chapter_question_orders_pkey PRIMARY KEY (chapter_id, question_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chapter_question_orders_chapter_position_key
  ON public.chapter_question_orders (chapter_id, position);

CREATE INDEX IF NOT EXISTS chapter_question_orders_question_idx
  ON public.chapter_question_orders (question_id);

COMMENT ON TABLE public.chapter_question_orders IS
  'Ordering of questions within a chapter. Parent chapters keep their own independent order.';

-- ============================================================================
-- 2) BACKFILL
-- ============================================================================

WITH RECURSIVE ancestor_map AS (
  SELECT
    qc.question_id,
    qc.chapter_id,
    qc.created_at,
    c.parent_chapter_id
  FROM public.question_chapters qc
  JOIN public.chapters c ON c.id = qc.chapter_id

  UNION ALL

  SELECT
    ancestor_map.question_id,
    c.id AS chapter_id,
    ancestor_map.created_at,
    c.parent_chapter_id
  FROM ancestor_map
  JOIN public.chapters c ON c.id = ancestor_map.parent_chapter_id
)
INSERT INTO public.chapter_question_orders (chapter_id, question_id, position, created_at)
SELECT
  chapter_id,
  question_id,
  row_number() OVER (PARTITION BY chapter_id ORDER BY created_at, question_id) AS position,
  created_at
FROM ancestor_map
ON CONFLICT (chapter_id, question_id) DO NOTHING;

-- ============================================================================
-- 3) TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insert_chapter_question_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ancestor_id bigint;
  next_position integer;
BEGIN
  FOR ancestor_id IN
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_chapter_id
      FROM public.chapters
      WHERE id = NEW.chapter_id

      UNION ALL

      SELECT c.id, c.parent_chapter_id
      FROM public.chapters c
      JOIN ancestors a ON a.parent_chapter_id = c.id
    )
    SELECT id FROM ancestors
  LOOP
    SELECT COALESCE(MAX(position), 0) + 1
    INTO next_position
    FROM public.chapter_question_orders
    WHERE chapter_id = ancestor_id;

    INSERT INTO public.chapter_question_orders (chapter_id, question_id, position, created_at)
    VALUES (ancestor_id, NEW.question_id, next_position, NEW.created_at)
    ON CONFLICT (chapter_id, question_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_chapter_question_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_chapter_id
    FROM public.chapters
    WHERE id = OLD.chapter_id

    UNION ALL

    SELECT c.id, c.parent_chapter_id
    FROM public.chapters c
    JOIN ancestors a ON a.parent_chapter_id = c.id
  )
  DELETE FROM public.chapter_question_orders
  WHERE question_id = OLD.question_id
    AND chapter_id IN (SELECT id FROM ancestors);

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS chapter_question_orders_insert ON public.question_chapters;
CREATE TRIGGER chapter_question_orders_insert
AFTER INSERT ON public.question_chapters
FOR EACH ROW EXECUTE FUNCTION public.insert_chapter_question_orders();

DROP TRIGGER IF EXISTS chapter_question_orders_delete ON public.question_chapters;
CREATE TRIGGER chapter_question_orders_delete
AFTER DELETE ON public.question_chapters
FOR EACH ROW EXECUTE FUNCTION public.delete_chapter_question_orders();

-- ============================================================================
-- 4) RLS + GRANTS
-- ============================================================================

ALTER TABLE public.chapter_question_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chapter_question_orders.select" ON public.chapter_question_orders
  FOR SELECT
  USING (true);

CREATE POLICY "chapter_question_orders.insert" ON public.chapter_question_orders
  FOR INSERT
  WITH CHECK (public.in_roles(VARIADIC ARRAY[
    'admin'::public.user_role,
    'super_admin'::public.user_role
  ]));

CREATE POLICY "chapter_question_orders.update" ON public.chapter_question_orders
  FOR UPDATE
  USING (public.in_roles(VARIADIC ARRAY[
    'admin'::public.user_role,
    'super_admin'::public.user_role
  ]))
  WITH CHECK (public.in_roles(VARIADIC ARRAY[
    'admin'::public.user_role,
    'super_admin'::public.user_role
  ]));

CREATE POLICY "chapter_question_orders.delete" ON public.chapter_question_orders
  FOR DELETE
  USING (public.in_roles(VARIADIC ARRAY[
    'admin'::public.user_role,
    'super_admin'::public.user_role
  ]));

GRANT ALL ON TABLE public.chapter_question_orders TO anon, authenticated, service_role;
