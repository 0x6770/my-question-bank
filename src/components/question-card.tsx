/* eslint-disable react/jsx-no-useless-fragment */
"use client";

import { Maximize2, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "./ui/button";

type QuestionImage = {
  id: number;
  storage_path: string;
  position: number;
  signedUrl: string | null;
};

type QuestionCardProps = {
  question: {
    id: number;
    marks: number;
    difficulty: number;
    calculator: boolean;
    createdAt: string;
    subjectId?: number | null;
    subjectName?: string | null;
    chapterId?: number | null;
    chapterName?: string | null;
    images: QuestionImage[];
    answerImages: QuestionImage[];
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

export function QuestionCard({ question }: QuestionCardProps) {
  const meta = difficultyMeta[question.difficulty] ?? {
    label: "Unknown",
    level: 0,
    accent: "text-slate-500",
  };
  const subjectLabel =
    question.subjectName ??
    (question.subjectId != null
      ? `Subject #${question.subjectId}`
      : "Subject N/A");
  const chapterLabel =
    question.chapterName ??
    (question.chapterId != null
      ? `Chapter #${question.chapterId}`
      : "Chapter N/A");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const hasImages =
    (question.images?.length ?? 0) > 0 ||
    (question.answerImages?.length ?? 0) > 0;

  return (
    <>
      <article className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-2 pt-4">
          <div className="flex items-center gap-3">
            <span
              className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${question.calculator ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}
            >
              {question.calculator ? "Calculator" : "No Calculator"}
            </span>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Question #{question.id}
            </p>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {subjectLabel} {chapterLabel ? ` > ${chapterLabel}` : ""}
            </span>
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
            {hasImages ? (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setFullscreenOpen(true)}
                aria-label="Fullscreen preview"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-sm font-medium text-slate-600">
            [Maximum mark: {question.marks}]
          </p>
        </div>

        {question.images.length > 0 ? (
          <div className="px-4 pb-4">
            <div className="flex flex-col space-y-0">
              {question.images.map((image) => (
                <Image
                  key={image.id}
                  src={image.signedUrl ?? image.storage_path}
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
        ) : null}

        {!hasImages ? (
          <div className="px-4 pb-6 text-sm text-slate-500">暂无图片内容。</div>
        ) : null}
      </article>

      {fullscreenOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8">
          <div className="relative flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <span
                  className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${question.calculator ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {question.calculator ? "CALCULATOR" : "NO CALCULATOR"}
                </span>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Question #{question.id}
                </p>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {subjectLabel} {chapterLabel ? ` > ${chapterLabel}` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${meta.accent}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <span
                      key={`full-${question.id}-difficulty-${index}`}
                      className={`h-2.5 w-2.5 rounded-full ${index < meta.level ? "bg-amber-500" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500">
                  Marks: {question.marks}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFullscreenOpen(false)}
                aria-label="Close fullscreen"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
              <div className="relative border-r border-slate-200">
                <div className="absolute inset-0 overflow-auto p-4">
                  <div className="space-y-4">
                    {question.images.length > 0 ? (
                      question.images.map((image) => (
                        <Image
                          key={image.id}
                          src={image.signedUrl ?? image.storage_path}
                          alt={`Question ${question.id} image`}
                          width={1600}
                          height={1200}
                          className="block h-auto w-full object-contain"
                          sizes="(max-width: 1200px) 100vw, 1000px"
                          unoptimized
                        />
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">暂无题目图片。</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 overflow-auto p-4">
                  <div className="space-y-4">
                    {question.answerImages.length > 0 ? (
                      question.answerImages.map((image) => (
                        <Image
                          key={image.id}
                          src={image.signedUrl ?? image.storage_path}
                          alt={`Answer for question ${question.id}`}
                          width={1600}
                          height={1200}
                          className="block h-auto w-full object-contain"
                          sizes="(max-width: 1200px) 100vw, 1000px"
                          unoptimized
                        />
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">暂无答案图片。</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
