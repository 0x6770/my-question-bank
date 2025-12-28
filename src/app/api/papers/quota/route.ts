import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const QUOTA_LIMIT = 30; // 30 papers per quota period
const QUOTA_PERIOD_DAYS = 30; // 30 days

export async function GET() {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch user quota
  const { data: quotaData, error: quotaError } = await supabase
    .from("user_paper_quotas")
    .select("papers_generated, quota_reset_at")
    .eq("user_id", user.id)
    .single();

  let currentQuota = quotaData;

  // If no quota record exists, create one
  if (quotaError?.code === "PGRST116") {
    const resetAt = new Date();
    resetAt.setDate(resetAt.getDate() + QUOTA_PERIOD_DAYS);

    const { data: newQuota, error: createQuotaError } = await supabase
      .from("user_paper_quotas")
      .insert({
        user_id: user.id,
        papers_generated: 0,
        quota_reset_at: resetAt.toISOString(),
      })
      .select("papers_generated, quota_reset_at")
      .single();

    if (createQuotaError) {
      return NextResponse.json(
        { error: createQuotaError.message },
        { status: 500 },
      );
    }

    currentQuota = newQuota;
  } else if (quotaError) {
    return NextResponse.json({ error: quotaError.message }, { status: 500 });
  }

  if (!currentQuota) {
    return NextResponse.json(
      { error: "Failed to retrieve quota information" },
      { status: 500 },
    );
  }

  // Check if quota needs to be reset
  const now = new Date();
  const resetAt = new Date(currentQuota.quota_reset_at);

  if (now >= resetAt) {
    // Reset quota
    const newResetAt = new Date();
    newResetAt.setDate(newResetAt.getDate() + QUOTA_PERIOD_DAYS);

    const { data: updatedQuota, error: resetError } = await supabase
      .from("user_paper_quotas")
      .update({
        papers_generated: 0,
        quota_reset_at: newResetAt.toISOString(),
      })
      .eq("user_id", user.id)
      .select("papers_generated, quota_reset_at")
      .single();

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    currentQuota = updatedQuota;
  }

  return NextResponse.json({
    quota_limit: QUOTA_LIMIT,
    papers_generated: currentQuota.papers_generated,
    quota_remaining: QUOTA_LIMIT - currentQuota.papers_generated,
    quota_reset_at: currentQuota.quota_reset_at,
  });
}
