"use client";

import { ChevronDown, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type ExamBoard = {
  id: number;
  name: string;
};

type Subject = {
  id: number;
  name: string;
  exam_board_id: number;
  exam_board?: { id?: number | null; name?: string | null } | null;
};

type TagValue = { id: number; value: string; tag_id?: number | null };
type Tag = {
  id: number;
  subject_id: number;
  name: string;
  values?: TagValue[] | null;
};

type ExamPaper = {
  id: number;
  subject_id: number;
  year: number | null;
  season: string | null;
  paper_code: string | null;
  paper_label: string | null;
  time_zone: string | null;
  question_paper_path: string | null;
  mark_scheme_path: string | null;
  subject?: {
    name?: string | null;
    exam_board?: { name?: string | null } | null;
  } | null;
  tag_values?: {
    tag_value_id: number;
    tag_value?: { id: number; value: string; tag_id?: number | null } | null;
  }[];
};

const DEFAULT_TAG_NAMES = ["paper", "season", "year", "time zone"] as const;

type ExamPaperBrowserProps = {
  examBoards: ExamBoard[];
  subjects: Subject[];
  initialTags: Tag[];
};

export function ExamPaperBrowser({
  examBoards,
  subjects,
  initialTags,
}: ExamPaperBrowserProps) {
  const supabase = useMemo(() => createClient(), []);
  const [selectedExamBoardId, setSelectedExamBoardId] = useState<string>(
    subjects[0]?.exam_board_id ? String(subjects[0].exam_board_id) : "",
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.id ? String(subjects[0].id) : "",
  );
  const [tagsBySubject, setTagsBySubject] = useState(() => {
    const map = new Map<number, Tag[]>();
    for (const tag of initialTags) {
      if (!map.has(tag.subject_id)) map.set(tag.subject_id, []);
      map.get(tag.subject_id)?.push(tag);
    }
    return map;
  });
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [signedUrlCache, setSignedUrlCache] = useState<Record<string, string>>(
    {},
  );
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const subjectPickerRef = useRef<HTMLDivElement>(null);
  const [activeExamBoardId, setActiveExamBoardId] = useState<number | null>(
    subjects[0]?.exam_board_id ?? examBoards[0]?.id ?? null,
  );

  const examBoardOptions = useMemo(
    () =>
      examBoards
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map((board) => ({ id: board.id, label: board.name })),
    [examBoards],
  );

  const subjectsByExamBoard = useMemo(() => {
    const map = new Map<number, Subject[]>();
    for (const subject of subjects) {
      if (!map.has(subject.exam_board_id)) map.set(subject.exam_board_id, []);
      map.get(subject.exam_board_id)?.push(subject);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    return map;
  }, [subjects]);

  const subjectOptions = useMemo(() => {
    const examId =
      activeExamBoardId ??
      (selectedExamBoardId ? Number.parseInt(selectedExamBoardId, 10) : null);
    if (!examId) return [];
    return (subjectsByExamBoard.get(examId) ?? []).map((subject) => ({
      id: subject.id,
      label: subject.name,
    }));
  }, [activeExamBoardId, selectedExamBoardId, subjectsByExamBoard]);

  const currentSubjectTags = useMemo(() => {
    if (!selectedSubjectId) return [];
    const list =
      tagsBySubject.get(Number.parseInt(selectedSubjectId, 10)) ?? [];
    return list
      .slice()
      .filter((tag) =>
        DEFAULT_TAG_NAMES.includes(
          tag.name.toLowerCase() as (typeof DEFAULT_TAG_NAMES)[number],
        ),
      )
      .map((tag) => ({
        ...tag,
        values:
          tag.values
            ?.slice()
            .sort((a, b) =>
              (a.value ?? "").localeCompare(b.value ?? "", "zh-CN"),
            ) ?? [],
      }));
  }, [selectedSubjectId, tagsBySubject]);

  const filteredPapers = useMemo(() => {
    if (!papers.length) return [];
    return papers.filter((paper) => {
      for (const [tagIdStr, valueIdStr] of Object.entries(filters)) {
        if (!valueIdStr) continue;
        const tagId = Number.parseInt(tagIdStr, 10);
        const valueId = Number.parseInt(valueIdStr, 10);
        const matches = paper.tag_values?.some(
          (tv) => tv.tag_value?.tag_id === tagId && tv.tag_value_id === valueId,
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [filters, papers]);

  const fetchSignedUrl = async (path: string | null) => {
    if (!path) return null;
    if (signedUrlCache[path]) return signedUrlCache[path];
    const { data, error } = await supabase.storage
      .from("exam_papers")
      .createSignedUrl(path, 60 * 60);
    if (error) {
      setListError(error.message);
      return null;
    }
    const url = data?.signedUrl ?? null;
    if (url) {
      setSignedUrlCache((prev) => ({ ...prev, [path]: url }));
    }
    return url;
  };

  const loadSubjectData = useCallback(
    async (subjectId: number) => {
      setIsLoading(true);
      setListError(null);

      const [tagsResult, papersResult] = await Promise.all([
        supabase
          .from("subject_exam_tags")
          .select(
            "id, subject_id, name, values:subject_exam_tag_values(id, value, tag_id)",
          )
          .eq("subject_id", subjectId)
          .in("name", DEFAULT_TAG_NAMES)
          .order("name", { ascending: true }),
        supabase
          .from("exam_papers")
          .select(
            "id, subject_id, year, season, paper_code, paper_label, time_zone, question_paper_path, mark_scheme_path, subject:subjects(name, exam_board:exam_boards(name)), tag_values:exam_paper_tag_values(tag_value_id, tag_value:subject_exam_tag_values(id, value, tag_id))",
          )
          .eq("subject_id", subjectId)
          .order("year", { ascending: false })
          .order("season", { ascending: false })
          .order("paper_code", { ascending: true }),
      ]);

      if (tagsResult.error || papersResult.error) {
        setListError(
          tagsResult.error?.message ??
            papersResult.error?.message ??
            "加载失败，请稍后重试。",
        );
      } else {
        setTagsBySubject((prev) => {
          const next = new Map(prev);
          next.set(subjectId, tagsResult.data ?? []);
          return next;
        });
        setPapers(papersResult.data ?? []);
      }
      setIsLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    const subjectId = selectedSubjectId
      ? Number.parseInt(selectedSubjectId, 10)
      : null;
    if (subjectId) {
      void loadSubjectData(subjectId);
    }
  }, [loadSubjectData, selectedSubjectId]);

  useEffect(() => {
    if (selectedExamBoardId) {
      const id = Number.parseInt(selectedExamBoardId, 10);
      if (Number.isFinite(id) && id !== activeExamBoardId) {
        setActiveExamBoardId(id);
      }
    }
  }, [activeExamBoardId, selectedExamBoardId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        subjectPickerRef.current &&
        !subjectPickerRef.current.contains(event.target as Node)
      ) {
        setSubjectPickerOpen(false);
      }
    };
    if (subjectPickerOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [subjectPickerOpen]);

  const handleChangeSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setFilters({});
    setPapers([]);
    setSignedUrlCache({});
    setListError(null);
    setIsLoading(false);
    if (subjectId) {
      const subject = subjects.find(
        (item) => item.id === Number.parseInt(subjectId, 10),
      );
      if (
        subject?.exam_board_id &&
        String(subject.exam_board_id) !== selectedExamBoardId
      ) {
        setSelectedExamBoardId(String(subject.exam_board_id));
      }
    }
  };

  useEffect(() => {
    if (!selectedSubjectId) return;
    const subject = subjects.find(
      (item) => item.id === Number.parseInt(selectedSubjectId, 10),
    );
    if (subject?.exam_board_id && subject.exam_board_id !== activeExamBoardId) {
      setActiveExamBoardId(subject.exam_board_id);
    }
  }, [activeExamBoardId, selectedSubjectId, subjects]);

  const handleOpenPdf = async (path: string | null) => {
    const url = await fetchSignedUrl(path);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const _currentSubjectLabel = useMemo(() => {
    const subject = subjects.find(
      (item) => String(item.id) === selectedSubjectId,
    );
    return subject?.name;
  }, [selectedSubjectId, subjects]);

  const selectedLabel = useMemo(() => {
    const subject = subjects.find(
      (item) => String(item.id) === selectedSubjectId,
    );
    const examId =
      subject?.exam_board_id ??
      (selectedExamBoardId ? Number.parseInt(selectedExamBoardId, 10) : null) ??
      activeExamBoardId;
    const exam = examId
      ? examBoards.find((board) => board.id === examId)
      : null;
    if (subject && exam) return `${exam.name} · ${subject.name}`;
    if (subject) return subject.name;
    if (exam) return exam.name;
    return null;
  }, [
    activeExamBoardId,
    examBoards,
    selectedExamBoardId,
    selectedSubjectId,
    subjects,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Exam Papers
        </h1>
        <p className="text-sm text-slate-500">
          按学科和默认标签（paper / season / year / time
          zone）筛选可访问的试卷。
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2 xl:col-span-2">
              <Label>Exam / Subject *</Label>
              <div className="relative" ref={subjectPickerRef}>
                <button
                  type="button"
                  onClick={() => setSubjectPickerOpen((prev) => !prev)}
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200 lg:max-w-3xl"
                >
                  <span className="truncate">
                    {selectedLabel ?? "Select exam & subject"}
                  </span>
                  <ChevronDown className="size-4 text-slate-400" />
                </button>
                {subjectPickerOpen ? (
                  <div className="absolute z-20 mt-2 w-[min(900px,95vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="grid grid-cols-2">
                      <div className="max-h-72 overflow-auto">
                        <div className="px-3 py-2 text-sm font-semibold text-slate-700">
                          选择考试局
                        </div>
                        {examBoardOptions.map((exam) => (
                          <button
                            key={exam.id}
                            type="button"
                            onMouseEnter={() => setActiveExamBoardId(exam.id)}
                            onFocus={() => setActiveExamBoardId(exam.id)}
                            className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${activeExamBoardId === exam.id ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                              {exam.label}
                            </span>
                            <span className="text-slate-400">›</span>
                          </button>
                        ))}
                      </div>
                      <div className="max-h-72 overflow-auto bg-slate-50">
                        {activeExamBoardId == null ? (
                          <div className="px-4 py-6 text-sm text-slate-500">
                            先选择考试局
                          </div>
                        ) : subjectOptions.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500">
                            当前考试局暂无学科
                          </div>
                        ) : (
                          <div className="flex flex-col divide-y divide-slate-200">
                            {subjectOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${selectedSubjectId === String(option.id) ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                                onClick={() => {
                                  const subject = subjects.find(
                                    (item) => item.id === option.id,
                                  );
                                  if (subject?.exam_board_id) {
                                    setSelectedExamBoardId(
                                      String(subject.exam_board_id),
                                    );
                                    setActiveExamBoardId(subject.exam_board_id);
                                  }
                                  handleChangeSubject(String(option.id));
                                  setSubjectPickerOpen(false);
                                }}
                              >
                                <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                                  {option.label}
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
                        style={{ left: "50%" }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {currentSubjectTags.map((tag) => (
              <div className="space-y-2" key={tag.id}>
                <Label>
                  {tag.name.charAt(0).toUpperCase() + tag.name.slice(1)}
                </Label>
                <div className="relative">
                  <select
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                    value={filters[tag.id] ?? ""}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        [tag.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">All</option>
                    {(tag.values ?? []).map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.value}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => setFilters({})}
              variant="outline"
              className="gap-2"
            >
              <X className="size-4" />
              Clear
            </Button>
          </div>
          {listError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {listError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Year</th>
                  <th className="px-4 py-3 font-medium">Season</th>
                  <th className="px-4 py-3 font-medium">Paper</th>
                  <th className="px-4 py-3 font-medium">Time Zone</th>
                  <th className="px-4 py-3 font-medium">Question Paper</th>
                  <th className="px-4 py-3 font-medium">Mark Scheme</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      <Loader2 className="mr-2 inline-block size-4 animate-spin" />
                      Loading...
                    </td>
                  </tr>
                ) : filteredPapers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No exam papers.
                    </td>
                  </tr>
                ) : (
                  filteredPapers.map((paper) => (
                    <tr
                      key={paper.id}
                      className="border-b border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3">{paper.year ?? "--"}</td>
                      <td className="px-4 py-3">{paper.season ?? "--"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {paper.paper_code ?? "--"}
                        </div>
                        {paper.paper_label &&
                        paper.paper_label !== paper.paper_code ? (
                          <div className="text-xs text-slate-500">
                            {paper.paper_label}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{paper.time_zone ?? "--"}</td>
                      <td className="px-4 py-3">
                        {paper.question_paper_path ? (
                          <button
                            type="button"
                            className="text-blue-600 underline underline-offset-4"
                            onClick={() =>
                              handleOpenPdf(paper.question_paper_path)
                            }
                          >
                            view
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {paper.mark_scheme_path ? (
                          <button
                            type="button"
                            className="text-blue-600 underline underline-offset-4"
                            onClick={() =>
                              handleOpenPdf(paper.mark_scheme_path)
                            }
                          >
                            view
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">--</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
