/* eslint-disable react/jsx-no-useless-fragment */
"use client";

import {
  Bookmark,
  Check,
  CheckCircle2,
  FileText,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui/button";
import { WatermarkedImage } from "./watermarked-image";

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
    isBookmarked?: boolean;
    isAnswerViewed?: boolean;
    tags?: {
      name: string;
      value: string;
    }[];
  };
  disableInteractions?: boolean;
  paperBuilderMode?: boolean;
  isSelected?: boolean;
  onAddToPaper?: (question: {
    id: number;
    marks: number;
    difficulty: number;
    calculator: boolean;
    images: QuestionImage[];
    answerImages: QuestionImage[];
  }) => void;
};

const difficultyMeta: Record<
  number,
  { label: string; level: number; accentClass: string; dotClass: string }
> = {
  1: {
    label: "Easy",
    level: 1,
    accentClass: "text-emerald-600",
    dotClass: "bg-emerald-500",
  },
  2: {
    label: "Medium",
    level: 2,
    accentClass: "text-amber-600",
    dotClass: "bg-amber-500",
  },
  3: {
    label: "Hard",
    level: 3,
    accentClass: "text-orange-600",
    dotClass: "bg-orange-500",
  },
  4: {
    label: "Challenge",
    level: 4,
    accentClass: "text-rose-600",
    dotClass: "bg-rose-500",
  },
};

export function QuestionCard({
  question,
  disableInteractions = false,
  paperBuilderMode = false,
  isSelected = false,
  onAddToPaper,
}: QuestionCardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookmarking, setBookmarking] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(
    question.isBookmarked ?? false,
  );
  const [viewingAnswer, setViewingAnswer] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [isAnswerViewed, setIsAnswerViewed] = useState(
    question.isAnswerViewed ?? false,
  );
  const [showQuestion, setShowQuestion] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    setIsBookmarked(question.isBookmarked ?? false);
  }, [question.isBookmarked]);

  useEffect(() => {
    setIsAnswerViewed(question.isAnswerViewed ?? false);
  }, [question.isAnswerViewed]);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null))
      .catch(() => setUserId(null));
  }, [supabase]);

  const toggleBookmark = async () => {
    if (!userId) {
      setBookmarkError("Please log in to bookmark questions.");
      return;
    }
    setBookmarking(true);
    setBookmarkError(null);
    const next = !isBookmarked;
    setIsBookmarked(next);
    try {
      const { error } = await supabase.from("user_questions").upsert(
        {
          user_id: userId,
          question_id: question.id,
          is_bookmarked: next,
        },
        { onConflict: "user_id,question_id" },
      );
      if (error) throw error;
    } catch (error) {
      setIsBookmarked(!next);
      setBookmarkError(
        error instanceof Error
          ? error.message
          : "Failed to update bookmark, please try again later.",
      );
    } finally {
      setBookmarking(false);
    }
  };

  const handleViewAnswer = async () => {
    if (!userId) {
      setAnswerError("Please log in to view answers.");
      return;
    }
    setViewingAnswer(true);
    setAnswerError(null);
    try {
      // Check quota before showing answer
      const response = await fetch(
        `/api/questions/${question.id}/view-answer`,
        {
          method: "POST",
        },
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Quota exceeded or other error
        if (data.code === "quota_exceeded" && data.quota) {
          setAnswerError(
            `Quota exceeded! ${data.quota.used}/${data.quota.total} answers viewed. Resets on ${new Date(data.quota.resetAt).toLocaleDateString()}`,
          );
        } else {
          setAnswerError(data.message || "Failed to view answer");
        }
        return;
      }

      // Quota check passed, show answer
      setIsAnswerViewed(true);
      // Open fullscreen mode and switch to Answer view
      setFullscreenOpen(true);
      setShowQuestion(false);
      setShowAnswer(true);
    } catch (error) {
      setAnswerError(
        error instanceof Error
          ? error.message
          : "Failed to view answer, please try again later.",
      );
    } finally {
      setViewingAnswer(false);
    }
  };

  const meta = difficultyMeta[question.difficulty] ?? {
    label: "Unknown",
    level: 0,
    accentClass: "text-slate-500",
    dotClass: "bg-slate-400",
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
  const questionImages = question.images ?? [];
  const answerImages = question.answerImages ?? [];
  const hasImages = questionImages.length > 0 || answerImages.length > 0;
  const hasMultiQuestionImages = questionImages.length > 1;
  const primaryQuestionImage = questionImages[0];
  const secondaryQuestionImages = questionImages.slice(1);
  const showQuestionOnly = showQuestion && !showAnswer;
  const showAnswerOnly = showAnswer && !showQuestion;
  const showBoth = showQuestion && showAnswer;
  // TODO: Re-enable question tag pills (Paper/Topic) once the tag UX is finalized.
  const showQuestionTags = false;

  return (
    <>
      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col md:grid md:grid-cols-[1fr_200px] gap-0 border-b border-slate-100">
          <div className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                {!question.calculator && (
                  <span className="rounded bg-slate-100 px-3 py-1 font-semibold uppercase tracking-wide text-slate-500">
                    No Calculator
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`font-semibold ${meta.accentClass}`}>
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={`${question.id}-difficulty-${index}`}
                        className={`h-2.5 w-2.5 rounded-full ${index < meta.level ? meta.dotClass : "bg-slate-200"}`}
                      />
                    ))}
                  </div>
                </div>
                <span className="font-semibold text-slate-500">
                  Marks: {question.marks}
                </span>
              </div>
              {hasImages ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setFullscreenOpen(true)}
                  aria-label="Fullscreen preview"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {/* Tags */}
            {showQuestionTags && question.tags && question.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {question.tags.map((tag, index) => (
                  <span
                    key={`${question.id}-tag-${index}`}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                  >
                    {tag.name}: {tag.value}
                  </span>
                ))}
              </div>
            )}
            <div className="overflow-hidden">
              {questionImages.length > 0 ? (
                <div className="flex flex-col space-y-0">
                  {questionImages.map((image) => (
                    <WatermarkedImage
                      key={image.id}
                      src={image.signedUrl ?? image.storage_path}
                      alt={`Question ${question.id} image`}
                      watermarkSrc="/logo.jpg"
                    />
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10 text-sm text-slate-500">
                  No images available.
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-4 md:gap-5 md:border-l md:border-t-0 md:py-5">
            <div className="flex items-center justify-center gap-3 text-slate-600">
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  isBookmarked ? "Remove bookmark" : "Bookmark question"
                }
                onClick={toggleBookmark}
                disabled={disableInteractions || bookmarking}
              >
                <Bookmark
                  className={`size-5 ${isBookmarked ? "fill-sky-500 text-sky-600" : ""}`}
                />
              </Button>
              <span className="h-6 w-px bg-slate-200" aria-hidden="true" />
              <div className="flex items-center justify-center rounded-full p-1">
                <CheckCircle2
                  aria-label={isAnswerViewed ? "Completed" : "Not completed"}
                  className={`size-5 ${isAnswerViewed ? "text-emerald-600" : "text-slate-300"}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-3">
              <Button
                variant="outline"
                className="w-full justify-center gap-2 rounded border-sky-100 bg-sky-50 px-3 py-3 text-slate-800 hover:bg-sky-100 md:justify-between md:gap-3 md:px-4 md:py-4"
                onClick={handleViewAnswer}
                disabled={disableInteractions || viewingAnswer}
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <FileText className="size-4" />
                  <span className="text-sm">Mark Scheme</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className={`w-full justify-center gap-2 rounded px-3 py-3 text-sm md:justify-between md:gap-3 md:px-4 md:py-4 ${
                  isSelected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-sky-100 bg-sky-50 text-slate-800 hover:bg-sky-100"
                }`}
                disabled={
                  disableInteractions || !paperBuilderMode || isSelected
                }
                onClick={() => {
                  if (paperBuilderMode && onAddToPaper && !isSelected) {
                    onAddToPaper({
                      id: question.id,
                      marks: question.marks,
                      difficulty: question.difficulty,
                      calculator: question.calculator,
                      images: question.images,
                      answerImages: question.answerImages,
                    });
                  }
                }}
              >
                <div className="flex items-center gap-2 md:gap-3">
                  {isSelected ? (
                    <>
                      <Check className="size-4" />
                      <span>Added</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      <span>Generator</span>
                    </>
                  )}
                </div>
              </Button>
            </div>

            {bookmarkError ? (
              <p className="text-xs text-red-600">{bookmarkError}</p>
            ) : null}
            {answerError ? (
              <p className="text-xs text-red-600">{answerError}</p>
            ) : null}
          </aside>
        </div>
      </article>

      {fullscreenOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8">
          <div className="relative flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                {!question.calculator && (
                  <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    No Calculator
                  </span>
                )}
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Question #{question.id}
                </p>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {subjectLabel} {chapterLabel ? ` > ${chapterLabel}` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${meta.accentClass}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <span
                      key={`full-${question.id}-difficulty-${index}`}
                      className={`h-2.5 w-2.5 rounded-full ${index < meta.level ? meta.dotClass : "bg-slate-200"}`}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500">
                  Marks: {question.marks}
                </span>
                {showQuestionTags &&
                  question.tags &&
                  question.tags.length > 0 &&
                  question.tags.map((tag, index) => (
                    <span
                      key={`full-${question.id}-tag-${index}`}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                    >
                      {tag.name}: {tag.value}
                    </span>
                  ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-white text-sm shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuestion(true);
                      setShowAnswer(false);
                    }}
                    className={`px-3 py-1 font-medium transition ${showQuestionOnly ? "bg-sky-100 text-slate-900" : "bg-white text-slate-600 hover:bg-slate-50"} border-r border-slate-200`}
                  >
                    Question
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuestion(false);
                      setShowAnswer(true);
                    }}
                    className={`px-3 py-1 font-medium transition ${showAnswerOnly ? "bg-sky-100 text-slate-900" : "bg-white text-slate-600 hover:bg-slate-50"} border-r border-slate-200`}
                  >
                    Answer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuestion(true);
                      setShowAnswer(true);
                    }}
                    className={`px-3 py-1 font-medium transition ${showBoth ? "bg-sky-100 text-slate-900" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Question & Answer
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setFullscreenOpen(false)}
                  aria-label="Close fullscreen"
                  className="md:size-9"
                >
                  <X className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </div>
            </div>

            {(() => {
              const gridCols =
                showQuestion && showAnswer
                  ? "md:grid-cols-2"
                  : "md:grid-cols-1";
              return (
                <div
                  className={`grid flex-1 grid-cols-1 gap-0 overflow-hidden ${gridCols}`}
                >
                  {showQuestion ? (
                    <div
                      className={`relative ${showAnswer ? "border-r border-slate-200" : ""}`}
                    >
                      {questionImages.length === 0 ? (
                        <div className="absolute inset-0 overflow-auto p-4">
                          <p className="text-sm text-slate-500">
                            No question images.
                          </p>
                        </div>
                      ) : hasMultiQuestionImages ? (
                        <div className="absolute inset-0 flex h-full flex-col overflow-hidden md:flex-row">
                          <div className="flex-1 overflow-auto border-b border-slate-200 p-4 md:border-b-0 md:border-r">
                            {primaryQuestionImage ? (
                              <WatermarkedImage
                                key={primaryQuestionImage.id}
                                src={
                                  primaryQuestionImage.signedUrl ??
                                  primaryQuestionImage.storage_path
                                }
                                alt={`Question ${question.id} part ${primaryQuestionImage.position}`}
                                watermarkSrc="/logo.jpg"
                              />
                            ) : null}
                          </div>
                          <div className="flex-1 overflow-auto p-4">
                            <div className="space-y-4">
                              {secondaryQuestionImages.map((image) => (
                                <WatermarkedImage
                                  key={image.id}
                                  src={image.signedUrl ?? image.storage_path}
                                  alt={`Question ${question.id} part ${image.position}`}
                                  watermarkSrc="/logo.jpg"
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 overflow-auto p-4">
                          <div className="space-y-4">
                            {questionImages.map((image) => (
                              <WatermarkedImage
                                key={image.id}
                                src={image.signedUrl ?? image.storage_path}
                                alt={`Question ${question.id} image`}
                                watermarkSrc="/logo.jpg"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {showAnswer ? (
                    <div className="relative">
                      <div className="absolute inset-0 overflow-auto p-4">
                        <div className="space-y-4">
                          {answerImages.length > 0 ? (
                            answerImages.map((image) => (
                              <WatermarkedImage
                                key={image.id}
                                src={image.signedUrl ?? image.storage_path}
                                alt={`Answer for question ${question.id}`}
                                watermarkSrc="/logo.jpg"
                              />
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">
                              No answer images.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </>
  );
}
