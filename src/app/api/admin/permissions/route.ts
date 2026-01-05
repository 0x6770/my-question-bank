import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/permissions
 * Get global quota configuration
 * Requires: admin or super_admin role
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

  // Check if user has admin privileges
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  // Fetch quota configuration
  const { data, error } = await supabase
    .from("quota_configs")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Failed to fetch quota config:", error);
    return NextResponse.json(
      { error: "Failed to fetch configuration", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(data);
}

/**
 * POST /api/admin/permissions
 * Update global quota configuration
 * Requires: admin or super_admin role
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user has admin privileges
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  // Parse request body
  let updates: Record<string, unknown>;
  try {
    updates = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate updates (only allow quota config fields)
  const allowedFields = [
    "free_answer_quota",
    "free_answer_period_days",
    "free_paper_quota",
    "free_paper_period_days",
    "basic_answer_quota",
    "basic_answer_period_days",
    "basic_paper_quota",
    "basic_paper_period_days",
    "premium_answer_quota",
    "premium_answer_period_days",
    "premium_paper_quota",
    "premium_paper_period_days",
  ];

  const filteredUpdates: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  // Update quota configuration
  const { data, error } = await supabase
    .from("quota_configs")
    .update(filteredUpdates)
    .eq("id", 1)
    .select()
    .single();

  if (error) {
    console.error("Failed to update quota config:", error);
    return NextResponse.json(
      { error: "Failed to update configuration", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Quota configuration updated successfully",
    data,
  });
}
