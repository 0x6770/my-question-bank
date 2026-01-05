import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/usage
 * Returns the current user's quota usage summary
 */
export async function GET() {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call database function to get usage summary
  const { data, error } = await supabase.rpc("get_user_usage_summary", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("Failed to fetch usage summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage data", details: error.message },
      { status: 500 },
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Usage data not found" },
      { status: 404 },
    );
  }

  const usage = data[0];

  // Format response
  return NextResponse.json({
    membership: {
      tier: usage.membership_tier,
      expiresAt: usage.membership_expires_at,
      isWhitelisted: usage.is_whitelisted,
      role: usage.user_role,
    },
    answers: {
      used: usage.answer_quota_used,
      total: usage.answer_quota_total,
      resetAt: usage.answer_quota_reset_at,
      percentage:
        usage.answer_quota_total > 0
          ? Math.round(
              (usage.answer_quota_used / usage.answer_quota_total) * 100,
            )
          : 0,
    },
    papers: {
      used: usage.paper_quota_used,
      total: usage.paper_quota_total,
      resetAt: usage.paper_quota_reset_at,
      percentage:
        usage.paper_quota_total > 0
          ? Math.round((usage.paper_quota_used / usage.paper_quota_total) * 100)
          : 0,
    },
  });
}
