import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";

import { ConsoleShell } from "./console-shell";
import { isAdminRole } from "./types";

export const metadata: Metadata = {
  title: "My Question Bank | Console",
};

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
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
    .maybeSingle();

  const adminRole = profile?.role ?? null;

  if (profileError || !isAdminRole(adminRole)) {
    redirect("/");
  }

  return <ConsoleShell adminRole={adminRole}>{children}</ConsoleShell>;
}
