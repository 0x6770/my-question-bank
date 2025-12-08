import { redirect } from "next/navigation";
import { QuestionCard } from "@/components/question-card";
import { createClient } from "@/lib/supabase/server";

type BookmarkedQuestion = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  bookmarkedAt: string | null;
  isAnswerViewed: boolean;
  chapterId: number | null;
  chapterName: string | null;
  subjectId: number | null;
  subjectName: string | null;
  images: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: bookmarkRows, error: bookmarkError } = await supabase
    .from("user_questions")
    .select("question_id, created_at, answer_viewed_at")
    .eq("is_bookmarked", true)
    .order("created_at", { ascending: false });

  const questionIds = (bookmarkRows ?? []).map((row) => row.question_id);
  const bookmarkedAtMap = new Map<number, string>();
  const answerViewedMap = new Map<number, boolean>();
  for (const row of bookmarkRows ?? []) {
    bookmarkedAtMap.set(row.question_id, row.created_at);
    answerViewedMap.set(row.question_id, Boolean(row.answer_viewed_at));
  }

  let questions: BookmarkedQuestion[] = [];
  let questionError: string | null = null;

  if (questionIds.length > 0) {
    const { data, error } = await supabase
      .from("questions")
      .select(
        `
        id,
        marks,
        difficulty,
        calculator,
        created_at,
        chapter_id,
        question_images ( id, storage_path, position ),
        answer_images ( id, storage_path, position ),
        chapters (
          name,
          subject_id,
          subjects ( name )
        )
      `,
      )
      .in("id", questionIds)
      .order("created_at", { ascending: false });

    if (error || !data) {
      questionError = error?.message ?? "无法加载收藏的题目。";
    } else {
      const questionImagePaths = new Set<string>();
      const answerImagePaths = new Set<string>();

      data.forEach((row) => {
        (row.question_images ?? []).forEach((img) => {
          questionImagePaths.add(img.storage_path);
        });
        (row.answer_images ?? []).forEach((img) => {
          answerImagePaths.add(img.storage_path);
        });
      });

      const [questionSigned, answerSigned] = await Promise.all([
        questionImagePaths.size > 0
          ? supabase.storage
              .from("question_images")
              .createSignedUrls(Array.from(questionImagePaths), 3600)
          : Promise.resolve({ data: null }),
        answerImagePaths.size > 0
          ? supabase.storage
              .from("answer_images")
              .createSignedUrls(Array.from(answerImagePaths), 3600)
          : Promise.resolve({ data: null }),
      ]);

      const questionSignedMap: Record<string, string> = {};
      const answerSignedMap: Record<string, string> = {};
      questionSigned.data?.forEach((item) => {
        if (item.path && item.signedUrl) {
          questionSignedMap[item.path] = item.signedUrl;
        }
      });
      answerSigned.data?.forEach((item) => {
        if (item.path && item.signedUrl) {
          answerSignedMap[item.path] = item.signedUrl;
        }
      });

      questions = data.map((row) => ({
        id: row.id,
        marks: row.marks ?? 0,
        difficulty: row.difficulty ?? 1,
        calculator: row.calculator ?? false,
        createdAt: row.created_at,
        bookmarkedAt: bookmarkedAtMap.get(row.id) ?? null,
        chapterId: row.chapter_id ?? null,
        chapterName: row.chapters?.name ?? null,
        subjectId: row.chapters?.subject_id ?? null,
        subjectName: row.chapters?.subjects?.name ?? null,
        isAnswerViewed: answerViewedMap.get(row.id) ?? false,
        isBookmarked: true,
        images: (row.question_images ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((img) => ({
            ...img,
            signedUrl: questionSignedMap[img.storage_path] ?? null,
          })),
        answerImages: (row.answer_images ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((img) => ({
            ...img,
            signedUrl: answerSignedMap[img.storage_path] ?? null,
          })),
      }));
    }
  }

  const bookmarksCount = bookmarkRows?.length ?? 0;
  const loadError =
    bookmarkError || questionError
      ? (bookmarkError?.message ?? questionError ?? "无法加载收藏列表。")
      : null;

  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("zh-CN", { hour12: false })
      : "未知时间";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">My Account</h1>
          <p className="text-sm text-slate-500">
            当前用户：{user.email ?? user.id}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">我的收藏</h2>
              <p className="text-sm text-slate-500">
                共收藏 {bookmarksCount} 道题目。
              </p>
            </div>
          </div>

          {loadError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              无法加载收藏列表：{loadError}
            </div>
          ) : bookmarksCount === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              还没有收藏题目，去题库挑选一些吧。
            </div>
          ) : (
            <div className="mt-4 space-y-8">
              {questions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <p className="text-xs text-slate-500">
                    收藏于：{formatDate(q.bookmarkedAt)}
                  </p>
                  <QuestionCard question={q} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
