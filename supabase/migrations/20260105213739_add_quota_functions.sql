-- ==========================================
-- MyQuestionBank Quota Management System
-- Migration: Add quota management functions
-- Date: 2026-01-05
-- ==========================================

-- ==========================================
-- FUNCTION 1: get_user_membership_tier
-- Get user's effective membership tier (considering expiration)
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_user_membership_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_expires_at TIMESTAMPTZ;
  v_is_whitelisted BOOLEAN;
  v_role TEXT;
BEGIN
  -- Get user membership info and role
  SELECT p.membership_tier, p.membership_expires_at, p.is_whitelisted, p.role
  INTO v_tier, v_expires_at, v_is_whitelisted, v_role
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- CRITICAL: Admin/super_admin are exempt from quota restrictions
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN 'admin';
  END IF;

  -- Whitelist users return special identifier
  IF v_is_whitelisted THEN
    RETURN 'whitelisted';
  END IF;

  -- Check if paid membership has expired
  IF v_tier IN ('basic', 'premium') THEN
    IF v_expires_at IS NULL OR v_expires_at < NOW() THEN
      RETURN 'free'; -- Expired, downgrade to free
    END IF;
  END IF;

  RETURN v_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_membership_tier(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_membership_tier(UUID) IS
  'Returns effective membership tier: admin, whitelisted, premium, basic, or free';

-- ==========================================
-- FUNCTION 2: get_user_quota_config
-- Get user's quota configuration (considering tier, overrides, whitelist, admin)
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_user_quota_config(
  p_user_id UUID,
  p_quota_type TEXT -- 'answer' or 'paper'
)
RETURNS TABLE (
  quota INTEGER,
  period_days INTEGER,
  is_exempt BOOLEAN -- True if admin or whitelisted
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_override_quota INTEGER;
  v_override_period INTEGER;
  v_config RECORD;
BEGIN
  -- Get effective membership tier
  v_tier := public.get_user_membership_tier(p_user_id);

  -- CRITICAL: Admin and whitelist users get unlimited quota
  IF v_tier IN ('admin', 'whitelisted') THEN
    RETURN QUERY SELECT 999999::INTEGER, 999999::INTEGER, true;
    RETURN;
  END IF;

  -- Check for user-specific override configuration
  IF p_quota_type = 'answer' THEN
    SELECT qo.answer_quota, qo.answer_period_days
    INTO v_override_quota, v_override_period
    FROM public.quota_overrides qo
    WHERE qo.user_id = p_user_id;
  ELSIF p_quota_type = 'paper' THEN
    SELECT qo.paper_quota, qo.paper_period_days
    INTO v_override_quota, v_override_period
    FROM public.quota_overrides qo
    WHERE qo.user_id = p_user_id;
  END IF;

  -- If override exists and is not NULL, use it
  IF v_override_quota IS NOT NULL THEN
    RETURN QUERY SELECT v_override_quota, v_override_period, false;
    RETURN;
  END IF;

  -- Otherwise, use global configuration based on tier
  SELECT * INTO v_config FROM public.quota_configs WHERE id = 1;

  IF p_quota_type = 'answer' THEN
    IF v_tier = 'premium' THEN
      RETURN QUERY SELECT v_config.premium_answer_quota, v_config.premium_answer_period_days, false;
    ELSIF v_tier = 'basic' THEN
      RETURN QUERY SELECT v_config.basic_answer_quota, v_config.basic_answer_period_days, false;
    ELSE -- free
      RETURN QUERY SELECT v_config.free_answer_quota, v_config.free_answer_period_days, false;
    END IF;
  ELSIF p_quota_type = 'paper' THEN
    IF v_tier = 'premium' THEN
      RETURN QUERY SELECT v_config.premium_paper_quota, v_config.premium_paper_period_days, false;
    ELSIF v_tier = 'basic' THEN
      RETURN QUERY SELECT v_config.basic_paper_quota, v_config.basic_paper_period_days, false;
    ELSE -- free
      RETURN QUERY SELECT v_config.free_paper_quota, v_config.free_paper_period_days, false;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_quota_config(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_user_quota_config(UUID, TEXT) IS
  'Returns quota configuration for user. Priority: admin/whitelist > user override > global config';

-- ==========================================
-- FUNCTION 3: calculate_quota_reset_time
-- Calculate next quota reset time based on anchor point and period
-- ==========================================

CREATE OR REPLACE FUNCTION public.calculate_quota_reset_time(
  p_user_id UUID,
  p_period_days INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anchor TIMESTAMPTZ;
  v_period_seconds BIGINT;
  v_now TIMESTAMPTZ;
  v_elapsed_seconds BIGINT;
  v_cycles BIGINT;
  v_term_start TIMESTAMPTZ;
BEGIN
  -- Get anchor time (prefer membership expiration, fallback to creation time)
  SELECT COALESCE(membership_expires_at, created_at)
  INTO v_anchor
  FROM public.profiles
  WHERE id = p_user_id;

  -- If no anchor found, use current time
  IF v_anchor IS NULL THEN
    v_anchor := NOW();
  END IF;

  v_now := NOW();
  v_period_seconds := p_period_days::BIGINT * 24 * 60 * 60;

  -- Calculate elapsed time from anchor to now
  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_anchor))::BIGINT;

  -- Calculate how many complete cycles have passed
  v_cycles := v_elapsed_seconds / v_period_seconds;

  -- Calculate current term start time
  v_term_start := v_anchor + (v_cycles * v_period_seconds * INTERVAL '1 second');

  -- Return next reset time (start of next cycle)
  RETURN v_term_start + (p_period_days * INTERVAL '1 day');
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_quota_reset_time(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.calculate_quota_reset_time(UUID, INTEGER) IS
  'Calculates next quota reset time based on user anchor point and period length';

-- ==========================================
-- FUNCTION 4: check_and_consume_answer_quota
-- Check and consume answer viewing quota (with duplicate prevention)
-- ==========================================

CREATE OR REPLACE FUNCTION public.check_and_consume_answer_quota(
  p_user_id UUID,
  p_question_id BIGINT
)
RETURNS TABLE (
  success BOOLEAN,
  code TEXT, -- 'success', 'already_viewed', 'quota_exceeded', 'admin', 'whitelisted'
  message TEXT,
  used INTEGER,
  total INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_quota_record RECORD;
  v_reset_at TIMESTAMPTZ;
  v_is_exempt BOOLEAN;
  v_tier TEXT;
BEGIN
  -- Get user's effective tier
  v_tier := public.get_user_membership_tier(p_user_id);

  -- CRITICAL: Admin users bypass all quota checks
  IF v_tier = 'admin' THEN
    RETURN QUERY SELECT
      true,
      'admin'::TEXT,
      'Admin user: unlimited access'::TEXT,
      0::INTEGER,
      999999::INTEGER,
      NOW() + INTERVAL '100 years';
    RETURN;
  END IF;

  -- Get user quota configuration
  SELECT * INTO v_config FROM public.get_user_quota_config(p_user_id, 'answer');
  v_is_exempt := v_config.is_exempt;

  -- Whitelist users bypass quota
  IF v_is_exempt THEN
    RETURN QUERY SELECT
      true,
      'whitelisted'::TEXT,
      'Whitelist user: unlimited access'::TEXT,
      0::INTEGER,
      999999::INTEGER,
      NOW() + INTERVAL '100 years';
    RETURN;
  END IF;

  -- Calculate expected reset time
  v_reset_at := public.calculate_quota_reset_time(p_user_id, v_config.period_days);

  -- Get or create user quota record
  SELECT * INTO v_quota_record
  FROM public.user_answer_quotas
  WHERE user_id = p_user_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.user_answer_quotas (user_id, answers_viewed, quota_reset_at, current_period_questions)
    VALUES (p_user_id, 0, v_reset_at, '{}')
    RETURNING * INTO v_quota_record;
  END IF;

  -- Check if quota needs reset
  IF NOW() >= v_quota_record.quota_reset_at THEN
    -- Reset quota
    UPDATE public.user_answer_quotas
    SET answers_viewed = 0,
        quota_reset_at = v_reset_at,
        current_period_questions = '{}'
    WHERE user_id = p_user_id
    RETURNING * INTO v_quota_record;
  END IF;

  -- Check if question was already viewed in this period (duplicate prevention)
  IF p_question_id::TEXT = ANY(v_quota_record.current_period_questions) THEN
    RETURN QUERY SELECT
      true,
      'already_viewed'::TEXT,
      'Question already viewed in this period'::TEXT,
      v_quota_record.answers_viewed,
      v_config.quota,
      v_quota_record.quota_reset_at;
    RETURN;
  END IF;

  -- Check if quota is exhausted
  IF v_quota_record.answers_viewed >= v_config.quota THEN
    RETURN QUERY SELECT
      false,
      'quota_exceeded'::TEXT,
      format('Quota exceeded: %s/%s answers viewed this period', v_quota_record.answers_viewed, v_config.quota),
      v_quota_record.answers_viewed,
      v_config.quota,
      v_quota_record.quota_reset_at;
    RETURN;
  END IF;

  -- Consume quota
  UPDATE public.user_answer_quotas
  SET answers_viewed = answers_viewed + 1,
      current_period_questions = array_append(current_period_questions, p_question_id::TEXT)
  WHERE user_id = p_user_id
  RETURNING * INTO v_quota_record;

  -- Return success
  RETURN QUERY SELECT
    true,
    'success'::TEXT,
    'Answer quota consumed successfully'::TEXT,
    v_quota_record.answers_viewed,
    v_config.quota,
    v_quota_record.quota_reset_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_consume_answer_quota(UUID, BIGINT) TO authenticated;

COMMENT ON FUNCTION public.check_and_consume_answer_quota(UUID, BIGINT) IS
  'Checks and consumes answer viewing quota. Admins and whitelisted users are exempt.';

-- ==========================================
-- FUNCTION 5: check_and_consume_paper_quota
-- Check and consume paper generation quota
-- ==========================================

CREATE OR REPLACE FUNCTION public.check_and_consume_paper_quota(
  p_user_id UUID,
  p_paper_id BIGINT DEFAULT NULL -- Optional: ID of generated paper
)
RETURNS TABLE (
  success BOOLEAN,
  code TEXT,
  message TEXT,
  used INTEGER,
  total INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_quota_record RECORD;
  v_reset_at TIMESTAMPTZ;
  v_is_exempt BOOLEAN;
  v_tier TEXT;
BEGIN
  -- Get user's effective tier
  v_tier := public.get_user_membership_tier(p_user_id);

  -- CRITICAL: Admin users bypass all quota checks
  IF v_tier = 'admin' THEN
    RETURN QUERY SELECT
      true,
      'admin'::TEXT,
      'Admin user: unlimited access'::TEXT,
      0::INTEGER,
      999999::INTEGER,
      NOW() + INTERVAL '100 years';
    RETURN;
  END IF;

  -- Get user quota configuration
  SELECT * INTO v_config FROM public.get_user_quota_config(p_user_id, 'paper');
  v_is_exempt := v_config.is_exempt;

  -- Whitelist users bypass quota
  IF v_is_exempt THEN
    RETURN QUERY SELECT
      true,
      'whitelisted'::TEXT,
      'Whitelist user: unlimited access'::TEXT,
      0::INTEGER,
      999999::INTEGER,
      NOW() + INTERVAL '100 years';
    RETURN;
  END IF;

  -- Calculate expected reset time
  v_reset_at := public.calculate_quota_reset_time(p_user_id, v_config.period_days);

  -- Get or create user quota record
  SELECT * INTO v_quota_record
  FROM public.user_paper_quotas
  WHERE user_id = p_user_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.user_paper_quotas (user_id, papers_generated, quota_reset_at, current_period_papers)
    VALUES (p_user_id, 0, v_reset_at, '{}')
    RETURNING * INTO v_quota_record;
  END IF;

  -- Check if quota needs reset
  IF NOW() >= v_quota_record.quota_reset_at THEN
    UPDATE public.user_paper_quotas
    SET papers_generated = 0,
        quota_reset_at = v_reset_at,
        current_period_papers = '{}'
    WHERE user_id = p_user_id
    RETURNING * INTO v_quota_record;
  END IF;

  -- Check if quota is exhausted
  IF v_quota_record.papers_generated >= v_config.quota THEN
    RETURN QUERY SELECT
      false,
      'quota_exceeded'::TEXT,
      format('Quota exceeded: %s/%s papers generated this period', v_quota_record.papers_generated, v_config.quota),
      v_quota_record.papers_generated,
      v_config.quota,
      v_quota_record.quota_reset_at;
    RETURN;
  END IF;

  -- Consume quota
  UPDATE public.user_paper_quotas
  SET papers_generated = papers_generated + 1,
      current_period_papers =
        CASE
          WHEN p_paper_id IS NOT NULL THEN array_append(current_period_papers, p_paper_id)
          ELSE current_period_papers
        END
  WHERE user_id = p_user_id
  RETURNING * INTO v_quota_record;

  -- Return success
  RETURN QUERY SELECT
    true,
    'success'::TEXT,
    'Paper quota consumed successfully'::TEXT,
    v_quota_record.papers_generated,
    v_config.quota,
    v_quota_record.quota_reset_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_consume_paper_quota(UUID, BIGINT) TO authenticated;

COMMENT ON FUNCTION public.check_and_consume_paper_quota(UUID, BIGINT) IS
  'Checks and consumes paper generation quota. Admins and whitelisted users are exempt.';

-- ==========================================
-- FUNCTION 6: get_user_usage_summary
-- Get comprehensive usage summary for a user (for display page)
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_user_usage_summary(p_user_id UUID)
RETURNS TABLE (
  membership_tier TEXT,
  membership_expires_at TIMESTAMPTZ,
  is_whitelisted BOOLEAN,
  user_role TEXT,

  answer_quota_used INTEGER,
  answer_quota_total INTEGER,
  answer_quota_reset_at TIMESTAMPTZ,

  paper_quota_used INTEGER,
  paper_quota_total INTEGER,
  paper_quota_reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_expires TIMESTAMPTZ;
  v_whitelisted BOOLEAN;
  v_role TEXT;
  v_answer_config RECORD;
  v_paper_config RECORD;
  v_answer_quota RECORD;
  v_paper_quota RECORD;
BEGIN
  -- Get user membership info and role
  SELECT
    p.membership_tier,
    p.membership_expires_at,
    p.is_whitelisted,
    p.role
  INTO v_tier, v_expires, v_whitelisted, v_role
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- Get answer quota configuration
  SELECT * INTO v_answer_config FROM public.get_user_quota_config(p_user_id, 'answer');

  -- Get paper quota configuration
  SELECT * INTO v_paper_config FROM public.get_user_quota_config(p_user_id, 'paper');

  -- Get answer quota usage
  SELECT
    COALESCE(answers_viewed, 0) AS used,
    quota_reset_at AS reset_at
  INTO v_answer_quota
  FROM public.user_answer_quotas
  WHERE user_id = p_user_id;

  -- If no record, use defaults
  IF NOT FOUND THEN
    v_answer_quota.used := 0;
    v_answer_quota.reset_at := public.calculate_quota_reset_time(p_user_id, v_answer_config.period_days);
  END IF;

  -- Get paper quota usage
  SELECT
    COALESCE(papers_generated, 0) AS used,
    quota_reset_at AS reset_at
  INTO v_paper_quota
  FROM public.user_paper_quotas
  WHERE user_id = p_user_id;

  -- If no record, use defaults
  IF NOT FOUND THEN
    v_paper_quota.used := 0;
    v_paper_quota.reset_at := public.calculate_quota_reset_time(p_user_id, v_paper_config.period_days);
  END IF;

  -- Return comprehensive summary
  RETURN QUERY SELECT
    v_tier,
    v_expires,
    v_whitelisted,
    v_role,

    v_answer_quota.used::INTEGER,
    v_answer_config.quota::INTEGER,
    v_answer_quota.reset_at,

    v_paper_quota.used::INTEGER,
    v_paper_config.quota::INTEGER,
    v_paper_quota.reset_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_usage_summary(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_usage_summary(UUID) IS
  'Returns comprehensive usage summary including membership status and quota usage for display';
