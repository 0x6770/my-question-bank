"use client";

import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const questionBankOptions = useMemo(
    () => [
      { href: "/questions?bank=typical", label: "Topical Questions" },
      { href: "/questions?bank=past-paper", label: "Past Paper Questions" },
    ],
    [],
  );

  const otherNavItems = useMemo(
    () => [
      { href: "/account", label: "Account" },
      { href: "/papers", label: "Exam Paper" },
      { href: "/paper-builder", label: "Paper Builder" },
    ],
    [],
  );

  const isQuestionsPage =
    pathname === "/questions" ||
    pathname === "/" ||
    pathname?.startsWith("/?") ||
    pathname?.startsWith("/questions?");

  const isTypicalQuestions =
    isQuestionsPage &&
    (pathname?.includes("bank=typical") ||
      (!pathname?.includes("bank=") && !pathname?.includes("?")));

  const isPastPaperQuestions =
    isQuestionsPage && pathname?.includes("bank=past-paper");

  return (
    <header className="sticky top-0 z-50 border-b bg-background px-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-3">
        <nav className="flex items-center gap-4 text-sm font-semibold text-slate-700">
          {otherNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(`${item.href}?`);
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

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 transition",
                "hover:text-slate-900 hover:underline hover:underline-offset-4",
                isQuestionsPage
                  ? "text-slate-900 underline underline-offset-4"
                  : "text-slate-700",
              )}
            >
              Question Bank
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {questionBankOptions.map((option) => (
                <DropdownMenuItem key={option.href} asChild>
                  <Link
                    href={option.href}
                    className={cn(
                      "cursor-pointer",
                      option.href.includes("bank=typical") && isTypicalQuestions
                        ? "font-semibold"
                        : option.href.includes("bank=past-paper") &&
                            isPastPaperQuestions
                          ? "font-semibold"
                          : "",
                    )}
                  >
                    {option.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span>{user.email ?? "Logged in"}</span>
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
