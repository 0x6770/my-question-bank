/* eslint-disable react/jsx-no-useless-fragment */
"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { Button } from "@/components/ui/button";

type QuestionBrowserProps = {
  examBoards: { id: number; name: string }[];
  subjects: { id: number; name: string; exam_board_id: number | null }[];
  chapters: {
    id: number;
    name: string;
    subjectId: number | null;
    parentChapterId: number | null;
  }[];
};

type QuestionResult = {
  questions: Array<{
    id: number;
    marks: number;
    difficulty: number;
    calculator: boolean;
    createdAt: string;
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
    chapterId: number | null;
    subjectId: number | null;
  }>;
  hasMore?: boolean;
  page?: number;
};

const difficultyOptions = [
  { value: 1, label: "Easy" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hard" },
  { value: 4, label: "Challenge" },
];

export function QuestionBrowser({
  examBoards,
  subjects,
  chapters,
}: QuestionBrowserProps) {
  const [hierarchySelection, setHierarchySelection] = useState<string>("all");
  const [difficultySelections, setDifficultySelections] = useState<Set<number>>(
    new Set(),
  );
  const [questions, setQuestions] = useState<QuestionResult["questions"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [activeParentChapterId, setActiveParentChapterId] = useState<
    number | null
  >(null);
  const [activeExamBoardId, setActiveExamBoardId] = useState<number | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [completionFilter, setCompletionFilter] = useState<
    "all" | "completed" | "incompleted"
  >("all");
  const [bookmarkFilter, setBookmarkFilter] = useState<"all" | "bookmarked">(
    "all",
  );
  const hierarchyRef = useRef<HTMLDivElement>(null);

  const toggleDifficulty = (value: number) => {
    setDifficultySelections((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
    setPage(1);
  };

  const selectHierarchy = (value: string) => {
    setHierarchySelection(value);
    setPage(1);
  };

  const clearFilters = () => {
    setDifficultySelections(new Set());
    setActiveSubjectId(null);
    setCompletionFilter("all");
    setBookmarkFilter("all");
    selectHierarchy("all");
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        hierarchyRef.current &&
        !hierarchyRef.current.contains(event.target as Node)
      ) {
        setHierarchyOpen(false);
      }
    };
    if (hierarchyOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [hierarchyOpen]);

  useEffect(() => {
    if (activeExamBoardId != null) return;
    const firstExamId =
      subjects.find((subject) => subject.exam_board_id != null)
        ?.exam_board_id ??
      examBoards[0]?.id ??
      null;
    if (firstExamId != null) {
      setActiveExamBoardId(firstExamId);
    }
  }, [activeExamBoardId, subjects, examBoards]);

  useEffect(() => {
    if (hierarchySelection.startsWith("subject:")) {
      const [, id] = hierarchySelection.split(":");
      const subjectId = Number.parseInt(id, 10);
      if (Number.isFinite(subjectId)) {
        const subject = subjects.find((item) => item.id === subjectId);
        if (subject?.exam_board_id != null) {
          setActiveExamBoardId(subject.exam_board_id);
        }
        setActiveSubjectId(subjectId);
        setActiveParentChapterId(null);
      }
    } else if (hierarchySelection === "all") {
      setActiveSubjectId(null);
      setActiveParentChapterId(null);
    } else if (hierarchySelection.startsWith("chapter:")) {
      const [, id] = hierarchySelection.split(":");
      const chapterId = Number.parseInt(id, 10);
      if (Number.isFinite(chapterId)) {
        const chapter = chapters.find((item) => item.id === chapterId);
        if (chapter) {
          if (chapter.subjectId != null) {
            const subject = subjects.find(
              (item) => item.id === chapter.subjectId,
            );
            if (subject?.exam_board_id != null) {
              setActiveExamBoardId(subject.exam_board_id);
            }
          }
          setActiveSubjectId(chapter.subjectId ?? null);
          setActiveParentChapterId(
            chapter.parentChapterId ?? chapter.id ?? null,
          );
        }
      }
    }
  }, [chapters, hierarchySelection, subjects]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const isChapterSelected = hierarchySelection.startsWith("chapter:");
      const isSubjectSelected = hierarchySelection.startsWith("subject:");
      if (!isChapterSelected && !isSubjectSelected) {
        setQuestions([]);
        setHasMore(false);
        setFetchError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFetchError(null);
      try {
        const params = new URLSearchParams();
        const [, id] = hierarchySelection.split(":");
        if (isChapterSelected) {
          params.set("chapterId", id);
        } else if (isSubjectSelected) {
          params.set("subjectId", id);
        }
        params.set("page", String(page));
        if (difficultySelections.size > 0) {
          params.set(
            "difficulties",
            Array.from(difficultySelections).join(","),
          );
        }
        if (completionFilter === "completed") {
          params.set("completion", "completed");
        } else if (completionFilter === "incompleted") {
          params.set("completion", "incompleted");
        }
        if (bookmarkFilter === "bookmarked") {
          params.set("bookmark", "bookmarked");
        }
        const response = await fetch(`/api/questions?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Failed to load questions");
        }
        const data: QuestionResult = await response.json();
        setQuestions(data.questions);
        setHasMore(Boolean(data.hasMore));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFetchError(
            error instanceof Error
              ? error.message
              : "Failed to load questions, please try again later.",
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [
    bookmarkFilter,
    completionFilter,
    difficultySelections,
    hierarchySelection,
    page,
  ]);

  const currentLabel = useMemo(() => {
    if (hierarchySelection.startsWith("subject:")) {
      const [, rawId] = hierarchySelection.split(":");
      const numericId = Number.parseInt(rawId, 10);
      const subject = subjects.find((item) => item.id === numericId);
      const examName =
        subject?.exam_board_id != null
          ? examBoards.find((exam) => exam.id === subject.exam_board_id)?.name
          : null;
      return subject
        ? `${examName ? `${examName} / ` : ""}${subject.name}`
        : "Select a subject";
    }
    if (!hierarchySelection.startsWith("chapter:")) {
      const examName = activeExamBoardId
        ? examBoards.find((exam) => exam.id === activeExamBoardId)?.name
        : null;
      return examName ?? "Select a subject or chapter";
    }
    const [, rawId] = hierarchySelection.split(":");
    const numericId = Number.parseInt(rawId, 10);
    const chapter = chapters.find((item) => item.id === numericId);
    const parent =
      chapter?.parentChapterId != null
        ? chapters.find((item) => item.id === chapter.parentChapterId)
        : null;
    const subject = chapter
      ? subjects.find((item) => item.id === chapter.subjectId)
      : null;
    return chapter && subject
      ? `${subject.name} / ${parent ? `${parent.name} / ` : ""}${chapter.name}`
      : (chapter?.name ?? "Select a chapter");
  }, [activeExamBoardId, chapters, examBoards, hierarchySelection, subjects]);

  const visibleRootChapters = useMemo(() => {
    if (activeSubjectId == null) return [];
    return chapters.filter(
      (chapter) =>
        chapter.subjectId === activeSubjectId &&
        chapter.parentChapterId == null,
    );
  }, [activeSubjectId, chapters]);

  const visibleSubChapters = useMemo(() => {
    if (activeParentChapterId == null) return [];
    return chapters.filter(
      (chapter) => chapter.parentChapterId === activeParentChapterId,
    );
  }, [activeParentChapterId, chapters]);

  const chaptersWithChildren = useMemo(() => {
    const parents = new Set<number>();
    chapters.forEach((chapter) => {
      if (chapter.parentChapterId != null) {
        parents.add(chapter.parentChapterId);
      }
    });
    return parents;
  }, [chapters]);

  const filtersActive =
    hierarchySelection.startsWith("chapter:") ||
    hierarchySelection.startsWith("subject:") ||
    difficultySelections.size > 0 ||
    completionFilter !== "all" ||
    bookmarkFilter !== "all";

  const visibleSubjects = useMemo(() => {
    if (activeExamBoardId == null) return subjects;
    return subjects.filter(
      (subject) => subject.exam_board_id === activeExamBoardId,
    );
  }, [activeExamBoardId, subjects]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4">
        <div className="flex flex-wrap items-start gap-4 md:items-end">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Exam / Subject / Chapter
            </p>
            <div className="relative" ref={hierarchyRef}>
              <button
                type="button"
                onClick={() => setHierarchyOpen((prev) => !prev)}
                className="flex h-11 min-w-[260px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <span className="truncate">{currentLabel}</span>
                <ChevronDown className="size-4 text-slate-400" />
              </button>
              {hierarchyOpen ? (
                <div className="absolute z-20 mt-2 w-[min(1100px,95vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="grid grid-cols-4">
                    <div className="max-h-72 overflow-auto">
                      <div className="px-3 py-2 text-sm font-semibold text-slate-700">
                        Choose exam board
                      </div>
                      {examBoards.map((exam) => (
                        <button
                          key={exam.id}
                          type="button"
                          onMouseEnter={() => {
                            setActiveExamBoardId(exam.id);
                            setActiveSubjectId(null);
                            setActiveParentChapterId(null);
                            setHierarchySelection("all");
                          }}
                          onFocus={() => {
                            setActiveExamBoardId(exam.id);
                            setActiveSubjectId(null);
                            setActiveParentChapterId(null);
                            setHierarchySelection("all");
                          }}
                          className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${activeExamBoardId === exam.id ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                            {exam.name}
                          </span>
                          <span className="text-slate-400">›</span>
                        </button>
                      ))}
                    </div>
                    <div className="max-h-72 overflow-auto bg-slate-50">
                      {activeExamBoardId == null ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          Select an exam board first
                        </div>
                      ) : visibleSubjects.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          No subjects under this exam board
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-slate-200">
                          {visibleSubjects.map((subject) => (
                            <button
                              key={subject.id}
                              type="button"
                              className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${activeSubjectId === subject.id ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                              onMouseEnter={() => {
                                setActiveSubjectId(subject.id);
                                setActiveParentChapterId(null);
                              }}
                              onFocus={() => {
                                setActiveSubjectId(subject.id);
                                setActiveParentChapterId(null);
                              }}
                              onClick={() => {
                                setActiveSubjectId(subject.id);
                                setActiveParentChapterId(null);
                                selectHierarchy(`subject:${subject.id}`);
                                setHierarchyOpen(false);
                              }}
                            >
                              <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                                {subject.name}
                              </span>
                              <span className="text-slate-400">›</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="max-h-72 overflow-auto">
                      {activeSubjectId == null ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          Select a subject to view chapters
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-slate-200">
                          {visibleRootChapters.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-slate-500">
                              No chapters for this subject
                            </div>
                          ) : (
                            visibleRootChapters.map((chapter, index) => (
                              <button
                                key={chapter.id}
                                type="button"
                                className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-medium ${activeParentChapterId === chapter.id ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                                onMouseEnter={() =>
                                  setActiveParentChapterId(chapter.id)
                                }
                                onFocus={() =>
                                  setActiveParentChapterId(chapter.id)
                                }
                                onClick={() => {
                                  setActiveParentChapterId(chapter.id);
                                  selectHierarchy(`chapter:${chapter.id}`);
                                  setHierarchyOpen(false);
                                }}
                              >
                                <span className="text-slate-400">
                                  {index + 1}.
                                </span>
                                <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                                  {chapter.name}
                                </span>
                                {chaptersWithChildren.has(chapter.id) ? (
                                  <span className="text-slate-400">›</span>
                                ) : null}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="max-h-72 overflow-auto bg-slate-50">
                      {activeParentChapterId == null ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          Select a chapter to view subchapters
                        </div>
                      ) : visibleSubChapters.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          No subchapters for this chapter
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-slate-200">
                          {visibleSubChapters.map((chapter, index) => (
                            <button
                              key={chapter.id}
                              type="button"
                              className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-medium ${hierarchySelection === `chapter:${chapter.id}` ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                              onClick={() => {
                                selectHierarchy(`chapter:${chapter.id}`);
                                setHierarchyOpen(false);
                              }}
                            >
                              <span className="text-slate-400">
                                {index + 1}.
                              </span>
                              <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                                {chapter.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-0">
                    <div
                      className="absolute top-0 bottom-0 border-l border-slate-200"
                      style={{ left: "25%" }}
                    />
                    <div
                      className="absolute top-0 bottom-0 border-l border-slate-200"
                      style={{ left: "50%" }}
                    />
                    <div
                      className="absolute top-0 bottom-0 border-l border-slate-200"
                      style={{ left: "75%" }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Difficulty</p>
            <div className="inline-flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex-nowrap md:items-center">
              {difficultyOptions.map((item) => {
                const checked = difficultySelections.has(item.value);
                return (
                  <label
                    key={item.value}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <input
                      type="checkbox"
                      className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                      checked={checked}
                      onChange={() => toggleDifficulty(item.value)}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Completion</p>
            <div className="inline-flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex-nowrap md:items-center">
              {[
                { key: "all", label: "All" },
                { key: "completed", label: "Completed" },
                { key: "incompleted", label: "Incompleted" },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium ${
                    completionFilter === item.key
                      ? "bg-sky-50 text-slate-900"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="completion"
                    className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                    checked={completionFilter === item.key}
                    onChange={() => {
                      setCompletionFilter(
                        item.key as "all" | "completed" | "incompleted",
                      );
                      setPage(1);
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Bookmarks</p>
            <div className="inline-flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex-nowrap md:items-center">
              {[
                { key: "all", label: "All" },
                { key: "bookmarked", label: "Bookmarked" },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium ${
                    bookmarkFilter === item.key
                      ? "bg-sky-50 text-slate-900"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="bookmark"
                    className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                    checked={bookmarkFilter === item.key}
                    onChange={() => {
                      setBookmarkFilter(item.key as "all" | "bookmarked");
                      setPage(1);
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="ml-auto flex flex-col justify-between gap-3 md:items-end md:justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="w-full max-w-xs md:w-auto"
              disabled={!filtersActive}
            >
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      {fetchError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {fetchError}
        </div>
      ) : null}

      <div className="space-y-6">
        {isLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Loading questions...
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
            {hierarchySelection.startsWith("chapter:") ||
            hierarchySelection.startsWith("subject:")
              ? "No questions match the filters."
              : "Select a subject or chapter to view questions."}
          </div>
        ) : (
          <>
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1 || isLoading}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!hasMore || isLoading}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
