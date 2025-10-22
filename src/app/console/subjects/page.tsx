export default function ConsoleSubjectsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Subject Management
        </h1>
        <p className="text-sm text-slate-500">
          这里将用于配置学科、章节以及与题目的关联关系。
        </p>
      </header>

      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        学科相关的管理功能敬请期待。
      </div>
    </div>
  );
}
