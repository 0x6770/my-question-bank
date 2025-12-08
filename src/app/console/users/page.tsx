import { createClient } from "@/lib/supabase/server";
import { UserAccessManager } from "./user-access-manager";

export default async function ConsoleUsersPage() {
  const supabase = await createClient();

  const [
    { data: profiles, error: profilesError },
    { data: accessRows, error: accessError },
    { data: subjects, error: subjectsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("user_subject_access")
      .select(
        "user_id, subject:subjects(id, name, exam_board:exam_boards(name))",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("subjects")
      .select("id, name, exam_board:exam_boards(name)")
      .order("name", { ascending: true }),
  ]);

  const loadError =
    profilesError || accessError || subjectsError
      ? "无法加载用户或授权数据，请稍后重试。"
      : null;

  const accessGrants = (accessRows ?? [])
    .filter((row) => row.subject)
    .map((row) => ({ userId: row.user_id, subjectId: row.subject?.id }));

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          User Management
        </h1>
        <p className="text-sm text-slate-500">查看并管理用户可访问的学科。</p>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">用户列表</h2>
          <p className="text-sm text-slate-500">
            可直接调整 subject 访问权限。
          </p>
        </div>
        <UserAccessManager
          users={profiles ?? []}
          subjects={subjects ?? []}
          accessGrants={accessGrants}
        />
      </div>
    </div>
  );
}
