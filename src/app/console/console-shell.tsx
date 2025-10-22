"use client";

import {
  BookOpen,
  FileQuestion,
  LayoutDashboard,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { AdminRole } from "./types";

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
  children: ReactNode;
};

export function ConsoleShell({ adminRole, children }: ConsoleShellProps) {
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
        <nav className="px-3 py-3">
          <ul className="space-y-1">
            {visibleNavItems.map(({ href, icon: Icon, label }) => {
              const isActive =
                pathname === href || pathname.startsWith(`${href}/`);
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
          {children}
        </div>
      </section>
    </div>
  );
}
