import { AppNavbarClient } from "@/components/app-navbar-client";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../database.types";

type ProfileRow = Pick<Tables<"profiles">, "role">;
type ProfileRole = ProfileRow["role"];
type AdminRole = Extract<ProfileRole, "admin" | "super_admin">;

export async function AppNavbar() {
  const supabase = await createClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();

  const user = userResult.user ?? null;
  let adminRole: AdminRole | null = null;

  if (!userError && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profile?.role === "admin" || profile?.role === "super_admin") {
      adminRole = profile.role;
    }
  }

  const initialUser = user
    ? {
        id: user.id,
        email: user.email,
      }
    : null;

  return (
    <AppNavbarClient initialAdminRole={adminRole} initialUser={initialUser} />
  );
}
