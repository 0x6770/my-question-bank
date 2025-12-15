"use client";

import {
  ArrowUpDown,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type ExamPaper as BrowserExamPaper,
  ExamPaperBrowser,
} from "@/components/exam-paper-browser";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "../../../../database.types";

type SubjectRow = Tables<"subjects"> & {
  exam_board?: { name?: string | null } | null;
};

type TagValueRow = {
  id: number;
  value: string;
  tag_id?: number | null;
  position: number | null;
};

type TagDefinition = {
  id: number;
  subject_id: number;
  name: string;
  required: boolean;
  position: number | null;
  values?: TagValueRow[] | null;
};

type ExamPaperManagementProps = {
  initialSubjects: SubjectRow[];
  initialSubjectTags: TagDefinition[];
  loadError: string | null;
};

type PdfKind = "question" | "mark-scheme";

function ensurePdf(file: File | null) {
  if (!file) return true;
  const isPdfType =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return isPdfType;
}

function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {description ? (
              <p className="text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-slate-200 px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ExamPaperManagement({
  initialSubjects,
  initialSubjectTags,
  loadError,
}: ExamPaperManagementProps) {
  const supabase = useMemo(() => createClient(), []);
  const [subjects] = useState(initialSubjects);
  const [subjectTags] = useState<TagDefinition[]>(initialSubjectTags);
  const tagsBySubject = useMemo(() => {
    const map = new Map<number, TagDefinition[]>();
    for (const tag of subjectTags) {
      if (!map.has(tag.subject_id)) map.set(tag.subject_id, []);
      map.get(tag.subject_id)?.push(tag);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const posA = a.position ?? 0;
        const posB = b.position ?? 0;
        if (posA !== posB) return posA - posB;
        return a.name.localeCompare(b.name, "zh-CN");
      });
    }
    return map;
  }, [subjectTags]);
  const examBoards = useMemo(() => {
    const map = new Map<number, string>();
    for (const subject of subjects) {
      if (subject.exam_board_id) {
        const label =
          subject.exam_board?.name ??
          `Exam Board ${subject.exam_board_id.toString()}`;
        map.set(subject.exam_board_id, label);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [subjects]);
  const [listError] = useState<string | null>(loadError);

  const [createState, setCreateState] = useState({
    subjectId: "",
    questionFile: null as File | null,
    markSchemeFile: null as File | null,
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [createTagSelections, setCreateTagSelections] = useState<
    Record<number, string>
  >({});

  const [editingPaper, setEditingPaper] = useState<BrowserExamPaper | null>(
    null,
  );
  const [editState, setEditState] = useState({
    subjectId: "",
  });
  const [editFiles, setEditFiles] = useState<{
    question: File | null;
    markScheme: File | null;
  }>({ question: null, markScheme: null });
  const [editBusy, setEditBusy] = useState(false);
  const [editTagSelections, setEditTagSelections] = useState<
    Record<number, string>
  >({});

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [editSubjectPickerOpen, setEditSubjectPickerOpen] = useState(false);
  const editSubjectPickerRef = useRef<HTMLDivElement>(null);
  const [editActiveExamBoardId, setEditActiveExamBoardId] = useState<
    number | null
  >(null);

  const resetMessage = () => setMessage(null);

  const uploadPdf = useCallback(
    async (paperId: number, file: File, kind: PdfKind, upsert = false) => {
      if (!ensurePdf(file)) {
        throw new Error("Only PDF files are supported.");
      }
      const path =
        kind === "question"
          ? `${paperId}/question.pdf`
          : `${paperId}/mark-scheme.pdf`;
      const { error } = await supabase.storage
        .from("exam_papers")
        .upload(path, file, {
          contentType: "application/pdf",
          upsert,
        });
      if (error) {
        throw new Error(error.message);
      }
      return path;
    },
    [supabase],
  );

  const deletePdfs = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      await supabase.storage.from("exam_papers").remove(paths);
    },
    [supabase],
  );

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessage();

    const subjectId = Number.parseInt(createState.subjectId, 10);
    const questionFile = createState.questionFile;
    const markSchemeFile = createState.markSchemeFile;

    if (!subjectId) {
      setMessage({ type: "error", text: "Please select a subject." });
      return;
    }
    if (!questionFile) {
      setMessage({
        type: "error",
        text: "Please upload the Question Paper PDF.",
      });
      return;
    }
    if (
      !ensurePdf(questionFile) ||
      (markSchemeFile && !ensurePdf(markSchemeFile))
    ) {
      setMessage({ type: "error", text: "Only PDF files are supported." });
      return;
    }

    const subjectTagsList = tagsBySubject.get(subjectId) ?? [];
    const missingRequired = subjectTagsList.some(
      (tag) => tag.required && !createTagSelections[tag.id],
    );
    if (missingRequired) {
      setMessage({
        type: "error",
        text: "Please fill all required tag values.",
      });
      return;
    }

    const getSelectedValue = (tagName: string) => {
      const tag = subjectTagsList.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );
      if (!tag) return null;
      const valId = createTagSelections[tag.id];
      if (!valId) return null;
      const value = tag.values?.find(
        (v) => v.id === Number.parseInt(valId, 10),
      );
      return value ?? null;
    };

    const selectedPaper = getSelectedValue("paper");
    const selectedSeason = getSelectedValue("season");
    const selectedYear = getSelectedValue("year");
    const selectedTimeZone = getSelectedValue("time zone");

    if (!selectedPaper || !selectedSeason || !selectedYear) {
      setMessage({
        type: "error",
        text: "Please choose values for paper / season / year.",
      });
      return;
    }

    const parsedYear = Number.parseInt(selectedYear.value, 10);
    if (!Number.isFinite(parsedYear)) {
      setMessage({ type: "error", text: "Year must be a number." });
      return;
    }

    setCreateBusy(true);
    let createdId: number | null = null;
    const uploaded: string[] = [];
    try {
      const { data: inserted, error: insertError } = await supabase
        .from("exam_papers")
        .insert({
          subject_id: subjectId,
          year: parsedYear,
          season: selectedSeason.value,
          paper_code: selectedPaper.value,
          paper_label: selectedPaper.value,
          time_zone: selectedTimeZone?.value ?? null,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        throw new Error(insertError?.message ?? "Failed to create exam paper.");
      }
      createdId = inserted.id;

      const questionPath = await uploadPdf(createdId, questionFile, "question");
      uploaded.push(questionPath);
      let markSchemePath: string | null = null;
      if (markSchemeFile) {
        markSchemePath = await uploadPdf(
          createdId,
          markSchemeFile,
          "mark-scheme",
        );
        uploaded.push(markSchemePath);
      }

      const { error: updateError } = await supabase
        .from("exam_papers")
        .update({
          question_paper_path: questionPath,
          mark_scheme_path: markSchemePath,
        })
        .eq("id", createdId);
      if (updateError) {
        throw new Error(updateError.message);
      }

      const tagValueRows = subjectTagsList
        .map((tag) => {
          const valueId = createTagSelections[tag.id];
          return valueId
            ? {
                exam_paper_id: createdId,
                tag_value_id: Number.parseInt(valueId, 10),
              }
            : null;
        })
        .filter(Boolean) as { exam_paper_id: number; tag_value_id: number }[];

      if (tagValueRows.length) {
        const { error: tagInsertError } = await supabase
          .from("exam_paper_tag_values")
          .insert(tagValueRows);
        if (tagInsertError) {
          throw new Error(tagInsertError.message);
        }
      }

      setListRefreshKey((prev) => prev + 1);
      setCreateState({
        subjectId: "",
        questionFile: null,
        markSchemeFile: null,
      });
      setCreateTagSelections({});
      setMessage({ type: "success", text: "Created successfully." });
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Creation failed, please try again.";
      setMessage({ type: "error", text: reason });
      if (createdId) {
        await supabase.from("exam_papers").delete().eq("id", createdId);
      }
      if (uploaded.length) {
        await deletePdfs(uploaded);
      }
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (paper: BrowserExamPaper) => {
    setEditingPaper(paper);
    setEditState({
      subjectId: String(paper.subject_id),
    });
    setEditFiles({ question: null, markScheme: null });
    setClearMarkScheme(false);
    const existingSelections: Record<number, string> = {};
    for (const entry of paper.tag_values ?? []) {
      const tagId = entry.tag_value?.tag_id;
      if (tagId) {
        existingSelections[tagId] = String(entry.tag_value_id);
      }
    }
    const subjectBoardId =
      subjects.find((s) => s.id === paper.subject_id)?.exam_board_id ?? null;
    setEditActiveExamBoardId(subjectBoardId ?? examBoards[0]?.id ?? null);
    setEditTagSelections(existingSelections);
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessage();
    if (!editingPaper) return;

    const subjectId = Number.parseInt(editState.subjectId, 10);
    const subjectTagsList =
      tagsBySubject.get(Number.parseInt(editState.subjectId, 10)) ?? [];

    if (!subjectId) {
      setMessage({ type: "error", text: "Please select a subject." });
      return;
    }
    if (
      (editFiles.question && !ensurePdf(editFiles.question)) ||
      (editFiles.markScheme && !ensurePdf(editFiles.markScheme))
    ) {
      setMessage({ type: "error", text: "Only PDF files are supported." });
      return;
    }

    const missingRequired = subjectTagsList.some(
      (tag) => tag.required && !editTagSelections[tag.id],
    );
    if (missingRequired) {
      setMessage({
        type: "error",
        text: "Please fill all required tag values.",
      });
      return;
    }

    const getSelectedValue = (tagName: string) => {
      const tag = subjectTagsList.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );
      if (!tag) return null;
      const valId = editTagSelections[tag.id];
      if (!valId) return null;
      const value = tag.values?.find(
        (v) => v.id === Number.parseInt(valId, 10),
      );
      return value ?? null;
    };

    const selectedPaper = getSelectedValue("paper");
    const selectedSeason = getSelectedValue("season");
    const selectedYear = getSelectedValue("year");
    const selectedTimeZone = getSelectedValue("time zone");

    if (!selectedPaper || !selectedSeason || !selectedYear) {
      setMessage({
        type: "error",
        text: "Please choose values for paper / season / year.",
      });
      return;
    }

    const parsedYear = Number.parseInt(selectedYear.value, 10);
    if (!Number.isFinite(parsedYear)) {
      setMessage({ type: "error", text: "Year must be a number." });
      return;
    }

    setEditBusy(true);
    let questionPath = editingPaper.question_paper_path;
    let markSchemePath = editingPaper.mark_scheme_path;

    try {
      if (editFiles.question) {
        questionPath = await uploadPdf(
          editingPaper.id,
          editFiles.question,
          "question",
          true,
        );
      }
      if (editFiles.markScheme) {
        markSchemePath = await uploadPdf(
          editingPaper.id,
          editFiles.markScheme,
          "mark-scheme",
          true,
        );
      }

      const { error } = await supabase
        .from("exam_papers")
        .update({
          subject_id: subjectId,
          year: parsedYear,
          season: selectedSeason.value,
          paper_code: selectedPaper.value,
          paper_label: selectedPaper.value,
          time_zone: selectedTimeZone?.value ?? null,
          question_paper_path: questionPath,
          mark_scheme_path: markSchemePath,
        })
        .eq("id", editingPaper.id);

      if (error) {
        throw new Error(error.message);
      }

      const tagValueRows = subjectTagsList
        .map((tag) => {
          const valueId = editTagSelections[tag.id];
          return valueId
            ? {
                exam_paper_id: editingPaper.id,
                tag_value_id: Number.parseInt(valueId, 10),
              }
            : null;
        })
        .filter(Boolean) as { exam_paper_id: number; tag_value_id: number }[];

      // Replace existing tag selections
      await supabase
        .from("exam_paper_tag_values")
        .delete()
        .eq("exam_paper_id", editingPaper.id);
      if (tagValueRows.length) {
        const { error: tagInsertError } = await supabase
          .from("exam_paper_tag_values")
          .insert(tagValueRows);
        if (tagInsertError) {
          throw new Error(tagInsertError.message);
        }
      }

      setMessage({ type: "success", text: "Updated successfully." });
      setEditingPaper(null);
      setListRefreshKey((prev) => prev + 1);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Update failed, please try again.";
      setMessage({ type: "error", text: reason });
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async (paper: BrowserExamPaper) => {
    resetMessage();
    if (
      !window.confirm(
        `Delete exam paper ${paper.paper_label ?? paper.paper_code}?`,
      )
    ) {
      return;
    }
    setDeletingId(paper.id);
    try {
      const paths = [paper.question_paper_path, paper.mark_scheme_path].filter(
        Boolean,
      ) as string[];
      if (paths.length) {
        await deletePdfs(paths);
      }
      const { error } = await supabase
        .from("exam_papers")
        .delete()
        .eq("id", paper.id);
      if (error) {
        throw new Error(error.message);
      }
      setMessage({ type: "success", text: "Deleted successfully." });
      setListRefreshKey((prev) => prev + 1);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Delete failed, please try again.";
      setMessage({ type: "error", text: reason });
    } finally {
      setDeletingId(null);
    }
  };

  const subjectOptions = useMemo(
    () =>
      subjects
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map((subject) => ({
          id: subject.id,
          label: subject.exam_board?.name
            ? `${subject.exam_board.name} · ${subject.name}`
            : subject.name,
        })),
    [subjects],
  );
  const examBoardOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const subject of subjects) {
      if (subject.exam_board_id) {
        const name =
          subject.exam_board?.name ??
          `Exam Board ${subject.exam_board_id.toString()}`;
        map.set(subject.exam_board_id, name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }, [subjects]);

  const subjectsByExamBoard = useMemo(() => {
    const map = new Map<number, SubjectRow[]>();
    for (const subject of subjects) {
      if (!map.has(subject.exam_board_id)) map.set(subject.exam_board_id, []);
      map.get(subject.exam_board_id)?.push(subject);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    return map;
  }, [subjects]);

  const modalSubjectOptions = useMemo(() => {
    if (editActiveExamBoardId == null) return [];
    return (
      subjectsByExamBoard.get(editActiveExamBoardId)?.map((subject) => ({
        id: subject.id,
        label: subject.name,
      })) ?? []
    );
  }, [editActiveExamBoardId, subjectsByExamBoard]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Exam Papers
            </h1>
            <p className="text-sm text-slate-500">
              Upload, update, and delete exam paper PDFs. Filter by subject,
              year, and keywords.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setListRefreshKey((prev) => prev + 1)}
          >
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        </div>
        {message ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700",
            )}
          >
            {message.text}
          </div>
        ) : null}
        {listError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {listError}
          </div>
        ) : null}
      </header>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-5 text-slate-500" />
            Create Exam Paper
          </CardTitle>
          <CardDescription>
            Create exam paper metadata and upload PDFs.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-subject">Subject *</Label>
                <select
                  id="create-subject"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                  value={createState.subjectId}
                  onChange={(event) => {
                    setCreateState((prev) => ({
                      ...prev,
                      subjectId: event.target.value,
                    }));
                    setCreateTagSelections({});
                  }}
                >
                  <option value="">Select a subject</option>
                  {subjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {createState.subjectId ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(
                  tagsBySubject.get(
                    Number.parseInt(createState.subjectId, 10),
                  ) ?? []
                ).map((tag) => (
                  <div key={tag.id} className="space-y-2">
                    <Label>
                      {tag.name}
                      {tag.required ? " *" : ""}
                    </Label>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                      value={createTagSelections[tag.id] ?? ""}
                      onChange={(event) =>
                        setCreateTagSelections((prev) => ({
                          ...prev,
                          [tag.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select a value</option>
                      {(tag.values ?? []).map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.value}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="create-question-file">
                  Question Paper (PDF) *
                </Label>
                <Input
                  id="create-question-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      questionFile: event.target.files?.[0] ?? null,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-mark-file">
                  Mark Scheme (PDF, optional)
                </Label>
                <Input
                  id="create-mark-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) =>
                    setCreateState((prev) => ({
                      ...prev,
                      markSchemeFile: event.target.files?.[0] ?? null,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={createBusy} className="gap-2">
                {createBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UploadCloud className="size-4" />
                )}
                {createBusy ? "Creating..." : "Create Exam Paper"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCreateState({
                    subjectId: "",
                    questionFile: null,
                    markSchemeFile: null,
                  });
                  resetMessage();
                }}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="size-5 text-slate-500" />
            Filter
          </CardTitle>
          <CardDescription>
            Filter exam papers by subject and tags.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <ExamPaperBrowser
            examBoards={examBoards}
            subjects={subjects}
            initialTags={subjectTags}
            refreshKey={listRefreshKey}
            renderActions={(paper) => (
              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openEdit(paper)}
                  aria-label="Edit"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => handleDelete(paper)}
                  disabled={deletingId === paper.id}
                  aria-label="Delete"
                >
                  {deletingId === paper.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Modal
        open={Boolean(editingPaper)}
        title="Edit Exam Paper"
        description="Update metadata and replace PDFs."
        onClose={() => setEditingPaper(null)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingPaper(null)}
              disabled={editBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-paper-form"
              disabled={editBusy}
              className="gap-2"
            >
              {editBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        }
      >
        {editingPaper ? (
          <form
            id="edit-paper-form"
            className="space-y-4"
            onSubmit={handleEditSubmit}
          >
            <div className="space-y-2">
              <Label>Exam / Subject *</Label>
              <div className="relative" ref={editSubjectPickerRef}>
                <button
                  type="button"
                  onClick={() => setEditSubjectPickerOpen((prev) => !prev)}
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm outline-none transition focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200"
                >
                  <span className="truncate">
                    {(() => {
                      const subj = subjects.find(
                        (s) => String(s.id) === editState.subjectId,
                      );
                      if (!subj) return "Select exam & subject";
                      const boardLabel =
                        subj.exam_board?.name ??
                        examBoardOptions.find(
                          (b) => b.id === subj.exam_board_id,
                        )?.label;
                      return boardLabel
                        ? `${boardLabel} · ${subj.name}`
                        : subj.name;
                    })()}
                  </span>
                  <ChevronDown className="size-4 text-slate-400" />
                </button>
                {editSubjectPickerOpen ? (
                  <div className="absolute z-30 mt-2 w-full min-w-[640px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="grid grid-cols-2">
                      <div className="max-h-72 overflow-auto">
                        <div className="px-3 py-2 text-sm font-semibold text-slate-700">
                          Choose exam board
                        </div>
                        {examBoardOptions.map((exam) => (
                          <button
                            key={exam.id}
                            type="button"
                            onMouseEnter={() =>
                              setEditActiveExamBoardId(exam.id)
                            }
                            onFocus={() => setEditActiveExamBoardId(exam.id)}
                            onClick={() => setEditActiveExamBoardId(exam.id)}
                            className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${editActiveExamBoardId === exam.id ? "bg-slate-50 text-slate-900" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            <span className="flex-1 whitespace-normal text-left leading-snug break-words">
                              {exam.label}
                            </span>
                            <span className="text-slate-400">›</span>
                          </button>
                        ))}
                      </div>
                      <div className="max-h-72 overflow-auto bg-slate-50">
                        {editActiveExamBoardId == null ? (
                          <div className="px-4 py-6 text-sm text-slate-500">
                            Select an exam board first
                          </div>
                        ) : modalSubjectOptions.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-slate-500">
                            No subjects under this exam board
                          </div>
                        ) : (
                          <div className="flex flex-col divide-y divide-slate-200">
                            {modalSubjectOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm font-semibold ${editState.subjectId === String(option.id) ? "bg-white text-slate-900" : "text-slate-700 hover:bg-white"}`}
                                onClick={() => {
                                  setEditState((prev) => ({
                                    ...prev,
                                    subjectId: String(option.id),
                                  }));
                                  setEditTagSelections({});
                                  setEditSubjectPickerOpen(false);
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

            {editState.subjectId ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(
                  tagsBySubject.get(Number.parseInt(editState.subjectId, 10)) ??
                  []
                ).map((tag) => (
                  <div key={tag.id} className="space-y-2">
                    <Label>
                      {tag.name}
                      {tag.required ? " *" : ""}
                    </Label>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                      value={editTagSelections[tag.id] ?? ""}
                      onChange={(event) =>
                        setEditTagSelections((prev) => ({
                          ...prev,
                          [tag.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select a value</option>
                      {(tag.values ?? []).map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.value}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit-question-file">
                  Question Paper (upload to replace)
                </Label>
                <Input
                  id="edit-question-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) =>
                    setEditFiles((prev) => ({
                      ...prev,
                      question: event.target.files?.[0] ?? null,
                    }))
                  }
                />
                {editingPaper.question_paper_path ? (
                  <p className="text-xs text-slate-500">
                    Existing file: {editingPaper.question_paper_path}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    No Question Paper uploaded.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mark-file">
                  Mark Scheme (upload to replace)
                </Label>
                <Input
                  id="edit-mark-file"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) =>
                    setEditFiles((prev) => ({
                      ...prev,
                      markScheme: event.target.files?.[0] ?? null,
                    }))
                  }
                />
                {editingPaper.mark_scheme_path ? (
                  <p className="text-xs text-slate-500">
                    Existing file: {editingPaper.mark_scheme_path}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    No Mark Scheme uploaded.
                  </p>
                )}
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
