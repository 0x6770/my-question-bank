-- 0006_add_question_images_bucket_and_policies.sql

-- 1. 创建（或更新）question_images bucket
-- storage.buckets 是 Supabase 内部的存储 bucket 表
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question_images',             -- bucket id（要和 storage.from() 的名字一致）
  'question_images',             -- name（展示用，可以和 id 一样）
  FALSE,                         -- public: 设成 false，避免匿名用户直接访问
  52428800,                      -- file_size_limit: 50MB，单位字节，你可以按需改
  '{"image/*"}'::text[]         -- allowed_mime_types: 允许的 MIME 类型
)
ON CONFLICT (id) DO UPDATE
SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. 为 question_images bucket 写 RLS 策略
-- RLS 是作用在 storage.objects 上，而不是 buckets 上

-- 2.1 允许所有已登录用户读取该 bucket 下的对象
CREATE POLICY "question_images_select_authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'question_images'
);

-- 2.2 只允许 admin / super_admin 上传（INSERT）
CREATE POLICY "question_images_insert_admins"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'question_images'
  AND public.in_roles(
    VARIADIC ARRAY[
      'admin'::public.user_role,
      'super_admin'::public.user_role
    ]
  )
);

-- 2.3 只允许 admin / super_admin 更新（UPDATE）
CREATE POLICY "question_images_update_admins"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'question_images'
  AND public.in_roles(
    VARIADIC ARRAY[
      'admin'::public.user_role,
      'super_admin'::public.user_role
    ]
  )
)
WITH CHECK (
  bucket_id = 'question_images'
  AND public.in_roles(
    VARIADIC ARRAY[
      'admin'::public.user_role,
      'super_admin'::public.user_role
    ]
  )
);

-- 2.4 只允许 admin / super_admin 删除（DELETE）
CREATE POLICY "question_images_delete_admins"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'question_images'
  AND public.in_roles(
    VARIADIC ARRAY[
      'admin'::public.user_role,
      'super_admin'::public.user_role
    ]
  )
);
