"use client";

import {
  BookOpen,
  FileQuestion,
  Image as ImageIcon,
  LayoutDashboard,
  Plus,
  SquarePen,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminRole } from "./page";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  requiresSuperAdmin?: boolean;
};

const navItems: NavItem[] = [
  { href: "/console/questions", label: "Questions", icon: FileQuestion },
  { href: "/console/tags", label: "Tags", icon: Tag },
  { href: "/console/subjects", label: "Subjects", icon: BookOpen },
  {
    href: "/console/users",
    label: "Users",
    icon: Users,
    requiresSuperAdmin: true,
  },
];

type ConsoleShellProps = {
  adminRole: AdminRole;
  userEmail: string | null;
  userName: string | null;
};

export function ConsoleShell({ adminRole }: ConsoleShellProps) {
  const pathname = usePathname();
  const visibleNavItems = useMemo(
    () =>
      navItems.filter(
        (item) => !item.requiresSuperAdmin || adminRole === "super_admin",
      ),
    [adminRole],
  );

  return (
    <div className="flex flex-1 min-h-0 bg-slate-100 text-slate-900">
      <aside className="flex w-72 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-6 py-7">
          <span className="flex size-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <LayoutDashboard className="size-5" />
          </span>
          <div>
            <div className="text-base font-semibold tracking-tight">
              Question Bank
            </div>
            <div className="text-xs text-slate-500">Admin Panel</div>
          </div>
        </div>

        <nav className="px-3">
          <ul className="space-y-1">
            {visibleNavItems.map(({ href, icon: Icon, label }) => {
              const isActive =
                pathname === href ||
                (pathname?.startsWith(href) && href !== "/console") ||
                (href === "/console/questions" && pathname === "/console");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    <Icon className="size-5" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-8 py-10">
          <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Question Management
              </h1>
              <p className="text-sm text-slate-500">
                管理题库内容、标签与科目。
              </p>
            </div>
            <Button
              asChild
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <Link href="/console/questions/new">
                <Plus className="size-4" />
                New Question
              </Link>
            </Button>
          </header>

          <div className="flex flex-1 flex-col gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      hello
                    </h2>
                    <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      aaa
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-slate-500 hover:text-slate-900"
                    >
                      <SquarePen className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ImageIcon className="size-4" />1 image
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
