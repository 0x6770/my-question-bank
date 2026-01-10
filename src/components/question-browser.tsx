/* eslint-disable react/jsx-no-useless-fragment */
"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type QuestionBrowserProps = {
  examBoards: { id: number; name: string }[];
  subjects: { id: number; name: string; exam_board_id: number | null }[];
  chapters: {
    id: number;
    name: string;
    subjectId: number | null;
    parentChapterId: number | null;
  }[];
  tags: {
    id: number;
    subject_id: number;
    name: string;
    required: boolean;
    position: number;
    values: { id: number; value: string; position: number }[] | null;
  }[];
  questionBank: string; // "topical" | "past-paper" | "exam-paper"
  paperBuilderMode?: boolean;
  selectedQuestionIds?: Set<number>;
  onAddToPaper?: (question: {
    id: number;
    marks: number;
    difficulty: number;
    calculator: boolean;
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
  }) => void;
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
    tags?: {
      name: string;
      value: string;
    }[];
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
  tags,
  questionBank,
  paperBuilderMode = false,
  selectedQuestionIds,
  onAddToPaper,
}: QuestionBrowserProps) {
  const [difficultySelections, setDifficultySelections] = useState<Set<number>>(
    new Set(),
  );
  const [tagFilters, setTagFilters] = useState<Record<string, number | null>>(
    {},
  ); // { tagName: valueId }
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    null,
  );
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null,
  );
  const [selectedSubChapterId, setSelectedSubChapterId] = useState<
    number | null
  >(null);
  const [questions, setQuestions] = useState<QuestionResult["questions"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const [activeExamBoardId, setActiveExamBoardId] = useState<number | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "incompleted" | "bookmarked"
  >("all");
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

  const handleSubjectSelect = (subjectId: number) => {
    const subject = subjects.find((item) => item.id === subjectId);
    setSelectedSubjectId(subjectId);
    setSelectedChapterId(null);
    setSelectedSubChapterId(null);
    if (subject?.exam_board_id != null) {
      setActiveExamBoardId(subject.exam_board_id);
    }
    setPage(1);
  };

  const handleChapterSelect = (chapterId: number | null) => {
    if (chapterId == null) {
      setSelectedChapterId(null);
      setSelectedSubChapterId(null);
      setPage(1);
      return;
    }
    const chapter = chapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    setSelectedChapterId(chapterId);
    setSelectedSubChapterId(null);
    setPage(1);
  };

  const handleSubChapterSelect = (chapterId: number | null) => {
    setSelectedSubChapterId(chapterId);
    setPage(1);
  };

  const clearFilters = () => {
    setDifficultySelections(new Set());
    setSelectedSubjectId(null);
    setSelectedChapterId(null);
    setSelectedSubChapterId(null);
    setStatusFilter("all");
    setTagFilters({});
    setPage(1);
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
    const controller = new AbortController();
    const load = async () => {
      const resolvedChapterId = selectedSubChapterId ?? selectedChapterId;
      const isChapterSelected = resolvedChapterId != null;
      const isSubjectSelected = !isChapterSelected && selectedSubjectId != null;
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
        if (isChapterSelected) {
          params.set("chapterId", String(resolvedChapterId));
        } else if (isSubjectSelected) {
          params.set("subjectId", String(selectedSubjectId));
        }
        params.set("page", String(page));
        if (difficultySelections.size > 0) {
          params.set(
            "difficulties",
            Array.from(difficultySelections).join(","),
          );
        }
        if (statusFilter === "completed") {
          params.set("completion", "completed");
        } else if (statusFilter === "incompleted") {
          params.set("completion", "incompleted");
        }
        if (statusFilter === "bookmarked") {
          params.set("bookmark", "bookmarked");
        }
        // Add tag filters
        const activeTagFilters = Object.entries(tagFilters)
          .filter(([_, valueId]) => valueId !== null)
          .map(([tagName, valueId]) => `${tagName}:${valueId}`)
          .join(",");
        if (activeTagFilters) {
          params.set("tagFilters", activeTagFilters);
        }
        params.set("bank", questionBank);
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
    difficultySelections,
    page,
    questionBank,
    selectedChapterId,
    selectedSubChapterId,
    selectedSubjectId,
    statusFilter,
    tagFilters,
  ]);

  // Get available tags for the active subject
  const availableSubjectTags = useMemo(() => {
    if (!selectedSubjectId) return [];
    return tags.filter((tag) => tag.subject_id === selectedSubjectId);
  }, [selectedSubjectId, tags]);

  // Split tags into paper tag and custom tags
  const paperTag = useMemo(
    () => availableSubjectTags.find((tag) => tag.name === "paper"),
    [availableSubjectTags],
  );
  const paperLabel = "Paper";
  const customTags = useMemo(
    () => availableSubjectTags.filter((tag) => tag.name !== "paper"),
    [availableSubjectTags],
  );

  const currentLabel = useMemo(() => {
    const subject =
      selectedSubjectId != null
        ? subjects.find((item) => item.id === selectedSubjectId)
        : null;
    const examName =
      subject?.exam_board_id != null
        ? examBoards.find((exam) => exam.id === subject.exam_board_id)?.name
        : activeExamBoardId != null
          ? examBoards.find((exam) => exam.id === activeExamBoardId)?.name
          : null;

    if (subject) {
      return `${examName ? `${examName} / ` : ""}${subject.name}`;
    }

    return examName ?? "Select a subject";
  }, [activeExamBoardId, examBoards, selectedSubjectId, subjects]);

  const visibleRootChapters = useMemo(() => {
    if (selectedSubjectId == null) return [];
    return chapters.filter(
      (chapter) =>
        chapter.subjectId === selectedSubjectId &&
        chapter.parentChapterId == null,
    );
  }, [selectedSubjectId, chapters]);

  const visibleSubChapters = useMemo(() => {
    if (selectedChapterId == null) return [];
    return chapters.filter(
      (chapter) => chapter.parentChapterId === selectedChapterId,
    );
  }, [selectedChapterId, chapters]);

  useEffect(() => {
    if (selectedChapterId == null) return;
    if (
      !visibleRootChapters.some((chapter) => chapter.id === selectedChapterId)
    ) {
      setSelectedChapterId(null);
      setSelectedSubChapterId(null);
    }
  }, [selectedChapterId, visibleRootChapters]);

  useEffect(() => {
    if (selectedSubChapterId == null) return;
    if (
      !visibleSubChapters.some((chapter) => chapter.id === selectedSubChapterId)
    ) {
      setSelectedSubChapterId(null);
    }
  }, [selectedSubChapterId, visibleSubChapters]);

  const chapterDisabled =
    selectedSubjectId == null || visibleRootChapters.length === 0;
  const subChapterDisabled =
    selectedChapterId == null || visibleSubChapters.length === 0;

  const chapterSelectValue = chapterDisabled
    ? ""
    : selectedChapterId != null
      ? String(selectedChapterId)
      : "all";
  const subChapterSelectValue = subChapterDisabled
    ? ""
    : selectedSubChapterId != null
      ? String(selectedSubChapterId)
      : "all";

  const chapterPlaceholder =
    selectedSubjectId == null
      ? "Select a subject"
      : visibleRootChapters.length === 0
        ? "NA"
        : "All chapters";
  const subChapterPlaceholder =
    selectedChapterId == null
      ? "Select a chapter"
      : visibleSubChapters.length === 0
        ? "NA"
        : "All subchapters";

  const filtersActive =
    selectedSubjectId != null ||
    selectedChapterId != null ||
    selectedSubChapterId != null ||
    difficultySelections.size > 0 ||
    statusFilter !== "all" ||
    Object.values(tagFilters).some((v) => v !== null);

  const row2GridClass = paperTag
    ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(80px,100px)_minmax(300px,0.9fr)_minmax(300px,1.1fr)_auto] lg:items-end"
    : "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(300px,0.9fr)_minmax(300px,1.1fr)_auto] lg:items-end";

  const visibleSubjects = useMemo(() => {
    if (activeExamBoardId == null) return subjects;
    return subjects.filter(
      (subject) => subject.exam_board_id === activeExamBoardId,
    );
  }, [activeExamBoardId, subjects]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4">
        <div className="space-y-4">
          {/* Row 1: Subject + Chapter + Subchapter */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-end">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">
                Exam / Subject (Level 1)
              </p>
              <div className="relative" ref={hierarchyRef}>
                <button
                  type="button"
                  onClick={() => setHierarchyOpen((prev) => !prev)}
                  className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
                >
                  <span className="truncate">{currentLabel}</span>
                  <ChevronDown className="size-4 text-slate-400" />
                </button>
                {hierarchyOpen ? (
                  <div className="absolute z-20 mt-2 w-[min(720px,95vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="grid grid-cols-2">
                      <div className="max-h-72 overflow-auto">
                        <div className="px-3 py-2 text-sm font-semibold text-slate-700">
                          Choose exam board
                        </div>
                        {examBoards.map((exam) => (
                          <button
                            key={exam.id}
                            type="button"
                            onClick={() => {
                              setActiveExamBoardId(exam.id);
                            }}
                            onFocus={() => {
                              setActiveExamBoardId(exam.id);
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
                                className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${selectedSubjectId === subject.id ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                                onClick={() => {
                                  handleSubjectSelect(subject.id);
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
                    </div>
                    <div className="pointer-events-none absolute inset-0">
                      <div
                        className="absolute top-0 bottom-0 border-l border-slate-200"
                        style={{ left: "50%" }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">
                Chapter (Level 2)
              </p>
              <Select
                value={chapterSelectValue}
                onValueChange={(value) => {
                  const valueId = value === "all" ? null : parseInt(value, 10);
                  handleChapterSelect(valueId);
                }}
                disabled={chapterDisabled}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm">
                  <SelectValue placeholder={chapterPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All chapters</SelectItem>
                  {visibleRootChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={String(chapter.id)}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700">
                Subchapter (Level 2)
              </p>
              <Select
                value={subChapterSelectValue}
                onValueChange={(value) => {
                  const valueId = value === "all" ? null : parseInt(value, 10);
                  handleSubChapterSelect(valueId);
                }}
                disabled={subChapterDisabled}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm">
                  <SelectValue placeholder={subChapterPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subchapters</SelectItem>
                  {visibleSubChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={String(chapter.id)}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Paper + Difficulty + Status */}
          <div className={row2GridClass}>
            {paperTag && (
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-slate-700">
                  {paperLabel}
                  {paperTag.required && (
                    <span className="ml-1 text-red-500">*</span>
                  )}
                </p>
                <Select
                  value={
                    tagFilters[paperTag.name]
                      ? String(tagFilters[paperTag.name])
                      : "all"
                  }
                  onValueChange={(value) => {
                    const valueId =
                      value === "all" ? null : parseInt(value, 10);
                    setTagFilters((prev) => ({
                      ...prev,
                      [paperTag.name]: valueId,
                    }));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm">
                    <SelectValue placeholder={`All ${paperLabel}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {paperLabel}</SelectItem>
                    {paperTag.values
                      ?.sort((a, b) => (a.position || 0) - (b.position || 0))
                      .map((val) => (
                        <SelectItem key={val.id} value={String(val.id)}>
                          {val.value}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Difficulty</p>
              <div className="flex min-h-11 w-full flex-wrap items-center gap-0.2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                {difficultyOptions.map((item) => {
                  const checked = difficultySelections.has(item.value);
                  return (
                    <label
                      key={item.value}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
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

            <div className="min-w-0 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Status</p>
              <div className="flex min-h-11 w-full flex-wrap items-center gap-0.2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                {[
                  { key: "all", label: "All" },
                  { key: "completed", label: "Completed" },
                  { key: "incompleted", label: "Incompleted" },
                  { key: "bookmarked", label: "Bookmarked" },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium ${
                      statusFilter === item.key
                        ? "bg-sky-50 text-slate-900"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status"
                      className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                      checked={statusFilter === item.key}
                      onChange={() => {
                        setStatusFilter(
                          item.key as
                            | "all"
                            | "completed"
                            | "incompleted"
                            | "bookmarked",
                        );
                        setPage(1);
                      }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 md:items-end md:justify-center lg:justify-self-end">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-11 w-full max-w-xs md:w-auto"
                disabled={!filtersActive}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Row 3: Custom Tags */}
          {customTags.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {customTags.map((tag) => {
                const selectId = `tag-filter-${tag.id}`;
                return (
                  <div key={tag.id} className="space-y-2">
                    <label
                      htmlFor={selectId}
                      className="text-sm font-semibold text-slate-700"
                    >
                      {tag.name}
                      {tag.required && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <Select
                      value={
                        tagFilters[tag.name]
                          ? String(tagFilters[tag.name])
                          : "all"
                      }
                      onValueChange={(value) => {
                        const valueId =
                          value === "all" ? null : parseInt(value, 10);
                        setTagFilters((prev) => ({
                          ...prev,
                          [tag.name]: valueId,
                        }));
                        setPage(1);
                      }}
                    >
                      <SelectTrigger
                        id={selectId}
                        className="h-11 w-full rounded-xl border-slate-200 shadow-sm"
                      >
                        <SelectValue placeholder={`All ${tag.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {tag.name}</SelectItem>
                        {tag.values
                          ?.sort(
                            (a, b) => (a.position || 0) - (b.position || 0),
                          )
                          .map((val) => (
                            <SelectItem key={val.id} value={String(val.id)}>
                              {val.value}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
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
            {selectedSubjectId != null ||
            selectedChapterId != null ||
            selectedSubChapterId != null
              ? "No questions match the filters."
              : "Select a subject or chapter to view questions."}
          </div>
        ) : (
          <>
            {questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                paperBuilderMode={paperBuilderMode}
                isSelected={selectedQuestionIds?.has(question.id)}
                onAddToPaper={onAddToPaper}
              />
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
