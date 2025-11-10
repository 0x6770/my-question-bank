"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";

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

type ExamBoardRow = Tables<"exam_boards">;
type SubjectRow = Tables<"subjects">;
type ChapterRow = Tables<"chapters">;

type Feedback = { type: "success" | "error"; message: string };

type SubjectManagementProps = {
  initialExamBoards: ExamBoardRow[];
  initialSubjects: SubjectRow[];
  initialChapters: ChapterRow[];
  loadError: string | null;
};

function buildSubjectsByBoard(subjects: SubjectRow[]) {
  const map = new Map<number, SubjectRow[]>();
  for (const subject of subjects) {
    if (!map.has(subject.exam_board_id)) {
      map.set(subject.exam_board_id, []);
    }
    map.get(subject.exam_board_id)?.push(subject);
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return map;
}

function buildChaptersBySubject(chapters: ChapterRow[]) {
  const map = new Map<number, ChapterRow[]>();
  for (const chapter of chapters) {
    if (!map.has(chapter.subject_id)) {
      map.set(chapter.subject_id, []);
    }
    map.get(chapter.subject_id)?.push(chapter);
  }

  for (const list of map.values()) {
    list.sort(compareChapters);
  }

  return map;
}

function compareChapters(a: ChapterRow, b: ChapterRow) {
  if (a.position !== b.position) {
    return (a.position ?? 0) - (b.position ?? 0);
  }
  return a.name.localeCompare(b.name);
}

function buildRootChaptersBySubject(chapters: ChapterRow[]) {
  const map = new Map<number, ChapterRow[]>();
  for (const chapter of chapters) {
    if (chapter.parent_chapter_id != null) {
      continue;
    }
    if (!map.has(chapter.subject_id)) {
      map.set(chapter.subject_id, []);
    }
    map.get(chapter.subject_id)?.push(chapter);
  }

  for (const list of map.values()) {
    list.sort(compareChapters);
  }

  return map;
}

function buildChapterChildrenMap(chapters: ChapterRow[]) {
  const map = new Map<number, ChapterRow[]>();
  for (const chapter of chapters) {
    if (chapter.parent_chapter_id == null) {
      continue;
    }
    if (!map.has(chapter.parent_chapter_id)) {
      map.set(chapter.parent_chapter_id, []);
    }
    map.get(chapter.parent_chapter_id)?.push(chapter);
  }

  for (const list of map.values()) {
    list.sort(compareChapters);
  }

  return map;
}

export function SubjectManagement({
  initialExamBoards,
  initialSubjects,
  initialChapters,
  loadError,
}: SubjectManagementProps) {
  const supabase = useMemo(() => createClient(), []);

  const [examBoards, setExamBoards] =
    useState<ExamBoardRow[]>(initialExamBoards);
  const [subjects, setSubjects] = useState<SubjectRow[]>(initialSubjects);
  const [chapters, setChapters] = useState<ChapterRow[]>(initialChapters);

  const [newExamBoardName, setNewExamBoardName] = useState("");
  const [newSubjectNames, setNewSubjectNames] = useState<
    Record<number, string>
  >({});
  const [newChapterNames, setNewChapterNames] = useState<
    Record<string, string>
  >({});
  const [listFeedback, setListFeedback] = useState<Feedback | null>(
    loadError
      ? {
          type: "error",
          message: loadError,
        }
      : null,
  );

  const [isCreatingExamBoard, setIsCreatingExamBoard] = useState(false);
  const [creatingSubjectBoardId, setCreatingSubjectBoardId] = useState<
    number | null
  >(null);
  const [creatingChapterTarget, setCreatingChapterTarget] = useState<{
    subjectId: number;
    parentChapterId: number | null;
  } | null>(null);
  const [busyExamBoardId, setBusyExamBoardId] = useState<number | null>(null);
  const [busySubjectId, setBusySubjectId] = useState<number | null>(null);
  const [busyChapterId, setBusyChapterId] = useState<number | null>(null);

  const [editingExamBoardId, setEditingExamBoardId] = useState<number | null>(
    null,
  );
  const [editingExamBoardName, setEditingExamBoardName] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [editingChapterName, setEditingChapterName] = useState("");

  const examBoardFormRef = useRef<HTMLFormElement>(null);
  const newExamBoardInputRef = useRef<HTMLInputElement>(null);
  const editingExamBoardInputRef = useRef<HTMLInputElement>(null);
  const editingSubjectInputRef = useRef<HTMLInputElement>(null);
  const editingChapterInputRef = useRef<HTMLInputElement>(null);

  const sortedExamBoards = useMemo(
    () => examBoards.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [examBoards],
  );

  const subjectsByBoard = useMemo(
    () => buildSubjectsByBoard(subjects),
    [subjects],
  );
  const chaptersBySubject = useMemo(
    () => buildChaptersBySubject(chapters),
    [chapters],
  );
  const rootChaptersBySubject = useMemo(
    () => buildRootChaptersBySubject(chapters),
    [chapters],
  );
  const chapterChildrenMap = useMemo(
    () => buildChapterChildrenMap(chapters),
    [chapters],
  );

  const getChapterDraftKey = (
    subjectId: number,
    parentChapterId: number | null,
  ) => {
    return parentChapterId == null
      ? `subject-${subjectId}`
      : `chapter-${parentChapterId}`;
  };

  const getChapterDraftValue = (
    subjectId: number,
    parentChapterId: number | null,
  ) => {
    return (
      newChapterNames[getChapterDraftKey(subjectId, parentChapterId)] ?? ""
    );
  };

  const setChapterDraftValue = (
    subjectId: number,
    parentChapterId: number | null,
    value: string,
  ) => {
    const key = getChapterDraftKey(subjectId, parentChapterId);
    setNewChapterNames((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const clearChapterDraftValue = (
    subjectId: number,
    parentChapterId: number | null,
  ) => {
    const key = getChapterDraftKey(subjectId, parentChapterId);
    setNewChapterNames((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const clearChapterDraftsForSubjects = (subjectIds: number[]) => {
    if (subjectIds.length === 0) {
      return;
    }
    const subjectSet = new Set(subjectIds);
    const subjectKeys = new Set(
      subjectIds.map((subjectId) => getChapterDraftKey(subjectId, null)),
    );
    const chapterIdsToRemove = new Set<number>();
    for (const chapter of chapters) {
      if (subjectSet.has(chapter.subject_id)) {
        chapterIdsToRemove.add(chapter.id);
      }
    }
    setNewChapterNames((prev) => {
      let mutated = false;
      const nextEntries = Object.entries(prev).filter(([key]) => {
        if (subjectKeys.has(key)) {
          mutated = true;
          return false;
        }
        if (key.startsWith("chapter-")) {
          const id = Number.parseInt(key.replace("chapter-", ""), 10);
          if (chapterIdsToRemove.has(id)) {
            mutated = true;
            return false;
          }
        }
        return true;
      });
      if (!mutated) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
  };

  const clearChapterDraftsForChapters = (chapterIds: number[]) => {
    if (chapterIds.length === 0) {
      return;
    }
    const targets = new Set(chapterIds);
    setNewChapterNames((prev) => {
      let mutated = false;
      const nextEntries = Object.entries(prev).filter(([key]) => {
        if (!key.startsWith("chapter-")) {
          return true;
        }
        const id = Number.parseInt(key.replace("chapter-", ""), 10);
        if (targets.has(id)) {
          mutated = true;
          return false;
        }
        return true;
      });
      if (!mutated) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
  };

  const collectChapterDescendantIds = (chapterId: number) => {
    const ids: number[] = [chapterId];
    const stack = [chapterId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) {
        continue;
      }
      const children = chapterChildrenMap.get(current) ?? [];
      for (const child of children) {
        ids.push(child.id);
        stack.push(child.id);
      }
    }
    return ids;
  };

  const handleCreateExamBoard = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setListFeedback(null);

    const trimmed = newExamBoardName.trim();
    if (!trimmed) {
      setListFeedback({
        type: "error",
        message: "Exam board name is required.",
      });
      return;
    }

    setIsCreatingExamBoard(true);
    const { data, error } = await supabase
      .from("exam_boards")
      .insert({ name: trimmed })
      .select("id, name, created_at")
      .single();
    setIsCreatingExamBoard(false);

    if (error || !data) {
      setListFeedback({
        type: "error",
        message:
          error?.code === "23505"
            ? "This exam board already exists."
            : (error?.message ?? "Failed to create exam board."),
      });
      return;
    }

    setExamBoards((prev) => [...prev, data]);
    setListFeedback({
      type: "success",
      message: `Created exam board "${data.name}".`,
    });
    setNewExamBoardName("");
    newExamBoardInputRef.current?.focus();
  };

  const handleCreateSubject = async (
    event: React.FormEvent<HTMLFormElement>,
    boardId: number,
  ) => {
    event.preventDefault();
    setListFeedback(null);

    const draftName = newSubjectNames[boardId] ?? "";
    const trimmed = draftName.trim();
    if (!trimmed) {
      setListFeedback({
        type: "error",
        message: "Subject name is required.",
      });
      return;
    }

    setCreatingSubjectBoardId(boardId);
    const { data, error } = await supabase
      .from("subjects")
      .insert({
        name: trimmed,
        exam_board_id: boardId,
      })
      .select("id, name, created_at, exam_board_id")
      .single();
    setCreatingSubjectBoardId(null);

    if (error || !data) {
      setListFeedback({
        type: "error",
        message:
          error?.code === "23505"
            ? "A subject with this name already exists for the selected exam board."
            : (error?.message ?? "Failed to create subject."),
      });
      return;
    }

    setSubjects((prev) => [...prev, data]);
    setNewSubjectNames((prev) => ({
      ...prev,
      [boardId]: "",
    }));
    setListFeedback({
      type: "success",
      message: `Created subject "${data.name}".`,
    });
  };

  const startEditingExamBoard = (board: ExamBoardRow) => {
    setListFeedback(null);
    setEditingSubjectId(null);
    setEditingSubjectName("");
    setEditingChapterId(null);
    setEditingChapterName("");
    setEditingExamBoardId(board.id);
    setEditingExamBoardName(board.name);
    setTimeout(() => {
      editingExamBoardInputRef.current?.focus();
      editingExamBoardInputRef.current?.select();
    }, 0);
  };

  const cancelEditingExamBoard = () => {
    setEditingExamBoardId(null);
    setEditingExamBoardName("");
  };

  const handleRenameExamBoard = async (board: ExamBoardRow) => {
    const trimmed = editingExamBoardName.trim();
    if (!trimmed) {
      setListFeedback({
        type: "error",
        message: "Exam board name is required.",
      });
      return;
    }

    if (trimmed === board.name) {
      cancelEditingExamBoard();
      return;
    }

    setListFeedback(null);
    setBusyExamBoardId(board.id);
    const { error } = await supabase
      .from("exam_boards")
      .update({ name: trimmed })
      .eq("id", board.id);
    setBusyExamBoardId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message:
          error.code === "23505"
            ? "Another exam board already uses this name."
            : error.message,
      });
      return;
    }

    setExamBoards((prev) =>
      prev.map((item) =>
        item.id === board.id ? { ...item, name: trimmed } : item,
      ),
    );
    setListFeedback({
      type: "success",
      message: `Renamed exam board to "${trimmed}".`,
    });
    cancelEditingExamBoard();
  };

  const handleDeleteExamBoard = async (board: ExamBoardRow) => {
    const relatedSubjects = subjects.filter(
      (subject) => subject.exam_board_id === board.id,
    );
    const relatedSubjectIds = relatedSubjects.map((subject) => subject.id);

    const confirmed = window.confirm(
      relatedSubjects.length > 0
        ? `Deleting the exam board "${board.name}" will also remove ${relatedSubjects.length} subject(s). Continue?`
        : `Delete the exam board "${board.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setListFeedback(null);
    setBusyExamBoardId(board.id);
    const { error } = await supabase
      .from("exam_boards")
      .delete()
      .eq("id", board.id);
    setBusyExamBoardId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message:
          error.code === "23503"
            ? "Cannot delete this exam board because some subjects are still linked to questions."
            : error.message,
      });
      return;
    }

    const wasEditingBoard = editingExamBoardId === board.id;
    const editingSubject =
      editingSubjectId == null
        ? null
        : (subjects.find((item) => item.id === editingSubjectId) ?? null);
    const editingChapter =
      editingChapterId == null
        ? null
        : (chapters.find((item) => item.id === editingChapterId) ?? null);
    setExamBoards((prev) => {
      return prev.filter((item) => item.id !== board.id);
    });
    setSubjects((prev) =>
      prev.filter((subject) => subject.exam_board_id !== board.id),
    );
    setChapters((prev) =>
      prev.filter((chapter) => !relatedSubjectIds.includes(chapter.subject_id)),
    );
    setNewSubjectNames((prev) => {
      if (!(board.id in prev)) {
        return prev;
      }
      const { [board.id]: _removed, ...rest } = prev;
      return rest;
    });
    clearChapterDraftsForSubjects(relatedSubjectIds);
    if (
      creatingChapterTarget &&
      relatedSubjectIds.includes(creatingChapterTarget.subjectId)
    ) {
      setCreatingChapterTarget(null);
    }
    if (wasEditingBoard) {
      cancelEditingExamBoard();
    }
    if (editingSubject?.exam_board_id === board.id) {
      cancelEditingSubject();
    }
    if (
      editingChapter &&
      relatedSubjectIds.includes(editingChapter.subject_id)
    ) {
      setEditingChapterId(null);
      setEditingChapterName("");
    }
    setListFeedback({
      type: "success",
      message: `Deleted exam board "${board.name}".`,
    });
  };

  const startEditingSubject = (subject: SubjectRow) => {
    setListFeedback(null);
    setEditingExamBoardId(null);
    setEditingExamBoardName("");
    setEditingChapterId(null);
    setEditingChapterName("");
    setEditingSubjectId(subject.id);
    setEditingSubjectName(subject.name);
    setTimeout(() => {
      editingSubjectInputRef.current?.focus();
      editingSubjectInputRef.current?.select();
    }, 0);
  };

  const cancelEditingSubject = () => {
    setEditingSubjectId(null);
    setEditingSubjectName("");
  };

  const handleRenameSubject = async (subject: SubjectRow) => {
    const trimmed = editingSubjectName.trim();
    if (!trimmed) {
      setListFeedback({
        type: "error",
        message: "Subject name is required.",
      });
      return;
    }

    if (trimmed === subject.name) {
      cancelEditingSubject();
      return;
    }

    setListFeedback(null);
    setBusySubjectId(subject.id);
    const { error } = await supabase
      .from("subjects")
      .update({ name: trimmed })
      .eq("id", subject.id);
    setBusySubjectId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message:
          error.code === "23505"
            ? "Another subject in this exam board already has this name."
            : error.message,
      });
      return;
    }

    setSubjects((prev) =>
      prev.map((item) =>
        item.id === subject.id ? { ...item, name: trimmed } : item,
      ),
    );
    setListFeedback({
      type: "success",
      message: `Renamed subject to "${trimmed}".`,
    });
    cancelEditingSubject();
  };

  const handleDeleteSubject = async (subject: SubjectRow) => {
    const relatedChapters = chapters.filter(
      (chapter) => chapter.subject_id === subject.id,
    );
    const confirmed = window.confirm(
      relatedChapters.length > 0
        ? `Deleting the subject "${subject.name}" will also remove ${relatedChapters.length} chapter(s). Continue?`
        : `Delete the subject "${subject.name}"? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setListFeedback(null);
    setBusySubjectId(subject.id);
    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", subject.id);
    setBusySubjectId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message:
          error.code === "23503"
            ? "Cannot delete this subject because it still has related data (chapters or questions)."
            : error.message,
      });
      return;
    }

    setSubjects((prev) => prev.filter((item) => item.id !== subject.id));
    setChapters((prev) =>
      prev.filter((chapter) => chapter.subject_id !== subject.id),
    );
    clearChapterDraftsForSubjects([subject.id]);
    if (creatingChapterTarget?.subjectId === subject.id) {
      setCreatingChapterTarget(null);
    }
    if (editingSubjectId === subject.id) {
      cancelEditingSubject();
    }
    const editingChapter =
      editingChapterId == null
        ? null
        : (chapters.find((item) => item.id === editingChapterId) ?? null);
    if (editingChapter?.subject_id === subject.id) {
      setEditingChapterId(null);
      setEditingChapterName("");
    }
    setListFeedback({
      type: "success",
      message: `Deleted subject "${subject.name}".`,
    });
  };

  const startEditingChapter = (chapter: ChapterRow) => {
    setListFeedback(null);
    setEditingExamBoardId(null);
    setEditingExamBoardName("");
    setEditingSubjectId(null);
    setEditingSubjectName("");
    setEditingChapterId(chapter.id);
    setEditingChapterName(chapter.name);
    setTimeout(() => {
      editingChapterInputRef.current?.focus();
      editingChapterInputRef.current?.select();
    }, 0);
  };

  const cancelEditingChapter = () => {
    setEditingChapterId(null);
    setEditingChapterName("");
  };

  const handleRenameChapter = async (chapter: ChapterRow) => {
    const trimmed = editingChapterName.trim();
    if (!trimmed) {
      setListFeedback({
        type: "error",
        message: "Chapter name is required.",
      });
      return;
    }

    if (trimmed === chapter.name) {
      cancelEditingChapter();
      return;
    }

    setListFeedback(null);
    setBusyChapterId(chapter.id);
    const { error } = await supabase
      .from("chapters")
      .update({ name: trimmed })
      .eq("id", chapter.id);
    setBusyChapterId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message: error.message,
      });
      return;
    }

    setChapters((prev) =>
      prev.map((item) =>
        item.id === chapter.id ? { ...item, name: trimmed } : item,
      ),
    );
    setListFeedback({
      type: "success",
      message: `Renamed chapter to "${trimmed}".`,
    });
    cancelEditingChapter();
  };

  const handleDeleteChapter = async (chapter: ChapterRow) => {
    const confirmed = window.confirm(
      `Delete the chapter "${chapter.name}"? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setListFeedback(null);
    setBusyChapterId(chapter.id);
    const idsToDelete = collectChapterDescendantIds(chapter.id);
    const deleteBuilder = supabase.from("chapters").delete();
    const { error } =
      idsToDelete.length === 1
        ? await deleteBuilder.eq("id", chapter.id)
        : await deleteBuilder.in("id", idsToDelete);
    setBusyChapterId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message: error.message,
      });
      return;
    }

    const removedIds = new Set(idsToDelete);
    setChapters((prev) => prev.filter((item) => !removedIds.has(item.id)));
    clearChapterDraftsForChapters(idsToDelete);
    if (creatingChapterTarget) {
      const parentId = creatingChapterTarget.parentChapterId;
      if (parentId != null && removedIds.has(parentId)) {
        setCreatingChapterTarget(null);
      }
    }
    if (editingChapterId != null && removedIds.has(editingChapterId)) {
      cancelEditingChapter();
    }
    setListFeedback({
      type: "success",
      message:
        idsToDelete.length > 1
          ? `Deleted chapter "${chapter.name}" and ${idsToDelete.length - 1} sub-chapter(s).`
          : `Deleted chapter "${chapter.name}".`,
    });
  };

  const handleCreateChapter = async (
    event: React.FormEvent<HTMLFormElement>,
    subjectId: number,
    parentChapterId: number | null = null,
  ) => {
    event.preventDefault();
    setListFeedback(null);

    const draftName = getChapterDraftValue(subjectId, parentChapterId);
    const trimmed = draftName.trim();
    if (!trimmed) {
      setListFeedback({
        type: "error",
        message: "Chapter name is required.",
      });
      return;
    }

    setCreatingChapterTarget({ subjectId, parentChapterId });
    const siblings = chapters.filter(
      (chapter) =>
        chapter.subject_id === subjectId &&
        chapter.parent_chapter_id === parentChapterId,
    );
    const nextPosition =
      siblings.length === 0
        ? 1
        : Math.max(
            ...siblings.map((item) =>
              item.position == null ? siblings.length : item.position,
            ),
          ) + 1;
    const { data, error } = await supabase
      .from("chapters")
      .insert({
        name: trimmed,
        subject_id: subjectId,
        parent_chapter_id: parentChapterId,
        position: nextPosition,
      })
      .select("id, name, subject_id, parent_chapter_id, position, created_at")
      .single();
    setCreatingChapterTarget(null);

    if (error || !data) {
      setListFeedback({
        type: "error",
        message: error?.message ?? "Failed to create chapter.",
      });
      return;
    }

    setChapters((prev) => [...prev, data]);
    clearChapterDraftValue(subjectId, parentChapterId);
    setListFeedback({
      type: "success",
      message: `Created chapter "${data.name}".`,
    });
  };

  const renderChapterTree = (
    subjectId: number,
    chaptersList: ChapterRow[],
    isSubjectBusy: boolean,
    depth = 0,
  ): ReactNode => {
    if (chaptersList.length === 0) {
      return null;
    }
    return (
      <ul
        className={cn(
          "space-y-2",
          depth > 0 ? "border-l border-slate-200 pl-4" : null,
        )}
      >
        {chaptersList.map((chapter) => {
          const childChapters = chapterChildrenMap.get(chapter.id) ?? [];
          const childDraftValue = getChapterDraftValue(subjectId, chapter.id);
          const isCreatingChild =
            creatingChapterTarget?.subjectId === subjectId &&
            creatingChapterTarget?.parentChapterId === chapter.id;
          const isChapterBusy =
            busyChapterId === chapter.id || isSubjectBusy || isCreatingChild;
          const isEditingChapterCurrent = editingChapterId === chapter.id;
          return (
            <li
              key={chapter.id}
              className="space-y-2 rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {isEditingChapterCurrent ? (
                  <form
                    className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      handleRenameChapter(chapter);
                    }}
                  >
                    <Input
                      ref={editingChapterInputRef}
                      value={editingChapterName}
                      onChange={(event) =>
                        setEditingChapterName(event.target.value)
                      }
                      disabled={isChapterBusy}
                      className="flex-1"
                      aria-label={`Rename ${chapter.name}`}
                    />
                    <div className="flex items-center gap-1.5">
                      <Button type="submit" size="sm" disabled={isChapterBusy}>
                        {isChapterBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "保存"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditingChapter}
                        disabled={isChapterBusy}
                      >
                        取消
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span className="truncate font-medium text-slate-700">
                      {chapter.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => startEditingChapter(chapter)}
                        disabled={isChapterBusy}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleDeleteChapter(chapter)}
                        disabled={isChapterBusy}
                        className="text-red-500 hover:text-red-600"
                      >
                        {isChapterBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
              {childChapters.length > 0 ? (
                <div className="text-xs sm:text-sm">
                  {renderChapterTree(
                    subjectId,
                    childChapters,
                    isSubjectBusy,
                    depth + 1,
                  )}
                </div>
              ) : null}
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
                onSubmit={(event) =>
                  handleCreateChapter(event, subjectId, chapter.id)
                }
              >
                <Label
                  htmlFor={`new-subchapter-${chapter.id}`}
                  className="sr-only"
                >
                  新子章节名称
                </Label>
                <Input
                  id={`new-subchapter-${chapter.id}`}
                  placeholder="新增子章节"
                  value={childDraftValue}
                  disabled={isChapterBusy}
                  onChange={(event) =>
                    setChapterDraftValue(
                      subjectId,
                      chapter.id,
                      event.target.value,
                    )
                  }
                />
                <Button type="submit" disabled={isChapterBusy}>
                  {isCreatingChild ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  添加子章节
                </Button>
              </form>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Subject Management
          </h1>
          <p className="text-sm text-slate-500">
            管理考试局以及其下的学科，方便后续题目分类和检索。
          </p>
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Exam Boards & Subjects</CardTitle>
          <CardDescription>
            管理现有的考试局与学科，支持重命名与删除操作。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            ref={examBoardFormRef}
            className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 sm:flex sm:items-end sm:gap-3"
            onSubmit={handleCreateExamBoard}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="exam-board-name">新考试局名称</Label>
              <Input
                id="exam-board-name"
                ref={newExamBoardInputRef}
                placeholder="例如：AQA, Edexcel"
                value={newExamBoardName}
                onChange={(event) => setNewExamBoardName(event.target.value)}
                disabled={isCreatingExamBoard}
              />
            </div>
            <Button
              type="submit"
              className="mt-3 sm:mt-0"
              disabled={isCreatingExamBoard}
            >
              {isCreatingExamBoard ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              创建考试局
            </Button>
          </form>

          {listFeedback ? (
            <div
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                listFeedback.type === "error"
                  ? "bg-red-50 text-red-600"
                  : "bg-green-50 text-green-600",
              )}
            >
              {listFeedback.message}
            </div>
          ) : null}

          {sortedExamBoards.length === 0 ? (
            <div className="rounded-lg border border-slate-200 px-6 py-10 text-center text-sm text-slate-500">
              暂无考试局，请先创建。
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
              {sortedExamBoards.map((board) => {
                const boardSubjects = subjectsByBoard.get(board.id) ?? [];
                const isBusy = busyExamBoardId === board.id;
                const isEditingBoard = editingExamBoardId === board.id;
                const draftSubjectName = newSubjectNames[board.id] ?? "";
                const isCreatingSubject = creatingSubjectBoardId === board.id;
                return (
                  <li key={board.id} className="px-6 py-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-1">
                          {isEditingBoard ? (
                            <form
                              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                handleRenameExamBoard(board);
                              }}
                            >
                              <Input
                                ref={editingExamBoardInputRef}
                                value={editingExamBoardName}
                                onChange={(event) =>
                                  setEditingExamBoardName(event.target.value)
                                }
                                disabled={isBusy}
                                className="flex-1"
                                aria-label={`Rename ${board.name}`}
                              />
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={isBusy}
                                >
                                  {isBusy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    "保存"
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditingExamBoard}
                                  disabled={isBusy}
                                >
                                  取消
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-slate-900">
                                {board.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                Subjects: {boardSubjects.length}
                              </p>
                            </>
                          )}
                        </div>
                        {!isEditingBoard ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => startEditingExamBoard(board)}
                              disabled={isBusy}
                              className="text-slate-600 hover:text-slate-900"
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => handleDeleteExamBoard(board)}
                              disabled={isBusy}
                              className="text-red-500 hover:text-red-600"
                            >
                              {isBusy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg bg-slate-50 p-4">
                      {boardSubjects.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          暂无学科，使用下方输入框创建。
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {boardSubjects.map((subject) => {
                            const totalChapters =
                              chaptersBySubject.get(subject.id)?.length ?? 0;
                            const rootChapters =
                              rootChaptersBySubject.get(subject.id) ?? [];
                            const rootDraftName = getChapterDraftValue(
                              subject.id,
                              null,
                            );
                            const isCreatingChapterForSubject =
                              creatingChapterTarget?.subjectId === subject.id;
                            const isCreatingRootChapter =
                              isCreatingChapterForSubject &&
                              creatingChapterTarget?.parentChapterId == null;
                            const isSubjectBusy =
                              busySubjectId === subject.id ||
                              isBusy ||
                              isCreatingSubject ||
                              isCreatingChapterForSubject;
                            const isEditingSubject =
                              editingSubjectId === subject.id;
                            return (
                              <li
                                key={subject.id}
                                className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  {isEditingSubject ? (
                                    <form
                                      className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        handleRenameSubject(subject);
                                      }}
                                    >
                                      <Input
                                        ref={editingSubjectInputRef}
                                        value={editingSubjectName}
                                        onChange={(event) =>
                                          setEditingSubjectName(
                                            event.target.value,
                                          )
                                        }
                                        disabled={isSubjectBusy}
                                        className="flex-1"
                                        aria-label={`Rename ${subject.name}`}
                                      />
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          type="submit"
                                          size="sm"
                                          disabled={isSubjectBusy}
                                        >
                                          {isSubjectBusy ? (
                                            <Loader2 className="size-4 animate-spin" />
                                          ) : (
                                            "保存"
                                          )}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={cancelEditingSubject}
                                          disabled={isSubjectBusy}
                                        >
                                          取消
                                        </Button>
                                      </div>
                                    </form>
                                  ) : (
                                    <>
                                      <span className="font-medium text-slate-700">
                                        {subject.name}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <Button
                                          type="button"
                                          size="icon-sm"
                                          variant="ghost"
                                          onClick={() =>
                                            startEditingSubject(subject)
                                          }
                                          disabled={isSubjectBusy}
                                          className="text-slate-600 hover:text-slate-900"
                                        >
                                          <Pencil
                                            className="size-4"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="icon-sm"
                                          variant="ghost"
                                          onClick={() =>
                                            handleDeleteSubject(subject)
                                          }
                                          disabled={isSubjectBusy}
                                          className="text-red-500 hover:text-red-600"
                                        >
                                          {isSubjectBusy ? (
                                            <Loader2 className="size-4 animate-spin" />
                                          ) : (
                                            <Trash2
                                              className="size-4"
                                              aria-hidden="true"
                                            />
                                          )}
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <p className="font-semibold text-slate-700">
                                      Chapters
                                    </p>
                                    <span className="text-slate-500">
                                      {totalChapters} 个章节
                                    </span>
                                  </div>
                                  {rootChapters.length === 0 ? (
                                    <p className="mt-2 text-xs text-slate-500">
                                      暂无章节，使用下方输入框创建。
                                    </p>
                                  ) : (
                                    <div className="mt-2 text-xs sm:text-sm">
                                      {renderChapterTree(
                                        subject.id,
                                        rootChapters,
                                        isSubjectBusy,
                                      )}
                                    </div>
                                  )}
                                  <form
                                    className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
                                    onSubmit={(event) =>
                                      handleCreateChapter(
                                        event,
                                        subject.id,
                                        null,
                                      )
                                    }
                                  >
                                    <Label
                                      htmlFor={`new-chapter-root-${subject.id}`}
                                      className="sr-only"
                                    >
                                      新章节名称
                                    </Label>
                                    <Input
                                      id={`new-chapter-root-${subject.id}`}
                                      placeholder="新增章节，例如：代数基础"
                                      value={rootDraftName}
                                      disabled={isSubjectBusy}
                                      onChange={(event) =>
                                        setChapterDraftValue(
                                          subject.id,
                                          null,
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <Button
                                      type="submit"
                                      disabled={isSubjectBusy}
                                    >
                                      {isCreatingRootChapter ? (
                                        <Loader2 className="size-4 animate-spin" />
                                      ) : (
                                        <Plus
                                          className="size-4"
                                          aria-hidden="true"
                                        />
                                      )}
                                      添加章节
                                    </Button>
                                  </form>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <form
                        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2"
                        onSubmit={(event) =>
                          handleCreateSubject(event, board.id)
                        }
                      >
                        <Label
                          htmlFor={`new-subject-${board.id}`}
                          className="sr-only"
                        >
                          新学科名称
                        </Label>
                        <Input
                          id={`new-subject-${board.id}`}
                          placeholder="新增学科，例如：Mathematics"
                          value={draftSubjectName}
                          disabled={isCreatingSubject || isBusy}
                          onChange={(event) => {
                            const value = event.target.value;
                            setNewSubjectNames((prev) => ({
                              ...prev,
                              [board.id]: value,
                            }));
                          }}
                        />
                        <Button
                          type="submit"
                          disabled={isCreatingSubject || isBusy}
                        >
                          {isCreatingSubject ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Plus className="size-4" aria-hidden="true" />
                          )}
                          添加学科
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
