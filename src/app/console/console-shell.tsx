"use client";

import {
  FileQuestion,
  FileText,
  Menu,
  Settings,
  Tag,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { AdminRole } from "./types";

type NavItem = {
  href: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  requiresSuperAdmin?: boolean;
  children?: NavItem[];
};

const navItems: NavItem[] = [
  {
    href: "/console/questions",
    label: "Questions",
    icon: FileQuestion,
    children: [
      { href: "/console/subjects", label: "Subjects" },
      { href: "/console/questions/tags", label: "Tags" },
    ],
  },
  {
    href: "/console/exam-papers",
    label: "Exam Papers",
    icon: FileText,
    children: [
      { href: "/console/exam-papers/subjects", label: "Subjects" },
      { href: "/console/exam-papers/tags", label: "Tags" },
    ],
  },
  { href: "/console/tags", label: "Tags", icon: Tag },
  {
    href: "/console/permissions",
    label: "Permissions",
    icon: Settings,
    requiresSuperAdmin: true,
  },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleNavItems = useMemo(
    () =>
      navItems.filter(
        (item) => !item.requiresSuperAdmin || adminRole === "super_admin",
      ),
    [adminRole],
  );

  const renderNavItems = () => (
    <ul className="space-y-1">
      {visibleNavItems.map(({ href, icon: Icon, label, children }) => {
        const hasChildren = Boolean(children?.length);
        const isActive = hasChildren
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {Icon ? <Icon className="size-5" /> : null}
              {label}
            </Link>
            {children?.length ? (
              <ul className="mt-1 space-y-1 pl-8">
                {children.map((child) => {
                  const childActive =
                    pathname === child.href ||
                    pathname.startsWith(`${child.href}/`);
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                          childActive
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 hover:bg-slate-100",
                        )}
                      >
                        <span className="h-px w-4 rounded-full bg-slate-300" />
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-1 min-h-0 bg-slate-100 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-slate-200 bg-white">
        <nav className="px-3 py-3">{renderNavItems()}</nav>
      </aside>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 transform bg-white transition-transform duration-300 ease-in-out lg:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Console</h2>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="px-3 py-3">{renderNavItems()}</nav>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex items-center border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="ml-3 text-lg font-semibold text-slate-900">Console</h1>
        </header>

        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </section>
    </div>
  );
}
