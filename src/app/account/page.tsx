import { redirect } from "next/navigation";
import { UsageSummary } from "@/components/usage-summary";
import { createClient } from "@/lib/supabase/server";
import { AccountTabs } from "./account-tabs";

type BookmarkedQuestion = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  bookmarkedAt: string | null;
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
    .select(
      "question_id, created_at, answer_viewed_at, completed_at, is_bookmarked",
    )
    .order("created_at", { ascending: false });

  const questionIds = Array.from(
    new Set((bookmarkRows ?? []).map((row) => row.question_id)),
  );
  const bookmarkedAtMap = new Map<number, string | null>();
  const answerViewedMap = new Map<number, boolean>();
  const completedMap = new Map<number, boolean>();
  const isBookmarkedMap = new Map<number, boolean>();
  const answerViewedAtMap = new Map<number, string | null>();
  for (const row of bookmarkRows ?? []) {
    bookmarkedAtMap.set(
      row.question_id,
      row.is_bookmarked ? row.created_at : null,
    );
    answerViewedMap.set(row.question_id, Boolean(row.answer_viewed_at));
    completedMap.set(
      row.question_id,
      Boolean(row.answer_viewed_at || row.completed_at),
    );
    isBookmarkedMap.set(row.question_id, row.is_bookmarked ?? false);
    answerViewedAtMap.set(row.question_id, row.answer_viewed_at ?? null);
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
      questionError = error?.message ?? "Failed to load bookmarked questions.";
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
        chapterName: row.chapters?.[0]?.name ?? null,
        subjectId: row.chapters?.[0]?.subject_id ?? null,
        subjectName: row.chapters?.[0]?.subjects?.[0]?.name ?? null,
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

  const loadError =
    bookmarkError || questionError
      ? (bookmarkError?.message ?? questionError ?? "Failed to load bookmarks.")
      : null;

  const bookmarks = questions
    .filter((q) => isBookmarkedMap.get(q.id))
    .map((q) => ({
      question: {
        ...q,
        isBookmarked: true,
        isAnswerViewed: completedMap.get(q.id) ?? false,
      },
      bookmarkedAt: q.bookmarkedAt,
    }));

  const viewed = questions
    .filter((q) => answerViewedMap.get(q.id))
    .map((q) => ({
      question: {
        ...q,
        isBookmarked: isBookmarkedMap.get(q.id) ?? false,
        isAnswerViewed: true,
      },
      viewedAt: answerViewedAtMap.get(q.id) ?? null,
    }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">My Account</h1>
          <p className="text-sm text-slate-500">
            Current user: {user.email ?? user.id}
          </p>
        </div>

        <UsageSummary
          title="Usage & Quotas"
          description="Membership status and quota usage."
        />

        {loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load bookmarks: {loadError}
          </div>
        ) : (
          <AccountTabs bookmarks={bookmarks} viewed={viewed} />
        )}
      </div>
    </main>
  );
}
