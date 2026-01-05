import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/admin/users/[userId]/membership
 * Update user membership settings
 * Requires: admin or super_admin role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const supabase = await createClient();
  const { userId } = await params;

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
  let body: {
    membership_tier?: "basic" | "premium";
    membership_expires_at?: string | null;
    is_whitelisted?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { membership_tier, membership_expires_at, is_whitelisted } = body;

  // Validate membership_tier if provided
  if (membership_tier && !["basic", "premium"].includes(membership_tier)) {
    return NextResponse.json(
      { error: "Invalid membership_tier. Must be: basic or premium" },
      { status: 400 },
    );
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  if (membership_tier !== undefined) {
    updates.membership_tier = membership_tier;
  }
  if (membership_expires_at !== undefined) {
    updates.membership_expires_at = membership_expires_at;
  }
  if (is_whitelisted !== undefined) {
    updates.is_whitelisted = is_whitelisted;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Update user membership
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select(
      "id, email, role, membership_tier, membership_expires_at, is_whitelisted",
    )
    .single();

  if (error) {
    console.error("Failed to update user membership:", error);

    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update membership", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "User membership updated successfully",
    data,
  });
}

/**
 * GET /api/admin/users/[userId]/membership
 * Get user membership details
 * Requires: admin or super_admin role
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const supabase = await createClient();
  const { userId } = await params;

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

  // Fetch user membership details
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, email, role, membership_tier, membership_expires_at, is_whitelisted, created_at",
    )
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to fetch user", details: error.message },
      { status: 500 },
    );
  }

  // Also fetch usage summary
  const { data: usageData } = await supabase.rpc("get_user_usage_summary", {
    p_user_id: userId,
  });

  return NextResponse.json({
    user: data,
    usage: usageData && usageData.length > 0 ? usageData[0] : null,
  });
}
