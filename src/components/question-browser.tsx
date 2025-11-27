/* eslint-disable react/jsx-no-useless-fragment */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { Button } from "@/components/ui/button";

type QuestionBrowserProps = {
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
  subjects: { id: number; name: string }[];
  chapters: {
    id: number;
    name: string;
    subjectId: number | null;
    parentChapterId: number | null;
  }[];
};

const difficultyOptions = [
  { value: 1, label: "Easy" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Hard" },
  { value: 4, label: "Challenge" },
];

export function QuestionBrowser({
  questions,
  subjects,
  chapters,
}: QuestionBrowserProps) {
  const [hierarchySelection, setHierarchySelection] = useState<string>("all");
  const [difficultySelections, setDifficultySelections] = useState<Set<number>>(
    new Set(),
  );
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [activeParentChapterId, setActiveParentChapterId] = useState<
    number | null
  >(null);
  const hierarchyRef = useRef<HTMLDivElement>(null);

  const chapterSubjectMap = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const chapter of chapters) {
      map.set(chapter.id, chapter.subjectId);
    }
    return map;
  }, [chapters]);

  const childChapterMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const chapter of chapters) {
      if (chapter.parentChapterId == null) continue;
      const list = map.get(chapter.parentChapterId) ?? [];
      list.push(chapter.id);
      map.set(chapter.parentChapterId, list);
    }
    return map;
  }, [chapters]);

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
  };

  const clearFilters = () => {
    setHierarchySelection("all");
    setDifficultySelections(new Set());
    setActiveSubjectId(null);
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
    if (hierarchySelection.startsWith("subject:")) {
      const [, id] = hierarchySelection.split(":");
      const subjectId = Number.parseInt(id, 10);
      if (Number.isFinite(subjectId)) {
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
          setActiveSubjectId(chapter.subjectId ?? null);
          setActiveParentChapterId(
            chapter.parentChapterId ?? chapter.id ?? null,
          );
        }
      }
    }
  }, [chapters, hierarchySelection]);

  const filtered = useMemo(() => {
    const selection = (() => {
      if (hierarchySelection === "all") return { type: "all" } as const;
      const [kind, rawId] = hierarchySelection.split(":");
      const numericId = Number.parseInt(rawId, 10);
      if (!Number.isFinite(numericId)) return { type: "all" } as const;
      if (kind === "subject") {
        return { type: "subject", subjectId: numericId } as const;
      }
      if (kind === "chapter") {
        const subjectId = chapterSubjectMap.get(numericId) ?? null;
        return {
          type: "chapter",
          chapterId: numericId,
          subjectId,
        } as const;
      }
      return { type: "all" } as const;
    })();

    const isDescendant = (parentId: number, targetId: number) => {
      const visited = new Set<number>();
      const stack = [...(childChapterMap.get(parentId) ?? [])];
      while (stack.length > 0) {
        const current = stack.pop();
        if (current == null || visited.has(current)) continue;
        if (current === targetId) return true;
        visited.add(current);
        const children = childChapterMap.get(current);
        if (children) {
          stack.push(...children);
        }
      }
      return false;
    };

    return questions.filter((question) => {
      if (selection.type === "subject") {
        if (question.subjectId !== selection.subjectId) return false;
      } else if (selection.type === "chapter") {
        const chapterId = question.chapterId;
        const matchesChapter =
          chapterId === selection.chapterId ||
          (chapterId != null && isDescendant(selection.chapterId, chapterId));
        if (!matchesChapter) return false;
      }
      if (
        difficultySelections.size > 0 &&
        !difficultySelections.has(question.difficulty)
      ) {
        return false;
      }

      return true;
    });
  }, [
    hierarchySelection,
    difficultySelections,
    questions,
    chapterSubjectMap,
    childChapterMap,
  ]);

  const currentLabel = useMemo(() => {
    if (hierarchySelection === "all") return "All Subjects / Chapters";
    const [kind, rawId] = hierarchySelection.split(":");
    const numericId = Number.parseInt(rawId, 10);
    if (kind === "subject") {
      const subject = subjects.find((item) => item.id === numericId);
      return subject
        ? `${subject.name} (All Chapters)`
        : "All Subjects / Chapters";
    }
    if (kind === "chapter") {
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
        : (chapter?.name ?? "All Subjects / Chapters");
    }
    return "All Subjects / Chapters";
  }, [chapters, hierarchySelection, subjects]);

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto] md:items-end">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Subject / Chapter
            </p>
            <div className="relative" ref={hierarchyRef}>
              <button
                type="button"
                onClick={() => setHierarchyOpen((prev) => !prev)}
                className="flex h-11 w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <span className="truncate">{currentLabel}</span>
                <span className="text-slate-400">▾</span>
              </button>
              {hierarchyOpen ? (
                <div className="absolute z-20 mt-2 w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl pb-10">
                  <div className="grid grid-cols-3">
                    <div className="max-h-72 overflow-auto">
                      <button
                        type="button"
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm font-semibold ${hierarchySelection === "all" ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                        onClick={() => {
                          setHierarchySelection("all");
                          setHierarchyOpen(false);
                          setActiveSubjectId(null);
                          setActiveParentChapterId(null);
                        }}
                      >
                        全部学科
                      </button>
                      {subjects.map((subject) => (
                        <button
                          key={subject.id}
                          type="button"
                          onMouseEnter={() => {
                            setActiveSubjectId(subject.id);
                            setActiveParentChapterId(null);
                          }}
                          onFocus={() => {
                            setActiveSubjectId(subject.id);
                            setActiveParentChapterId(null);
                          }}
                          onClick={() => {
                            setHierarchySelection(`subject:${subject.id}`);
                            setHierarchyOpen(false);
                            setActiveParentChapterId(null);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-sm font-semibold ${activeSubjectId === subject.id ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                        >
                          {subject.name}
                          <span className="text-slate-400">›</span>
                        </button>
                      ))}
                    </div>
                    <div className="max-h-72 overflow-auto bg-slate-50">
                      {activeSubjectId == null ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          先选择学科查看章节
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-slate-200">
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium ${hierarchySelection === `subject:${activeSubjectId}` ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                            onClick={() => {
                              setHierarchySelection(
                                `subject:${activeSubjectId}`,
                              );
                              setHierarchyOpen(false);
                              setActiveParentChapterId(null);
                            }}
                          >
                            全部章节
                          </button>
                          {visibleRootChapters.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-slate-500">
                              该学科暂无章节
                            </div>
                          ) : (
                            visibleRootChapters.map((chapter) => (
                              <button
                                key={chapter.id}
                                type="button"
                                className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium ${activeParentChapterId === chapter.id ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                                onMouseEnter={() =>
                                  setActiveParentChapterId(chapter.id)
                                }
                                onFocus={() =>
                                  setActiveParentChapterId(chapter.id)
                                }
                                onClick={() => {
                                  setActiveParentChapterId(chapter.id);
                                  setHierarchySelection(
                                    `chapter:${chapter.id}`,
                                  );
                                  setHierarchyOpen(false);
                                }}
                              >
                                {chapter.name}
                                <span className="text-slate-400">›</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="max-h-72 overflow-auto">
                      {activeParentChapterId == null ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          先选择章节查看子章节
                        </div>
                      ) : visibleSubChapters.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500">
                          该章节暂无子章节
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-slate-200">
                          {visibleSubChapters.map((chapter) => (
                            <button
                              key={chapter.id}
                              type="button"
                              className={`flex w-full items-center justify-between px-3 py-2 text-sm font-medium ${hierarchySelection === `chapter:${chapter.id}` ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                              onClick={() => {
                                setHierarchySelection(`chapter:${chapter.id}`);
                                setHierarchyOpen(false);
                              }}
                            >
                              {chapter.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-0">
                    <div
                      className="absolute top-0 bottom-0 border-l border-slate-200"
                      style={{ left: "33.3333%" }}
                    />
                    <div
                      className="absolute top-0 bottom-0 border-l border-slate-200"
                      style={{ left: "66.6667%" }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Difficulty</p>
            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex-nowrap md:items-center">
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

          <div className="flex flex-col justify-between gap-3 md:items-end md:justify-center">
            <div className="text-sm font-semibold text-slate-700">
              当前共 {filtered.length} 条结果
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="w-full max-w-xs md:w-auto"
            >
              清空筛选
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {filtered.map((question) => (
          <QuestionCard key={question.id} question={question} />
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
            没有符合筛选条件的题目。
          </div>
        ) : null}
      </div>
    </div>
  );
}
