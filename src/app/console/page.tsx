import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../database.types";
import { ConsoleShell } from "./console-shell";

type ProfileRow = Pick<Tables<"profiles">, "role">;
type ProfileRole = ProfileRow["role"];
export type AdminRole = Extract<ProfileRole, "admin" | "super_admin">;

function isAdminRole(role: ProfileRole | null | undefined): role is AdminRole {
  return role === "admin" || role === "super_admin";
}

export default async function ConsolePage() {
  const supabase = await createClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();

  if (userError || !userResult.user) {
    redirect("/auth/login");
  }

  const user = userResult.user;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const adminRole = profile?.role;

  if (profileError || !isAdminRole(adminRole)) {
    redirect("/");
  }

  const userName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;

  return (
    <ConsoleShell
      adminRole={adminRole}
      userEmail={user.email ?? null}
      userName={userName}
    />
  );
}
