import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ userId: string }>;

type PasswordPayload = {
  password?: string;
};

async function getSuperAdmin() {
  const supabase = await createClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();

  if (userError || !userResult.user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 };
  }

  return { userId: userResult.user.id };
}

async function getTargetRole(targetId: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", targetId)
    .maybeSingle();

  if (error || !data?.role) {
    return { error: "User not found", status: 404 };
  }

  return { role: data.role };
}

export async function PATCH(request: Request, context: { params: Params }) {
  const requester = await getSuperAdmin();
  if ("error" in requester) {
    return NextResponse.json(
      { error: requester.error },
      { status: requester.status },
    );
  }

  const { userId } = await context.params;
  const targetRole = await getTargetRole(userId);
  if ("error" in targetRole) {
    return NextResponse.json(
      { error: targetRole.error },
      { status: targetRole.status },
    );
  }

  if (targetRole.role === "super_admin") {
    return NextResponse.json(
      { error: "Super admin accounts cannot be updated here." },
      { status: 403 },
    );
  }

  let payload: PasswordPayload | null = null;
  try {
    payload = (await request.json()) as PasswordPayload;
  } catch {
    payload = null;
  }

  const password = payload?.password ?? "";
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_request: Request, context: { params: Params }) {
  const requester = await getSuperAdmin();
  if ("error" in requester) {
    return NextResponse.json(
      { error: requester.error },
      { status: requester.status },
    );
  }

  const { userId } = await context.params;
  if (userId === requester.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 },
    );
  }

  const targetRole = await getTargetRole(userId);
  if ("error" in targetRole) {
    return NextResponse.json(
      { error: targetRole.error },
      { status: targetRole.status },
    );
  }

  if (targetRole.role === "super_admin") {
    return NextResponse.json(
      { error: "Super admin accounts cannot be deleted here." },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
