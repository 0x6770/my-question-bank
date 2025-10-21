"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "../../database.types";

type ProfileRow = Pick<Tables<"profiles">, "role">;
type ProfileRole = ProfileRow["role"];
type AdminRole = Extract<ProfileRole, "admin" | "super_admin">;

type UserSummary = {
  id: string;
  email: string | undefined;
};

type AppNavbarClientProps = {
  initialUser: UserSummary | null;
  initialAdminRole: AdminRole | null;
};

const roleLabels: Record<AdminRole, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
};

export function AppNavbarClient({
  initialUser,
  initialAdminRole,
}: AppNavbarClientProps) {
  const [user, setUser] = useState<UserSummary | null>(initialUser);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(
    initialAdminRole,
  );

  useEffect(() => {
    const supabase = createClient();

    const fetchRole = async (userId: string | null) => {
      if (!userId) {
        setAdminRole(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<ProfileRow>();

      if (!error && (data?.role === "admin" || data?.role === "super_admin")) {
        setAdminRole(data.role);
      } else {
        setAdminRole(null);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user
        ? { id: session.user.id, email: session.user.email }
        : null;

      setUser(nextUser);
      void fetchRole(nextUser?.id ?? null);
    });

    if (initialUser && !initialAdminRole) {
      void fetchRole(initialUser.id);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, [initialAdminRole, initialUser]);

  const roleLabel = useMemo(
    () => (adminRole ? roleLabels[adminRole] : null),
    [adminRole],
  );

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          My Question Bank
        </Link>

        <div className="flex items-center gap-3">
          {roleLabel ? (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/">Question Bank</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/console">{`Console(${roleLabel})`}</Link>
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
