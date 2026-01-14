-- 0003_init_functions_and_rls.sql
-- 所有自定义函数 + RLS 开启与策略

-- ========== Functions ==========

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, role, email)
  values (
    new.id,
    'user',
    coalesce(new.email, new.raw_user_meta_data->>'email', '')
  );
  return new;
end
$$;

CREATE OR REPLACE FUNCTION "public"."has_role"("target" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and role = target::user_role
  );
$$;

CREATE OR REPLACE FUNCTION "public"."in_roles"(VARIADIC "roles" "public"."user_role"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = any(roles)
  );
$$;

-- 原子性更新题目和章节关联
-- p_calculator: default value for new question_subjects entries
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
  -- 验证参数
  IF p_marks <= 0 THEN
    RAISE EXCEPTION 'marks must be greater than 0';
  END IF;

  IF p_difficulty < 1 OR p_difficulty > 4 THEN
    RAISE EXCEPTION 'difficulty must be between 1 and 4';
  END IF;

  v_chapter_count := coalesce(array_length(p_chapter_ids, 1), 0);

  IF v_chapter_count > 0 THEN
    -- 约束: 每个 subject 最多一个 chapter (Issue #43)
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

  -- 1. 更新 questions 表 (no calculator column)
  UPDATE questions
  SET
    marks = p_marks,
    difficulty = p_difficulty
  WHERE id = p_question_id;

  -- 2. 删除旧的 chapter 关联
  DELETE FROM question_chapters
  WHERE question_id = p_question_id;

  -- 3. 插入新的 chapter 关联
  IF v_chapter_count > 0 THEN
    INSERT INTO question_chapters (question_id, chapter_id)
    SELECT p_question_id, unnest(p_chapter_ids);

    v_new_subject_ids := v_subject_ids;

    -- 4. Insert question_subjects for new subjects (preserve existing calculator values)
    INSERT INTO question_subjects (question_id, subject_id, calculator)
    SELECT p_question_id, unnest(v_new_subject_ids), p_calculator
    ON CONFLICT (question_id, subject_id) DO NOTHING;
  ELSE
    v_new_subject_ids := ARRAY[]::bigint[];
  END IF;

  -- 5. Clean up question_subjects for removed subjects
  IF v_old_subject_ids IS NOT NULL THEN
    DELETE FROM question_subjects
    WHERE question_id = p_question_id
      AND subject_id = ANY(v_old_subject_ids)
      AND NOT (subject_id = ANY(COALESCE(v_new_subject_ids, ARRAY[]::bigint[])));
  END IF;
END;
$$;

-- 创建新题目并关联章节（用于批量导入）
-- p_calculator: default value for question_subjects.calculator
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
  -- 验证参数
  IF p_marks <= 0 THEN
    RAISE EXCEPTION 'marks must be greater than 0';
  END IF;

  IF p_difficulty < 1 OR p_difficulty > 4 THEN
    RAISE EXCEPTION 'difficulty must be between 1 and 4';
  END IF;

  v_chapter_count := coalesce(array_length(p_chapter_ids, 1), 0);

  IF v_chapter_count > 0 THEN
    -- 约束: 每个 subject 最多一个 chapter (Issue #43)
    SELECT array_agg(DISTINCT c.subject_id)
    INTO v_subject_ids
    FROM unnest(p_chapter_ids) AS chapter_id
    JOIN chapters c ON c.id = chapter_id;

    v_subject_count := coalesce(array_length(v_subject_ids, 1), 0);

    IF v_subject_count != v_chapter_count THEN
      RAISE EXCEPTION 'A question cannot belong to multiple chapters in the same subject';
    END IF;
  END IF;

  -- 1. 创建题目 (no calculator column)
  INSERT INTO questions (marks, difficulty)
  VALUES (p_marks, p_difficulty)
  RETURNING id INTO v_question_id;

  -- 2. 插入 chapter 关联
  IF v_chapter_count > 0 THEN
    INSERT INTO question_chapters (question_id, chapter_id)
    SELECT v_question_id, unnest(p_chapter_ids);

    -- 3. 插入 question_subjects (per-subject calculator)
    INSERT INTO question_subjects (question_id, subject_id, calculator)
    SELECT v_question_id, unnest(v_subject_ids), p_calculator;
  END IF;

  RETURN v_question_id;
END;
$$;

-- ========== RLS: ENABLE + POLICIES ==========

-- profiles
CREATE POLICY "Allow user to access their own profile"
    ON "public"."profiles"
    FOR SELECT
    TO "authenticated"
    USING ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "Allow admins to read all profiles" ON "public"."profiles"
    FOR SELECT
    TO "authenticated"
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

-- chapters
ALTER TABLE "public"."chapters" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chapters.delete" ON "public"."chapters"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "chapters.insert" ON "public"."chapters"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "chapters.select" ON "public"."chapters"
    FOR SELECT
    USING (true);

CREATE POLICY "chapters.update" ON "public"."chapters"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

-- exam_boards (exams)
ALTER TABLE "public"."exam_boards" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exams.delete" ON "public"."exam_boards"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "exams.insert" ON "public"."exam_boards"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "exams.select" ON "public"."exam_boards"
    FOR SELECT
    USING (true);

CREATE POLICY "exams.update" ON "public"."exam_boards"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

-- question_images
ALTER TABLE "public"."question_images" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_images.delete" ON "public"."question_images"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "question_images.insert" ON "public"."question_images"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "question_images.select" ON "public"."question_images"
    FOR SELECT
    USING (true);

CREATE POLICY "question_images.update" ON "public"."question_images"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

-- questions
ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions.delete" ON "public"."questions"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "questions.insert" ON "public"."questions"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "questions.select" ON "public"."questions"
    FOR SELECT
    USING (true);

CREATE POLICY "questions.update" ON "public"."questions"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

-- subjects
ALTER TABLE "public"."subjects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subjects.delete" ON "public"."subjects"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "subjects.insert" ON "public"."subjects"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "subjects.select" ON "public"."subjects"
    FOR SELECT
    USING (true);

CREATE POLICY "subjects.update" ON "public"."subjects"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

-- user_questions
ALTER TABLE "public"."user_questions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_questions.delete" ON "public"."user_questions"
    FOR DELETE
    USING (("user_id" = "auth"."uid"()));

CREATE POLICY "user_questions.insert" ON "public"."user_questions"
    FOR INSERT
    WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "user_questions.select" ON "public"."user_questions"
    FOR SELECT
    USING (("user_id" = "auth"."uid"()));

CREATE POLICY "user_questions.update" ON "public"."user_questions"
    FOR UPDATE
    USING (("user_id" = "auth"."uid"()))
    WITH CHECK (("user_id" = "auth"."uid"()));

-- question_chapters
ALTER TABLE "public"."question_chapters" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_chapters.select" ON "public"."question_chapters"
    FOR SELECT
    USING (true);

CREATE POLICY "question_chapters.insert" ON "public"."question_chapters"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "question_chapters.update" ON "public"."question_chapters"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "question_chapters.delete" ON "public"."question_chapters"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

-- ========== question_subjects: Functions, Triggers, RLS ==========

-- Trigger: Auto-update updated_at
CREATE OR REPLACE FUNCTION "public"."set_question_subjects_updated_at"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_question_subjects_updated_at
BEFORE UPDATE ON "public"."question_subjects"
FOR EACH ROW EXECUTE FUNCTION "public"."set_question_subjects_updated_at"();

-- Function: Update per-subject properties (Issue #50)
CREATE OR REPLACE FUNCTION "public"."update_question_subject_properties"(
  "p_question_id" bigint,
  "p_subject_properties" jsonb  -- Format: [{"subject_id": 1, "calculator": true}, ...]
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

-- question_subjects RLS (initial: select open, will be restricted in user_subject_access migration)
ALTER TABLE "public"."question_subjects" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_subjects.select" ON "public"."question_subjects"
    FOR SELECT
    USING (true);

CREATE POLICY "question_subjects.insert" ON "public"."question_subjects"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "question_subjects.update" ON "public"."question_subjects"
    FOR UPDATE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]))
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "question_subjects.delete" ON "public"."question_subjects"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));
