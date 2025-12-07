"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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

export function AppNavbarClient({
  initialUser,
  initialAdminRole,
}: AppNavbarClientProps) {
  const [user, setUser] = useState<UserSummary | null>(initialUser);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(
    initialAdminRole,
  );
  const pathname = usePathname();

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

  const roleLabelMap: Record<AdminRole, { badge: string; color: string }> = {
    admin: { badge: "Admin", color: "bg-blue-100 text-blue-700" },
    super_admin: { badge: "Super Admin", color: "bg-red-100 text-red-700" },
  };

  const roleMeta = adminRole ? roleLabelMap[adminRole] : null;

  const navItems = useMemo(
    () => [
      { href: "/account", label: "Account" },
      { href: "/questions", label: "Question Bank" },
      { href: "/papers", label: "Exam Paper" },
    ],
    [],
  );

  const isQuestionsPage =
    pathname === "/questions" ||
    pathname === "/" ||
    pathname?.startsWith("/?") ||
    pathname?.startsWith("/questions?");

  return (
    <header className="sticky top-0 z-50 border-b bg-background px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-3">
        <nav className="flex items-center gap-4 text-sm font-semibold text-slate-700">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? isQuestionsPage
                : pathname === item.href ||
                  pathname?.startsWith(`${item.href}?`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-2 py-1 transition",
                  "hover:text-slate-900 hover:underline hover:underline-offset-4",
                  isActive
                    ? "text-slate-900 underline underline-offset-4"
                    : "text-slate-700",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span>{user.email ?? "已登录"}</span>
                {roleMeta ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                      roleMeta.color,
                    )}
                  >
                    {roleMeta.badge}
                  </span>
                ) : null}
              </span>
              <LogoutButton size="sm" variant="outline" className="gap-2">
                <LogOut className="size-4" aria-hidden="true" />
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
