import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../database.types";

type ProfileRow = Pick<Tables<"profiles">, "role">;
type ProfileRole = ProfileRow["role"];
type AdminRole = Extract<ProfileRole, "admin" | "super_admin">;

const roleLabels: Record<AdminRole, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
};

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

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          My Question Bank
        </Link>

        <div className="flex items-center gap-3">
          {adminRole ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/">{`Question Bank`}</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/console">{`Console(${roleLabels[adminRole]})`}</Link>
              </Button>
            </>
          ) : null}

          {user ? (
            <>
              <span className="text-sm text-muted-foreground">
                {user.email ?? "已登录"}
              </span>
              <LogoutButton size="sm" variant="outline">
                Logout
              </LogoutButton>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/auth/login">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
