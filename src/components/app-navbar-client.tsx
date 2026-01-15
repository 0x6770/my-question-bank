"use client";

import { LogOut, Menu, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
      { href: "/questions?bank=checkpoint", label: "Checkpoint" },
      { href: "/papers", label: "Exam Paper" },
      { href: "/questions?bank=questionbank", label: "Questionbank" },
      { href: "/paper-builder", label: "Worksheet Builder" },
    ],
    [],
  );

  if (pathname?.startsWith("/auth")) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b bg-background px-4 sm:px-6 lg:px-8 print:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-3">
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4 text-sm font-semibold text-slate-700">
            {navItems.map((item) => {
              // Parse item.href to get path and query parts
              const [itemPath, itemQuery] = item.href.split("?");
              const currentQuery = searchParams.toString();

              // Check if path and query parameters match
              const isActive =
                pathname === itemPath &&
                (itemQuery ? currentQuery === itemQuery : !currentQuery);

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

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </button>

          {/* User Info - Desktop */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="hidden lg:inline">
                    {user.email ?? "Logged in"}
                  </span>
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
                  <span className="hidden sm:inline">Logout</span>
                </LogoutButton>
              </>
            ) : (
              <Button asChild size="sm">
                <Link href="/auth/login">Login</Link>
              </Button>
            )}
          </div>

          {/* User Info - Mobile (Icon Only) */}
          <div className="md:hidden flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                {roleMeta ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
                      roleMeta.color,
                    )}
                  >
                    {roleMeta.badge}
                  </span>
                ) : (
                  <div className="flex items-center justify-center size-8 rounded-full bg-slate-100 text-slate-600">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            ) : (
              <Button asChild size="sm">
                <Link href="/auth/login">Login</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[57px] z-40 border-b bg-background shadow-lg print:hidden">
          <nav className="mx-auto max-w-6xl px-4 py-2">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const [itemPath, itemQuery] = item.href.split("?");
                const currentQuery = searchParams.toString();
                const isActive =
                  pathname === itemPath &&
                  (itemQuery ? currentQuery === itemQuery : !currentQuery);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "block rounded-lg px-4 py-3 text-sm font-medium transition",
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              {user && (
                <>
                  <li className="border-t border-slate-200 pt-2">
                    <div className="px-4 py-2 text-sm text-slate-600">
                      {user.email ?? "Logged in"}
                    </div>
                  </li>
                  <li>
                    <LogoutButton
                      size="sm"
                      variant="outline"
                      className="w-full justify-start gap-2"
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      Logout
                    </LogoutButton>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
