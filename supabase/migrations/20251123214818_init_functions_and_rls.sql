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
