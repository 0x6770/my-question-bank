"use client";

import { useMemo, useState } from "react";
import { QuestionCard } from "@/components/question-card";

type QuestionPayload = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
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
  isBookmarked?: boolean;
  isAnswerViewed?: boolean;
};

type BookmarkEntry = {
  question: QuestionPayload;
  bookmarkedAt: string | null;
};

type ViewedEntry = {
  question: QuestionPayload;
  viewedAt: string | null;
};

type Props = {
  bookmarks: BookmarkEntry[];
  viewed: ViewedEntry[];
};

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "未知时间";
}

export function AccountTabs({ bookmarks, viewed }: Props) {
  const [tab, setTab] = useState<"bookmarks" | "viewed">("bookmarks");
  const bookmarkCount = bookmarks.length;
  const viewedCount = viewed.length;

  const currentList = useMemo(
    () => (tab === "bookmarks" ? bookmarks : viewed),
    [bookmarks, tab, viewed],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">我的题目</h2>
          <p className="text-sm text-slate-500">
            {tab === "bookmarks"
              ? `共收藏 ${bookmarkCount} 道题目。`
              : `查看过答案的题目：${viewedCount} 道。`}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab("bookmarks")}
            className={`rounded-full px-3 py-1 transition ${
              tab === "bookmarks"
                ? "bg-white font-semibold text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            收藏 ({bookmarkCount})
          </button>
          <button
            type="button"
            onClick={() => setTab("viewed")}
            className={`rounded-full px-3 py-1 transition ${
              tab === "viewed"
                ? "bg-white font-semibold text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            答案查看 ({viewedCount})
          </button>
        </div>
      </div>

      {currentList.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          {tab === "bookmarks"
            ? "还没有收藏题目，去题库挑选一些吧。"
            : "还没有查看过答案的记录。"}
        </div>
      ) : (
        <div className="mt-4 space-y-8">
          {currentList.map((item) => (
            <div key={item.question.id} className="space-y-2">
              <p className="text-xs text-slate-500">
                {tab === "bookmarks"
                  ? `收藏于：${formatDate(
                      (item as BookmarkEntry).bookmarkedAt ?? null,
                    )}`
                  : `上次查看答案：${formatDate(
                      (item as ViewedEntry).viewedAt ?? null,
                    )}`}
              </p>
              <QuestionCard question={item.question} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
