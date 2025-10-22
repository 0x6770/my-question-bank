export default function ConsoleQuestionsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Question Management
        </h1>
        <p className="text-sm text-slate-500">
          管理题目、草稿与审核工作流的页面即将上线。
        </p>
      </header>

      <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        题目管理相关的内容稍后将显示在这里。
      </div>
    </div>
  );
}
