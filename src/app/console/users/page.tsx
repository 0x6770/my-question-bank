export default function ConsoleUsersPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          User Management
        </h1>
        <p className="text-sm text-slate-500">
          超级管理员可在此审核或管理平台用户。
        </p>
      </header>

      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        用户管理功能正在规划中，请稍候。
      </div>
    </div>
  );
}
