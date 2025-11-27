import { BackToTopButton } from "@/components/back-to-top-button";
import { QuestionBrowser } from "@/components/question-browser";
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
  answer_images?:
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
        chapter_id,
        marks,
        difficulty,
        calculator,
        created_at,
        question_images (
          id,
          storage_path,
          position
        ),
        answer_images (
          id,
          storage_path,
          position
        )
      `,
    )
    .order("created_at", { ascending: false });

  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id, position")
    .order("position", { ascending: true });

  const questionImagePaths = new Set<string>();
  const answerImagePaths = new Set<string>();
  const chapterMap = new Map(
    (chapters ?? []).map((chapter) => [chapter.id, chapter]),
  );
  const normalized = (questions ?? []).map((question) => {
    const rawQuestion = question as unknown as QuestionWithImages;
    const sortedImages = (rawQuestion.question_images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    for (const image of sortedImages) {
      questionImagePaths.add(image.storage_path);
    }

    const sortedAnswerImages = (rawQuestion.answer_images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    for (const image of sortedAnswerImages) {
      answerImagePaths.add(image.storage_path);
    }

    return {
      id: rawQuestion.id,
      marks: rawQuestion.marks,
      difficulty: rawQuestion.difficulty,
      calculator: rawQuestion.calculator,
      createdAt: rawQuestion.created_at,
      chapterId: rawQuestion.chapter_id ?? null,
      subjectId:
        chapterMap.get(rawQuestion.chapter_id ?? 0)?.subject_id ?? null,
      images: sortedImages,
      answerImages: sortedAnswerImages,
    };
  });

  const questionPaths = Array.from(questionImagePaths);
  const answerPaths = Array.from(answerImagePaths);
  const questionSignedUrlMap: Record<string, string> = {};
  const answerSignedUrlMap: Record<string, string> = {};

  if (questionPaths.length > 0) {
    const { data: signedUrls, error: signedError } = await supabase.storage
      .from("question_images")
      .createSignedUrls(questionPaths, 3600);

    if (!signedError && signedUrls) {
      for (const item of signedUrls) {
        if (item.path && item.signedUrl) {
          questionSignedUrlMap[item.path] = item.signedUrl;
        }
      }
    }
  }

  if (answerPaths.length > 0) {
    const { data: signedUrls, error: signedError } = await supabase.storage
      .from("answer_images")
      .createSignedUrls(answerPaths, 3600);

    if (!signedError && signedUrls) {
      for (const item of signedUrls) {
        if (item.path && item.signedUrl) {
          answerSignedUrlMap[item.path] = item.signedUrl;
        }
      }
    }
  }

  const normalizedWithSigned = normalized.map((question) => ({
    ...question,
    images: question.images.map((image) => ({
      ...image,
      signedUrl: questionSignedUrlMap[image.storage_path] ?? null,
    })),
    answerImages: question.answerImages.map((image) => ({
      ...image,
      signedUrl: answerSignedUrlMap[image.storage_path] ?? null,
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
            暂无题目
          </div>
        ) : (
          <QuestionBrowser
            questions={normalizedWithSigned}
            subjects={subjects ?? []}
            chapters={
              chapters?.map((chapter) => ({
                id: chapter.id,
                name: chapter.name,
                subjectId: chapter.subject_id ?? null,
                parentChapterId: chapter.parent_chapter_id ?? null,
              })) ?? []
            }
          />
        )}
      </div>
      <BackToTopButton />
    </main>
  );
}
