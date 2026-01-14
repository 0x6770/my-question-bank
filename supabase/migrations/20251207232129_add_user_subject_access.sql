-- Subject-level access mapping and policies

-- 1) Mapping table: which subjects a user can access
create table if not exists public.user_subject_access (
  user_id uuid not null references auth.users on delete cascade,
  subject_id bigint not null references public.subjects on delete cascade,
  granted_by uuid references auth.users,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);

-- 2) Enable RLS
alter table public.user_subject_access enable row level security;

-- 3) Policies
-- Drop in case this migration is reapplied
drop policy if exists "admin manage user_subject_access" on public.user_subject_access;
drop policy if exists "users can view own access rows" on public.user_subject_access;

-- Allow super_admin/admin to manage all rows
create policy "admin manage user_subject_access" on public.user_subject_access
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

-- Allow regular users to view their own allowed subjects
create policy "users can view own access rows" on public.user_subject_access
  for select
  using (user_id = auth.uid());

-- 4) Restrict subjects/chapters/questions visibility based on access list (or admin)

-- Drop existing permissive select policies
drop policy if exists "subjects.select" on public.subjects;
drop policy if exists "chapters.select" on public.chapters;
drop policy if exists "questions.select" on public.questions;

-- Subjects: require admin/super_admin or an access row
create policy "subjects.select by access" on public.subjects
  for select
  to authenticated
  using (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
    or exists (
      select 1
      from public.user_subject_access usa
      where usa.user_id = auth.uid()
        and usa.subject_id = public.subjects.id
    )
  );

-- Chapters: require admin/super_admin or access to the chapter's subject
create policy "chapters.select by access" on public.chapters
  for select
  to authenticated
  using (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
    or exists (
      select 1
      from public.user_subject_access usa
      where usa.user_id = auth.uid()
        and usa.subject_id = public.chapters.subject_id
    )
  );

-- Questions: require admin/super_admin or access to the question's subject via its chapters
create policy "questions.select by access" on public.questions
  for select
  to authenticated
  using (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
    or exists (
      select 1
      from public.question_chapters qc
      join public.chapters c on c.id = qc.chapter_id
      join public.user_subject_access usa on usa.subject_id = c.subject_id
      where qc.question_id = public.questions.id
        and usa.user_id = auth.uid()
    )
  );

-- Question_subjects: require admin/super_admin or access to the subject
drop policy if exists "question_subjects.select" on public.question_subjects;

create policy "question_subjects.select by access" on public.question_subjects
  for select
  to authenticated
  using (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
    or exists (
      select 1
      from public.user_subject_access usa
      where usa.user_id = auth.uid()
        and usa.subject_id = public.question_subjects.subject_id
    )
  );
