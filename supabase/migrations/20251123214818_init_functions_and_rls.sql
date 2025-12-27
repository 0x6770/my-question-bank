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
  v_question_banks text[];
  v_chapter_count integer;
BEGIN
  -- 验证参数
  IF p_marks <= 0 THEN
    RAISE EXCEPTION 'marks must be greater than 0';
  END IF;

  IF p_difficulty < 1 OR p_difficulty > 4 THEN
    RAISE EXCEPTION 'difficulty must be between 1 and 4';
  END IF;

  -- 如果提供了 chapter_ids，检查约束：所有 chapter 必须属于不同的 question_bank
  v_chapter_count := coalesce(array_length(p_chapter_ids, 1), 0);

  IF v_chapter_count > 0 THEN
    SELECT array_agg(DISTINCT eb.question_bank)
    INTO v_question_banks
    FROM unnest(p_chapter_ids) AS chapter_id
    JOIN chapters c ON c.id = chapter_id
    JOIN subjects s ON s.id = c.subject_id
    JOIN exam_boards eb ON eb.id = s.exam_board_id;

    -- 如果有重复的 question_bank，抛出错误
    IF array_length(v_question_banks, 1) != v_chapter_count THEN
      RAISE EXCEPTION 'A question cannot belong to multiple chapters in the same question bank';
    END IF;
  END IF;

  -- 在事务中执行所有操作（函数本身就在事务中）

  -- 1. 更新 questions 表
  UPDATE questions
  SET
    marks = p_marks,
    difficulty = p_difficulty,
    calculator = p_calculator
  WHERE id = p_question_id;

  -- 2. 删除旧的 chapter 关联
  DELETE FROM question_chapters
  WHERE question_id = p_question_id;

  -- 3. 插入新的 chapter 关联
  IF v_chapter_count > 0 THEN
    INSERT INTO question_chapters (question_id, chapter_id)
    SELECT p_question_id, unnest(p_chapter_ids);
  END IF;
END;
$$;

-- 创建新题目并关联章节（用于批量导入）
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
  v_question_banks text[];
  v_chapter_count integer;
BEGIN
  -- 验证参数
  IF p_marks <= 0 THEN
    RAISE EXCEPTION 'marks must be greater than 0';
  END IF;

  IF p_difficulty < 1 OR p_difficulty > 4 THEN
    RAISE EXCEPTION 'difficulty must be between 1 and 4';
  END IF;

  -- 如果提供了 chapter_ids，检查约束：所有 chapter 必须属于不同的 question_bank
  v_chapter_count := coalesce(array_length(p_chapter_ids, 1), 0);

  IF v_chapter_count > 0 THEN
    SELECT array_agg(DISTINCT eb.question_bank)
    INTO v_question_banks
    FROM unnest(p_chapter_ids) AS chapter_id
    JOIN chapters c ON c.id = chapter_id
    JOIN subjects s ON s.id = c.subject_id
    JOIN exam_boards eb ON eb.id = s.exam_board_id;

    -- 如果有重复的 question_bank，抛出错误
    IF array_length(v_question_banks, 1) != v_chapter_count THEN
      RAISE EXCEPTION 'A question cannot belong to multiple chapters in the same question bank';
    END IF;
  END IF;

  -- 1. 创建题目
  INSERT INTO questions (marks, difficulty, calculator)
  VALUES (p_marks, p_difficulty, p_calculator)
  RETURNING id INTO v_question_id;

  -- 2. 插入 chapter 关联
  IF v_chapter_count > 0 THEN
    INSERT INTO question_chapters (question_id, chapter_id)
    SELECT v_question_id, unnest(p_chapter_ids);
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

-- tags
ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags.delete" ON "public"."tags"
    FOR DELETE
    USING ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "tags.insert" ON "public"."tags"
    FOR INSERT
    WITH CHECK ("public"."in_roles"(VARIADIC ARRAY[
        'admin'::"public"."user_role",
        'super_admin'::"public"."user_role"
    ]));

CREATE POLICY "tags.select" ON "public"."tags"
    FOR SELECT
    USING (true);

CREATE POLICY "tags.update" ON "public"."tags"
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
