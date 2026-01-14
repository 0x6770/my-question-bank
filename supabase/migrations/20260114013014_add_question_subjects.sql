-- ============================================================================
-- Issue #43 & #50: Add question_subjects table for per-subject properties
-- ============================================================================
-- This migration enables:
-- 1. One question associated with multiple subjects within the same question_bank
-- 2. Per-subject calculator settings (and future per-subject properties)
-- ============================================================================

-- ============================================================================
-- 1) CREATE question_subjects TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.question_subjects (
  question_id  bigint NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  subject_id   bigint NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  calculator   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT question_subjects_pk PRIMARY KEY (question_id, subject_id)
);

-- Index for looking up subjects by question
CREATE INDEX IF NOT EXISTS question_subjects_question_idx
  ON public.question_subjects(question_id);

-- Index for reverse lookup: find questions by subject
CREATE INDEX IF NOT EXISTS question_subjects_subject_idx
  ON public.question_subjects(subject_id);

-- Index for calculator filtering within a subject
CREATE INDEX IF NOT EXISTS question_subjects_subject_calculator_idx
  ON public.question_subjects(subject_id, calculator);

COMMENT ON TABLE public.question_subjects IS
  'Per-subject properties for questions. Enables one question to have different calculator settings per subject (Issue #43, #50).';
COMMENT ON COLUMN public.question_subjects.calculator IS
  'Whether calculator is allowed for this question in this subject context.';


-- ============================================================================
-- 2) TRIGGER: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_question_subjects_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_question_subjects_updated_at ON public.question_subjects;
CREATE TRIGGER set_question_subjects_updated_at
BEFORE UPDATE ON public.question_subjects
FOR EACH ROW EXECUTE FUNCTION public.set_question_subjects_updated_at();


-- ============================================================================
-- 3) RLS POLICIES (following question_tag_values pattern)
-- ============================================================================

ALTER TABLE public.question_subjects ENABLE ROW LEVEL SECURITY;

-- SELECT: admins or users with subject access
CREATE POLICY "question_subjects.select_allowed" ON public.question_subjects
  FOR SELECT
  USING (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
    OR EXISTS (
      SELECT 1 FROM public.user_subject_access usa
      WHERE usa.subject_id = question_subjects.subject_id
        AND usa.user_id = auth.uid()
    )
  );

-- INSERT: admins only
CREATE POLICY "question_subjects.insert_admins" ON public.question_subjects
  FOR INSERT
  WITH CHECK (public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]));

-- UPDATE: admins only
CREATE POLICY "question_subjects.update_admins" ON public.question_subjects
  FOR UPDATE
  USING (public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))
  WITH CHECK (public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]));

-- DELETE: admins only
CREATE POLICY "question_subjects.delete_admins" ON public.question_subjects
  FOR DELETE
  USING (public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]));


-- ============================================================================
-- 4) GRANTS
-- ============================================================================

GRANT ALL ON TABLE public.question_subjects TO anon, authenticated, service_role;


-- ============================================================================
-- 5) DATA MIGRATION: Populate from existing questions.calculator
-- ============================================================================
-- For each question, derive subject from question_chapters -> chapters -> subjects
-- Use the question's current calculator value as the default for all its subjects

INSERT INTO public.question_subjects (question_id, subject_id, calculator)
SELECT DISTINCT
  qc.question_id,
  c.subject_id,
  q.calculator
FROM public.question_chapters qc
JOIN public.chapters c ON c.id = qc.chapter_id
JOIN public.questions q ON q.id = qc.question_id
ON CONFLICT (question_id, subject_id) DO NOTHING;


-- ============================================================================
-- 6) TRIGGER: Sync question_subjects when question_chapters changes
-- ============================================================================
-- Ensure that when question_chapters is modified, question_subjects stays in sync

CREATE OR REPLACE FUNCTION public.sync_question_subjects_on_chapter_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_subject_id bigint;
  v_default_calculator boolean;
BEGIN
  -- Get the subject_id from the chapter
  SELECT subject_id INTO v_subject_id
  FROM public.chapters
  WHERE id = NEW.chapter_id;

  -- Get default calculator from the question (for legacy compatibility)
  SELECT calculator INTO v_default_calculator
  FROM public.questions
  WHERE id = NEW.question_id;

  -- Upsert into question_subjects (don't overwrite if already exists)
  INSERT INTO public.question_subjects (question_id, subject_id, calculator)
  VALUES (NEW.question_id, v_subject_id, COALESCE(v_default_calculator, true))
  ON CONFLICT (question_id, subject_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_question_subjects_on_chapter_insert ON public.question_chapters;
CREATE TRIGGER sync_question_subjects_on_chapter_insert
AFTER INSERT ON public.question_chapters
FOR EACH ROW EXECUTE FUNCTION public.sync_question_subjects_on_chapter_insert();

COMMENT ON FUNCTION public.sync_question_subjects_on_chapter_insert IS
  'Auto-creates question_subjects entry when a question is associated with a chapter. Uses question.calculator as default.';


-- ============================================================================
-- 7) UPDATE DB FUNCTIONS: Change constraint logic
-- ============================================================================
-- Old constraint: "A question cannot belong to multiple chapters in the same question_bank"
-- New constraint: "A question can have at most one chapter per subject"

-- 7.1) Update create_question_with_chapters
CREATE OR REPLACE FUNCTION "public"."create_question_with_chapters"(
  "p_marks" smallint,
  "p_difficulty" smallint,
  "p_calculator" boolean,
  "p_chapter_ids" bigint[]
) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_question_id bigint;
  v_subject_ids bigint[];
  v_chapter_count integer;
  v_subject_count integer;
BEGIN
  -- Validate parameters
  IF p_marks <= 0 THEN
    RAISE EXCEPTION 'marks must be greater than 0';
  END IF;

  IF p_difficulty < 1 OR p_difficulty > 4 THEN
    RAISE EXCEPTION 'difficulty must be between 1 and 4';
  END IF;

  v_chapter_count := coalesce(array_length(p_chapter_ids, 1), 0);

  IF v_chapter_count > 0 THEN
    -- NEW CONSTRAINT: Check that all chapters belong to different subjects
    -- (one chapter per subject)
    SELECT array_agg(DISTINCT c.subject_id)
    INTO v_subject_ids
    FROM unnest(p_chapter_ids) AS chapter_id
    JOIN chapters c ON c.id = chapter_id;

    v_subject_count := coalesce(array_length(v_subject_ids, 1), 0);

    IF v_subject_count != v_chapter_count THEN
      RAISE EXCEPTION 'A question cannot belong to multiple chapters in the same subject';
    END IF;
  END IF;

  -- 1. Create question
  INSERT INTO questions (marks, difficulty, calculator)
  VALUES (p_marks, p_difficulty, p_calculator)
  RETURNING id INTO v_question_id;

  -- 2. Insert chapter associations (trigger will auto-create question_subjects)
  IF v_chapter_count > 0 THEN
    INSERT INTO question_chapters (question_id, chapter_id)
    SELECT v_question_id, unnest(p_chapter_ids);
  END IF;

  RETURN v_question_id;
END;
$$;


-- 7.2) Update update_question_with_chapters
CREATE OR REPLACE FUNCTION "public"."update_question_with_chapters"(
  "p_question_id" bigint,
  "p_marks" smallint,
  "p_difficulty" smallint,
  "p_calculator" boolean,
  "p_chapter_ids" bigint[]
) RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_subject_ids bigint[];
  v_chapter_count integer;
  v_subject_count integer;
  v_old_subject_ids bigint[];
  v_new_subject_ids bigint[];
BEGIN
  -- Validate parameters
  IF p_marks <= 0 THEN
    RAISE EXCEPTION 'marks must be greater than 0';
  END IF;

  IF p_difficulty < 1 OR p_difficulty > 4 THEN
    RAISE EXCEPTION 'difficulty must be between 1 and 4';
  END IF;

  v_chapter_count := coalesce(array_length(p_chapter_ids, 1), 0);

  IF v_chapter_count > 0 THEN
    -- NEW CONSTRAINT: Check that all chapters belong to different subjects
    SELECT array_agg(DISTINCT c.subject_id)
    INTO v_subject_ids
    FROM unnest(p_chapter_ids) AS chapter_id
    JOIN chapters c ON c.id = chapter_id;

    v_subject_count := coalesce(array_length(v_subject_ids, 1), 0);

    IF v_subject_count != v_chapter_count THEN
      RAISE EXCEPTION 'A question cannot belong to multiple chapters in the same subject';
    END IF;
  END IF;

  -- Get old subject IDs before deleting chapters
  SELECT array_agg(DISTINCT c.subject_id)
  INTO v_old_subject_ids
  FROM question_chapters qc
  JOIN chapters c ON c.id = qc.chapter_id
  WHERE qc.question_id = p_question_id;

  -- 1. Update questions table
  UPDATE questions
  SET
    marks = p_marks,
    difficulty = p_difficulty,
    calculator = p_calculator
  WHERE id = p_question_id;

  -- 2. Delete old chapter associations
  DELETE FROM question_chapters
  WHERE question_id = p_question_id;

  -- 3. Insert new chapter associations (trigger will auto-create question_subjects)
  IF v_chapter_count > 0 THEN
    INSERT INTO question_chapters (question_id, chapter_id)
    SELECT p_question_id, unnest(p_chapter_ids);

    -- Get new subject IDs
    v_new_subject_ids := v_subject_ids;
  ELSE
    v_new_subject_ids := ARRAY[]::bigint[];
  END IF;

  -- 4. Clean up question_subjects for removed subjects
  IF v_old_subject_ids IS NOT NULL THEN
    DELETE FROM question_subjects
    WHERE question_id = p_question_id
      AND subject_id = ANY(v_old_subject_ids)
      AND NOT (subject_id = ANY(COALESCE(v_new_subject_ids, ARRAY[]::bigint[])));
  END IF;
END;
$$;


-- ============================================================================
-- 8) NEW FUNCTION: Update question with per-subject calculator
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_question_subject_properties(
  p_question_id bigint,
  p_subject_properties jsonb  -- Format: [{"subject_id": 1, "calculator": true}, ...]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prop jsonb;
  v_subject_id bigint;
  v_calculator boolean;
BEGIN
  -- Validate question exists
  IF NOT EXISTS (SELECT 1 FROM questions WHERE id = p_question_id) THEN
    RAISE EXCEPTION 'Question % does not exist', p_question_id;
  END IF;

  -- Update each subject's properties
  FOR v_prop IN SELECT * FROM jsonb_array_elements(p_subject_properties)
  LOOP
    v_subject_id := (v_prop->>'subject_id')::bigint;
    v_calculator := COALESCE((v_prop->>'calculator')::boolean, true);

    -- Validate subject exists in question_subjects
    IF NOT EXISTS (
      SELECT 1 FROM question_subjects
      WHERE question_id = p_question_id AND subject_id = v_subject_id
    ) THEN
      RAISE EXCEPTION 'Question % is not associated with subject %', p_question_id, v_subject_id;
    END IF;

    -- Update the calculator value
    UPDATE question_subjects
    SET calculator = v_calculator
    WHERE question_id = p_question_id
      AND subject_id = v_subject_id;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_question_subject_properties IS
  'Updates per-subject properties (calculator) for a question. Subject must already be associated via question_chapters.';


-- ============================================================================
-- 9) UPDATE create_question_with_chapters_and_tags to support per-subject calculator
-- ============================================================================

-- Drop the old 5-parameter version to avoid overload ambiguity
DROP FUNCTION IF EXISTS public.create_question_with_chapters_and_tags(smallint, smallint, boolean, bigint[], jsonb);

CREATE OR REPLACE FUNCTION public.create_question_with_chapters_and_tags(
  p_marks smallint,
  p_difficulty smallint,
  p_calculator boolean,
  p_chapter_ids bigint[],
  p_tags jsonb,
  p_subject_properties jsonb DEFAULT NULL  -- NEW: [{"subject_id": 1, "calculator": true}, ...]
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_question_id bigint;
BEGIN
  -- Use existing function to create question and associate chapters
  v_question_id := create_question_with_chapters(
    p_marks,
    p_difficulty,
    p_calculator,
    p_chapter_ids
  );

  -- Set tags if provided
  IF p_tags IS NOT NULL AND jsonb_array_length(p_tags) > 0 THEN
    PERFORM update_question_tags(v_question_id, p_tags);
  END IF;

  -- Set per-subject properties if provided
  IF p_subject_properties IS NOT NULL AND jsonb_array_length(p_subject_properties) > 0 THEN
    PERFORM update_question_subject_properties(v_question_id, p_subject_properties);
  END IF;

  RETURN v_question_id;
END;
$$;

COMMENT ON FUNCTION public.create_question_with_chapters_and_tags(smallint, smallint, boolean, bigint[], jsonb, jsonb) IS
  'Creates a question with chapters, tags, and per-subject properties in a single transaction.';
