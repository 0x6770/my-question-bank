import { BackToTopButton } from "@/components/back-to-top-button";
import { QuestionCard } from "@/components/question-card";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../database.types";

type QuestionWithImages = Tables<"questions"> & {
  question_images:
    | {
        id: number;
        storage_path: string;
        position: number;
        signedUrl?: string | null;
      }[]
    | null;
};

export default async function Home() {
  const supabase = await createClient();

  const { data: questions, error } = await supabase
    .from("questions")
    .select(
      `
        id,
        marks,
        difficulty,
        calculator,
        created_at,
        question_images (
          id,
          storage_path,
          position
        )
      `,
    )
    .order("created_at", { ascending: false });

  const imagePaths = new Set<string>();
  const normalized = (questions ?? []).map((question) => {
    const rawQuestion = question as unknown as QuestionWithImages;
    const sortedImages = (rawQuestion.question_images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    for (const image of sortedImages) {
      imagePaths.add(image.storage_path);
    }

    return {
      id: rawQuestion.id,
      marks: rawQuestion.marks,
      difficulty: rawQuestion.difficulty,
      calculator: rawQuestion.calculator,
      createdAt: rawQuestion.created_at,
      images: sortedImages,
    };
  });

  const paths = Array.from(imagePaths);
  const signedUrlMap: Record<string, string> = {};

  if (paths.length > 0) {
    const { data: signedUrls, error: signedError } = await supabase.storage
      .from("question_images")
      .createSignedUrls(paths, 3600);

    if (!signedError && signedUrls) {
      for (const item of signedUrls) {
        if (item.path && item.signedUrl) {
          signedUrlMap[item.path] = item.signedUrl;
        }
      }
    }
  }

  const normalizedWithSigned = normalized.map((question) => ({
    ...question,
    images: question.images.map((image) => ({
      ...image,
      signedUrl: signedUrlMap[image.storage_path] ?? null,
    })),
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">
            查看全部题目
          </h1>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              无法加载题目：{error.message}
            </div>
          ) : null}
        </header>
        {normalized.length === 0 && !error ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
            暂无题目，请先在 Console / Questions 中创建。
          </div>
        ) : (
          <div className="space-y-6">
            {normalizedWithSigned.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        )}
      </div>
      <BackToTopButton />
    </main>
  );
}
