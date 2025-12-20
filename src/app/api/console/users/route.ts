import { NextResponse } from "next/server";

import { isAdminRole } from "@/app/console/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CreateUserPayload = {
  email?: string;
  password?: string;
};

async function getRequesterRole() {
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

  if (profileError || !profile?.role) {
    return { error: "Forbidden", status: 403 };
  }

  if (!isAdminRole(profile.role)) {
    return { error: "Forbidden", status: 403 };
  }

  return { role: profile.role, userId: userResult.user.id };
}

export async function POST(request: Request) {
  const requester = await getRequesterRole();
  if ("error" in requester) {
    return NextResponse.json(
      { error: requester.error },
      { status: requester.status },
    );
  }

  let payload: CreateUserPayload | null = null;
  try {
    payload = (await request.json()) as CreateUserPayload;
  } catch {
    payload = null;
  }

  const email = payload?.email?.trim() ?? "";
  const password = payload?.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const { data: createdUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !createdUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create user." },
      { status: 400 },
    );
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, email, role, created_at")
    .eq("id", createdUser.user.id)
    .maybeSingle();

  const user = profile ?? {
    id: createdUser.user.id,
    email: createdUser.user.email ?? email,
    role: "user",
    created_at: new Date().toISOString(),
  };

  return NextResponse.json({ user });
}
