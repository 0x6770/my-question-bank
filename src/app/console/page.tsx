import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../database.types";

const quickActions = [
  { label: "新建试题", description: "从头创建一道新的题目" },
  { label: "批量导入", description: "导入 Excel 或 CSV 题库" },
  { label: "审阅待发布", description: "查看待审核的题目列表" },
];

const activityLog = [
  {
    title: "新增题目",
    description: "王老师发布了 2 道数学选择题",
    timestamp: "今天 · 09:45",
  },
  {
    title: "批量导入",
    description: "李老师导入了英语阅读理解题",
    timestamp: "昨天 · 17:12",
  },
  {
    title: "权限调整",
    description: "超级管理员更新了教研组权限",
    timestamp: "昨天 · 10:03",
  },
];

const metrics = [
  { label: "题库总量", value: "1,284", trend: "+8 本周" },
  { label: "待审核", value: "23", trend: "5 需加急" },
  { label: "已发布试卷", value: "47", trend: "+3 本月" },
  { label: "教师活跃数", value: "18", trend: "上周 +12%" },
];

type ProfileRow = Pick<Tables<"profiles">, "role">;
type ProfileRole = ProfileRow["role"];
type AllowedRole = Extract<ProfileRole, "admin" | "super_admin">;

const roleDisplayMap: Record<AllowedRole, string> = {
  admin: "管理员",
  super_admin: "超级管理员",
};

export default async function ConsolePage() {
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
    .maybeSingle<ProfileRow>();

  if (profileError || !profile?.role) {
    redirect("/");
  }

  const role = profile.role;
  if (role !== "admin" && role !== "super_admin") {
    redirect("/");
  }
  const roleDisplay = roleDisplayMap[role];

  return (
    <main className="flex min-h-svh flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">管理控制台</h1>
            <p className="text-muted-foreground">
              欢迎回来，{user.email ?? "管理员"}（{roleDisplay}）
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">导出报表</Button>
            <Button>创建任务</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          在这里管理题库、审核流程与教师权限。以下数据仅为演示，可接入实际业务接口。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-2xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.trend}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>最新活动</CardTitle>
            <CardDescription>记录最近 48 小时内的重要操作</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activityLog.map((entry) => (
              <div key={entry.title} className="border-l pl-4">
                <p className="font-medium">{entry.title}</p>
                <p className="text-sm text-muted-foreground">
                  {entry.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.timestamp}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>快捷操作</CardTitle>
            <CardDescription>常用管理功能快速入口</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {quickActions.map((action) => (
              <div
                key={action.label}
                className="flex items-start justify-between gap-4"
              >
                <div>
                  <p className="font-medium">{action.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {action.description}
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  前往
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
