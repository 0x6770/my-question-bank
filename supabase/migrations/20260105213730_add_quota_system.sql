-- ==========================================
-- MyQuestionBank Quota Management System
-- Migration: Add quota system
-- Date: 2026-01-05
-- ==========================================

-- ==========================================
-- PART 1: Extend profiles table with membership info
-- ==========================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier TEXT DEFAULT 'basic' NOT NULL,
  ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_whitelisted BOOLEAN DEFAULT false NOT NULL;

-- Add constraint: membership_tier can only be basic or premium (free tier removed)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_membership_tier_check
  CHECK (membership_tier IN ('basic', 'premium'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_membership_tier
  ON public.profiles(membership_tier);

CREATE INDEX IF NOT EXISTS idx_profiles_membership_expires_at
  ON public.profiles(membership_expires_at);

CREATE INDEX IF NOT EXISTS idx_profiles_whitelisted
  ON public.profiles(is_whitelisted) WHERE is_whitelisted = true;

-- Add comments
COMMENT ON COLUMN public.profiles.membership_tier IS 'User membership level: basic or premium (free tier removed)';
COMMENT ON COLUMN public.profiles.membership_expires_at IS 'When paid membership expires (NULL = never had membership or expired)';
COMMENT ON COLUMN public.profiles.is_whitelisted IS 'Bypass all quota restrictions (VIP users)';

-- ==========================================
-- PART 2: Create quota_configs table (global configuration)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.quota_configs (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Enforce single-row table

  -- Free tier configuration
  free_answer_quota INTEGER DEFAULT 50 NOT NULL,
  free_answer_period_days INTEGER DEFAULT 5 NOT NULL,
  free_paper_quota INTEGER DEFAULT 0 NOT NULL,
  free_paper_period_days INTEGER DEFAULT 10 NOT NULL,

  -- Basic tier configuration
  basic_answer_quota INTEGER DEFAULT 200 NOT NULL,
  basic_answer_period_days INTEGER DEFAULT 5 NOT NULL,
  basic_paper_quota INTEGER DEFAULT 10 NOT NULL,
  basic_paper_period_days INTEGER DEFAULT 10 NOT NULL,

  -- Premium tier configuration (reserved for future)
  premium_answer_quota INTEGER DEFAULT 999999 NOT NULL,
  premium_answer_period_days INTEGER DEFAULT 30 NOT NULL,
  premium_paper_quota INTEGER DEFAULT 999999 NOT NULL,
  premium_paper_period_days INTEGER DEFAULT 30 NOT NULL,

  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert default configuration
INSERT INTO public.quota_configs (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.quota_configs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read configuration
CREATE POLICY "quota_configs.select"
  ON public.quota_configs
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin/super_admin can update configuration
CREATE POLICY "quota_configs.update"
  ON public.quota_configs
  FOR UPDATE
  TO authenticated
  USING (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
  )
  WITH CHECK (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
  );

-- Add trigger for updated_at
CREATE TRIGGER update_quota_configs_updated_at
  BEFORE UPDATE ON public.quota_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.quota_configs IS 'Global quota configuration (single-row table)';
COMMENT ON COLUMN public.quota_configs.free_answer_quota IS 'DEPRECATED: Free tier removed, use basic tier instead';
COMMENT ON COLUMN public.quota_configs.free_answer_period_days IS 'DEPRECATED: Free tier removed, use basic tier instead';
COMMENT ON COLUMN public.quota_configs.free_paper_quota IS 'DEPRECATED: Free tier removed, use basic tier instead';
COMMENT ON COLUMN public.quota_configs.free_paper_period_days IS 'DEPRECATED: Free tier removed, use basic tier instead';

-- ==========================================
-- PART 3: Create user_answer_quotas table
-- ==========================================

CREATE TABLE IF NOT EXISTS public.user_answer_quotas (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  answers_viewed INTEGER DEFAULT 0 NOT NULL,
  quota_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  current_period_questions TEXT[] DEFAULT '{}' NOT NULL, -- Array of question IDs viewed in current period
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT answers_viewed_non_negative CHECK (answers_viewed >= 0)
);

-- Create index for reset_at queries
CREATE INDEX idx_user_answer_quotas_reset_at
  ON public.user_answer_quotas(quota_reset_at);

-- Enable RLS
ALTER TABLE public.user_answer_quotas ENABLE ROW LEVEL SECURITY;

-- Users can view their own quota
CREATE POLICY "user_answer_quotas.select"
  ON public.user_answer_quotas
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own quota
CREATE POLICY "user_answer_quotas.insert"
  ON public.user_answer_quotas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own quota
CREATE POLICY "user_answer_quotas.update"
  ON public.user_answer_quotas
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_answer_quotas_updated_at
  BEFORE UPDATE ON public.user_answer_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.user_answer_quotas IS 'Tracks answer viewing quota per user';
COMMENT ON COLUMN public.user_answer_quotas.answers_viewed IS 'Number of answers viewed in current period';
COMMENT ON COLUMN public.user_answer_quotas.quota_reset_at IS 'When the quota counter will reset';
COMMENT ON COLUMN public.user_answer_quotas.current_period_questions IS 'Array of question IDs viewed in current period (prevents duplicate counting)';

-- ==========================================
-- PART 4: Extend user_paper_quotas table
-- ==========================================

-- Add column to track papers generated in current period
ALTER TABLE public.user_paper_quotas
  ADD COLUMN IF NOT EXISTS current_period_papers BIGINT[] DEFAULT '{}' NOT NULL;

COMMENT ON COLUMN public.user_paper_quotas.current_period_papers IS 'Array of generated paper IDs in current period (for tracking and auditing)';

-- ==========================================
-- PART 5: Create quota_overrides table (optional, for special cases)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.quota_overrides (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,

  -- Override values (NULL = use global config)
  answer_quota INTEGER,
  answer_period_days INTEGER,
  paper_quota INTEGER,
  paper_period_days INTEGER,

  -- Metadata
  notes TEXT, -- Admin notes explaining why override was applied
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Constraints
  CONSTRAINT answer_quota_positive CHECK (answer_quota IS NULL OR answer_quota >= 0),
  CONSTRAINT answer_period_positive CHECK (answer_period_days IS NULL OR answer_period_days > 0),
  CONSTRAINT paper_quota_positive CHECK (paper_quota IS NULL OR paper_quota >= 0),
  CONSTRAINT paper_period_positive CHECK (paper_period_days IS NULL OR paper_period_days > 0)
);

-- Enable RLS
ALTER TABLE public.quota_overrides ENABLE ROW LEVEL SECURITY;

-- Only admin/super_admin can manage overrides
CREATE POLICY "quota_overrides.admin_all"
  ON public.quota_overrides
  FOR ALL
  USING (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
  )
  WITH CHECK (
    public.in_roles(VARIADIC ARRAY['admin'::public.user_role, 'super_admin'::public.user_role])
  );

-- Users can view their own override configuration
CREATE POLICY "quota_overrides.user_select"
  ON public.quota_overrides
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_quota_overrides_updated_at
  BEFORE UPDATE ON public.quota_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.quota_overrides IS 'Per-user quota overrides (optional, for special cases like VIP users or testers)';
COMMENT ON COLUMN public.quota_overrides.notes IS 'Admin notes explaining why this override was applied';
COMMENT ON COLUMN public.quota_overrides.created_by IS 'Admin user who created this override';

-- ==========================================
-- PART 6: Add admin UPDATE policy for profiles table
-- ==========================================

-- Create a SECURITY DEFINER function to check if current user is admin
-- This function bypasses RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Create the UPDATE policy for admins using the SECURITY DEFINER function
CREATE POLICY "Allow admins to update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_current_user_admin());

COMMENT ON FUNCTION public.is_current_user_admin() IS
  'Returns true if current user has admin or super_admin role. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';
