import Image from "next/image";

type QuestionImage = {
  id: number;
  storage_path: string;
  position: number;
};

type QuestionCardProps = {
  question: {
    id: number;
    marks: number;
    difficulty: number;
    calculator: boolean;
    createdAt: string;
    images: QuestionImage[];
  };
};

const difficultyMeta: Record<
  number,
  { label: string; level: number; accent: string }
> = {
  1: { label: "Easy", level: 1, accent: "text-emerald-600" },
  2: { label: "Medium", level: 2, accent: "text-amber-600" },
  3: { label: "Hard", level: 3, accent: "text-orange-600" },
  4: { label: "Challenge", level: 4, accent: "text-rose-600" },
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function QuestionCard({ question }: QuestionCardProps) {
  const meta = difficultyMeta[question.difficulty] ?? {
    label: "Unknown",
    level: 0,
    accent: "text-slate-500",
  };

  return (
    <article className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${question.calculator ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}
          >
            {question.calculator ? "Calculator" : "No Calculator"}
          </span>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Question #{question.id}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className={`font-semibold ${meta.accent}`}>{meta.label}</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <span
                key={`${question.id}-difficulty-${index}`}
                className={`h-2.5 w-2.5 rounded-full ${index < meta.level ? "bg-amber-500" : "bg-slate-200"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="text-sm font-medium text-slate-600">
          [Maximum mark: {question.marks}]
        </p>
      </div>

      {question.images.length > 0 ? (
        <div className="px-4 pb-0">
          <div className="flex flex-col space-y-0">
            {question.images.map((image) => (
              <Image
                key={image.id}
                src={image.storage_path}
                alt={`Question ${question.id} image`}
                width={1600}
                height={1200}
                className="block h-auto w-full object-contain"
                sizes="(max-width: 900px) 100vw, 900px"
                unoptimized
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 text-sm text-slate-500">暂无图片内容。</div>
      )}

      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
        <span>创建于：{formatDate(question.createdAt)}</span>
        <span>难度等级：{question.difficulty}</span>
      </div>
    </article>
  );
}
