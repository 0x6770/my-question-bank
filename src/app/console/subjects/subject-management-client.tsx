"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "../../../../database.types";

type ExamBoardRow = Tables<"exam_boards">;
type SubjectRow = Tables<"subjects">;
type ChapterRow = Tables<"chapters">;

type Toast = { id: string; type: "success" | "error"; message: string };

type ModalState =
  | { type: "createBoard" }
  | { type: "editBoard"; board: ExamBoardRow }
  | { type: "createSubject"; board: ExamBoardRow }
  | { type: "editSubject"; subject: SubjectRow }
  | {
      type: "createChapter";
      subject: SubjectRow;
      parentChapterId: number | null;
    }
  | { type: "editChapter"; chapter: ChapterRow };

type SubjectManagementProps = {
  initialExamBoards: ExamBoardRow[];
  initialSubjects: SubjectRow[];
  initialChapters: ChapterRow[];
  loadError: string | null;
  questionBank: QuestionBank;
};

const compareByName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "zh-CN");

const compareChapters = (a: ChapterRow, b: ChapterRow) => {
  if (a.position !== b.position) {
    return (a.position ?? 0) - (b.position ?? 0);
  }
  return a.name.localeCompare(b.name, "zh-CN");
};

function Modal({
  open,
  title,
  description,
  children,
  onClose,
  busy,
  onConfirm,
  confirmLabel = "Save",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
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
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-md px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200",
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function SubjectManagement({
  initialExamBoards,
  initialSubjects,
  initialChapters,
  loadError,
  questionBank,
}: SubjectManagementProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [examBoards, setExamBoards] =
    useState<ExamBoardRow[]>(initialExamBoards);
  const [subjects, setSubjects] = useState<SubjectRow[]>(initialSubjects);
  const [chapters, setChapters] = useState<ChapterRow[]>(initialChapters);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(
    initialExamBoards[0]?.id ?? null,
  );
  const [openSubjectId, setOpenSubjectId] = useState<number | null>(null);
  const [boardQuery, setBoardQuery] = useState("");
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalName, setModalName] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [busyExamBoardId, setBusyExamBoardId] = useState<number | null>(null);
  const [busySubjectId, setBusySubjectId] = useState<number | null>(null);
  const [busyChapterId, setBusyChapterId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Update state when props change (e.g., when switching question bank tabs)
  useEffect(() => {
    setExamBoards(initialExamBoards);
    setSubjects(initialSubjects);
    setChapters(initialChapters);
    setSelectedBoardId(initialExamBoards[0]?.id ?? null);
    setOpenSubjectId(null);
  }, [initialExamBoards, initialSubjects, initialChapters]);

  const sortedExamBoards = useMemo(
    () => examBoards.slice().sort(compareByName),
    [examBoards],
  );

  const subjectsByBoard = useMemo(() => {
    const map = new Map<number, SubjectRow[]>();
    for (const subject of subjects) {
      if (!map.has(subject.exam_board_id)) {
        map.set(subject.exam_board_id, []);
      }
      map.get(subject.exam_board_id)?.push(subject);
    }
    for (const list of map.values()) {
      list.sort(compareByName);
    }
    return map;
  }, [subjects]);

  const rootChaptersBySubject = useMemo(() => {
    const map = new Map<number, ChapterRow[]>();
    for (const chapter of chapters) {
      if (chapter.parent_chapter_id != null) continue;
      if (!map.has(chapter.subject_id)) map.set(chapter.subject_id, []);
      map.get(chapter.subject_id)?.push(chapter);
    }
    for (const list of map.values()) list.sort(compareChapters);
    return map;
  }, [chapters]);

  const chapterChildrenMap = useMemo(() => {
    const map = new Map<number, ChapterRow[]>();
    for (const chapter of chapters) {
      if (chapter.parent_chapter_id == null) continue;
      if (!map.has(chapter.parent_chapter_id)) {
        map.set(chapter.parent_chapter_id, []);
      }
      map.get(chapter.parent_chapter_id)?.push(chapter);
    }
    for (const list of map.values()) list.sort(compareChapters);
    return map;
  }, [chapters]);

  const pushToast = useCallback((type: Toast["type"], message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3800);
  }, []);

  useEffect(() => {
    if (loadError) {
      pushToast("error", loadError);
    }
  }, [loadError, pushToast]);

  const filteredBoards = sortedExamBoards.filter((board) =>
    board.name.toLowerCase().includes(boardQuery.toLowerCase()),
  );

  const selectedBoard =
    selectedBoardId == null
      ? null
      : (filteredBoards.find((board) => board.id === selectedBoardId) ??
        sortedExamBoards.find((board) => board.id === selectedBoardId) ??
        null);

  const openCreateBoard = () => {
    setModalState({ type: "createBoard" });
    setModalName("");
  };

  const openEditBoard = (board: ExamBoardRow) => {
    setModalState({ type: "editBoard", board });
    setModalName(board.name);
  };

  const openCreateSubject = (board: ExamBoardRow) => {
    setModalState({ type: "createSubject", board });
    setModalName("");
  };

  const openEditSubject = (subject: SubjectRow) => {
    setModalState({ type: "editSubject", subject });
    setModalName(subject.name);
  };

  const openCreateChapter = (
    subject: SubjectRow,
    parentChapterId: number | null,
  ) => {
    setModalState({ type: "createChapter", subject, parentChapterId });
    setModalName("");
  };

  const openEditChapter = (chapter: ChapterRow) => {
    setModalState({ type: "editChapter", chapter });
    setModalName(chapter.name);
  };

  const closeModal = () => {
    if (modalBusy) return;
    setModalState(null);
    setModalName("");
  };

  const submitModal = async () => {
    if (!modalState) return;
    const trimmed = modalName.trim();
    if (!trimmed) {
      pushToast("error", "Please enter a name before saving.");
      return;
    }
    setModalBusy(true);
    try {
      if (modalState.type === "createBoard") {
        const { data, error } = await supabase
          .from("exam_boards")
          .insert({ name: trimmed, question_bank: questionBank })
          .select("id, name, question_bank, created_at")
          .single();
        if (error || !data)
          throw new Error(error?.message ?? "Creation failed");
        setExamBoards((prev) => [...prev, data]);
        setSelectedBoardId(data.id);
        pushToast("success", `Exam board created「${data.name}」`);
      } else if (modalState.type === "editBoard") {
        const { board } = modalState;
        if (trimmed === board.name) {
          closeModal();
          return;
        }
        setBusyExamBoardId(board.id);
        const { error } = await supabase
          .from("exam_boards")
          .update({ name: trimmed })
          .eq("id", board.id);
        setBusyExamBoardId(null);
        if (error) throw new Error(error.message);
        setExamBoards((prev) =>
          prev.map((item) =>
            item.id === board.id ? { ...item, name: trimmed } : item,
          ),
        );
        pushToast("success", `Renamed to「${trimmed}」`);
      } else if (modalState.type === "createSubject") {
        const { board } = modalState;
        const { data, error } = await supabase
          .from("subjects")
          .insert({ name: trimmed, exam_board_id: board.id })
          .select("id, name, exam_board_id, created_at")
          .single();
        if (error || !data)
          throw new Error(error?.message ?? "Creation failed");
        setSubjects((prev) => [...prev, data]);
        pushToast(
          "success",
          `Added subject to「${board.name}」New subject added「${data.name}」`,
        );
      } else if (modalState.type === "editSubject") {
        const { subject } = modalState;
        if (trimmed === subject.name) {
          closeModal();
          return;
        }
        setBusySubjectId(subject.id);
        const { error } = await supabase
          .from("subjects")
          .update({ name: trimmed })
          .eq("id", subject.id);
        setBusySubjectId(null);
        if (error) throw new Error(error.message);
        setSubjects((prev) =>
          prev.map((item) =>
            item.id === subject.id ? { ...item, name: trimmed } : item,
          ),
        );
        pushToast("success", `Subject renamed to「${trimmed}」`);
      } else if (modalState.type === "createChapter") {
        const { subject, parentChapterId } = modalState;
        const siblings = chapters.filter(
          (chapter) =>
            chapter.subject_id === subject.id &&
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
            subject_id: subject.id,
            parent_chapter_id: parentChapterId,
            position: nextPosition,
          })
          .select(
            "id, name, subject_id, parent_chapter_id, position, created_at",
          )
          .single();
        if (error || !data)
          throw new Error(error?.message ?? "Creation failed");
        setChapters((prev) => [...prev, data]);
        pushToast("success", `Chapter created「${data.name}」`);
      } else if (modalState.type === "editChapter") {
        const { chapter } = modalState;
        if (trimmed === chapter.name) {
          closeModal();
          return;
        }
        setBusyChapterId(chapter.id);
        const { error } = await supabase
          .from("chapters")
          .update({ name: trimmed })
          .eq("id", chapter.id);
        setBusyChapterId(null);
        if (error) throw new Error(error.message);
        setChapters((prev) =>
          prev.map((item) =>
            item.id === chapter.id ? { ...item, name: trimmed } : item,
          ),
        );
        pushToast("success", `Chapter renamed to「${trimmed}」`);
      }
      closeModal();
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error
          ? error.message
          : "Operation failed, please try again later.",
      );
    } finally {
      setModalBusy(false);
    }
  };

  const collectChapterDescendantIds = (chapterId: number) => {
    const ids: number[] = [chapterId];
    const stack = [chapterId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) continue;
      const children = chapterChildrenMap.get(current) ?? [];
      for (const child of children) {
        ids.push(child.id);
        stack.push(child.id);
      }
    }
    return ids;
  };

  const handleDeleteBoard = async (board: ExamBoardRow) => {
    const relatedSubjects = subjects.filter(
      (subject) => subject.exam_board_id === board.id,
    );
    const confirmed = window.confirm(
      relatedSubjects.length > 0
        ? `Delete「${board.name}」will also remove its ${relatedSubjects.length} subjects and chapters. Continue?`
        : `Delete exam board "${board.name}"?`,
    );
    if (!confirmed) return;
    setBusyExamBoardId(board.id);
    const { error } = await supabase
      .from("exam_boards")
      .delete()
      .eq("id", board.id);
    setBusyExamBoardId(null);
    if (error) {
      pushToast(
        "error",
        error.code === "23503"
          ? "Cannot delete due to related data."
          : error.message,
      );
      return;
    }
    const remainingBoards = examBoards.filter((item) => item.id !== board.id);
    setExamBoards(remainingBoards);
    const removedSubjectIds = subjects
      .filter((s) => s.exam_board_id === board.id)
      .map((s) => s.id);
    setSubjects((prev) => prev.filter((s) => s.exam_board_id !== board.id));
    setChapters((prev) =>
      prev.filter((c) => !removedSubjectIds.includes(c.subject_id)),
    );
    if (selectedBoardId === board.id) {
      setSelectedBoardId(remainingBoards[0]?.id ?? null);
      setOpenSubjectId(null);
    }
    pushToast("success", `Deleted exam board "${board.name}"`);
  };

  const handleDeleteSubject = async (subject: SubjectRow) => {
    const relatedChapters = chapters.filter(
      (chapter) => chapter.subject_id === subject.id,
    );
    const confirmed = window.confirm(
      relatedChapters.length > 0
        ? `Deleting subject "${subject.name}" will also remove ${relatedChapters.length} chapters. Continue?`
        : `Delete subject "${subject.name}"?`,
    );
    if (!confirmed) return;
    setBusySubjectId(subject.id);
    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", subject.id);
    setBusySubjectId(null);
    if (error) {
      pushToast(
        "error",
        error.code === "23503"
          ? "Cannot delete due to related data."
          : error.message,
      );
      return;
    }
    setSubjects((prev) => prev.filter((item) => item.id !== subject.id));
    setChapters((prev) =>
      prev.filter((chapter) => chapter.subject_id !== subject.id),
    );
    if (openSubjectId === subject.id) {
      setOpenSubjectId(null);
    }
    pushToast("success", `Deleted subject "${subject.name}"`);
  };

  const handleDeleteChapter = async (chapter: ChapterRow) => {
    const confirmed = window.confirm(
      `Delete chapter "${chapter.name}" and all subchapters?`,
    );
    if (!confirmed) return;
    setBusyChapterId(chapter.id);
    const idsToDelete = collectChapterDescendantIds(chapter.id);
    const deleteBuilder = supabase.from("chapters").delete();
    const { error } =
      idsToDelete.length === 1
        ? await deleteBuilder.eq("id", chapter.id)
        : await deleteBuilder.in("id", idsToDelete);
    setBusyChapterId(null);
    if (error) {
      pushToast("error", error.message);
      return;
    }
    const removed = new Set(idsToDelete);
    setChapters((prev) => prev.filter((item) => !removed.has(item.id)));
    pushToast(
      "success",
      idsToDelete.length > 1
        ? `Deleted chapter and ${idsToDelete.length - 1} subchapters`
        : "Deleted chapter",
    );
  };

  const handleReorderChapter = async (
    chapterId: number,
    direction: "up" | "down",
  ) => {
    const current = chapters.find((item) => item.id === chapterId);
    if (!current) return;
    const siblings = chapters
      .filter(
        (chapter) =>
          chapter.subject_id === current.subject_id &&
          chapter.parent_chapter_id === current.parent_chapter_id,
      )
      .sort(compareChapters);
    const currentIndex = siblings.findIndex((item) => item.id === chapterId);
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    const currentPosition = siblings[currentIndex].position ?? currentIndex + 1;
    const targetPosition = siblings[targetIndex].position ?? targetIndex + 1;

    setBusyChapterId(chapterId);
    try {
      await Promise.all([
        supabase
          .from("chapters")
          .update({ position: targetPosition })
          .eq("id", siblings[currentIndex].id),
        supabase
          .from("chapters")
          .update({ position: currentPosition })
          .eq("id", siblings[targetIndex].id),
      ]);

      setChapters((prev) =>
        prev.map((item) => {
          if (item.id === siblings[currentIndex].id) {
            return { ...item, position: targetPosition };
          }
          if (item.id === siblings[targetIndex].id) {
            return { ...item, position: currentPosition };
          }
          return item;
        }),
      );
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Failed to reorder chapters.",
      );
    } finally {
      setBusyChapterId(null);
    }
  };

  const renderChapterTree = (
    chaptersList: ChapterRow[],
    subject: SubjectRow,
    depth = 0,
  ) => {
    if (chaptersList.length === 0) return null;
    return (
      <ul
        className={cn(
          "space-y-2",
          depth > 0 ? "border-l border-slate-200 pl-4" : null,
        )}
      >
        {chaptersList.map((chapter, index) => {
          const children = chapterChildrenMap.get(chapter.id) ?? [];
          const isBusy = busyChapterId === chapter.id;
          const orderLabel = `${index + 1}.`;
          return (
            <li
              key={chapter.id}
              className="rounded-lg border border-slate-200 bg-white/70 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {children.length > 0 ? (
                    <div className="text-slate-400">
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </div>
                  ) : null}
                  <span className="text-sm font-semibold text-slate-500">
                    {orderLabel}
                  </span>
                  <span className="font-medium text-slate-700">
                    {chapter.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {depth === 0 ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openCreateChapter(subject, chapter.id)}
                      disabled={isBusy}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleReorderChapter(chapter.id, "up")}
                    disabled={isBusy || index === 0}
                    className="text-slate-500 hover:text-slate-800"
                    title="Move up"
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleReorderChapter(chapter.id, "down")}
                    disabled={isBusy || index === chaptersList.length - 1}
                    className="text-slate-500 hover:text-slate-800"
                    title="Move down"
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEditChapter(chapter)}
                    disabled={isBusy}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleDeleteChapter(chapter)}
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
              </div>
              {children.length > 0 ? (
                <div className="mt-2 text-xs sm:text-sm">
                  {renderChapterTree(children, subject, depth + 1)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  const handleBankChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value === "typical") {
      params.delete("bank"); // default, so remove param
    } else {
      params.set("bank", value);
    }
    const query = params.toString();
    router.push(`/console/subjects${query ? `?${query}` : ""}`);
  };

  const currentBankTab =
    questionBank === QUESTION_BANK.PAST_PAPER_QUESTIONS
      ? "past-paper"
      : questionBank === QUESTION_BANK.EXAM_PAPER
        ? "exam-paper"
        : "typical";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <ToastStack toasts={toasts} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Subject Management
          </h1>
          <p className="text-sm text-slate-500">
            Select an exam board on the left and manage its subjects/chapters on
            the right.
          </p>
          <Tabs value={currentBankTab} onValueChange={handleBankChange}>
            <TabsList>
              <TabsTrigger value="past-paper">Past Paper Questions</TabsTrigger>
              <TabsTrigger value="typical">Topical Questions</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openCreateBoard} className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            New Exam Board
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base">Exam Board</CardTitle>
            <CardDescription className="text-sm">
              Quickly filter and select an exam board to manage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="board-search">Search</Label>
              <Input
                id="board-search"
                placeholder="Enter keywords..."
                value={boardQuery}
                onChange={(event) => setBoardQuery(event.target.value)}
              />
            </div>
            {filteredBoards.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No matching exam boards.
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredBoards.map((board) => {
                  const boardSubjects = subjectsByBoard.get(board.id) ?? [];
                  const isSelected = selectedBoardId === board.id;
                  const isBusy = busyExamBoardId === board.id;
                  const selectBoard = () => {
                    setSelectedBoardId(board.id);
                    setOpenSubjectId(null);
                  };
                  const handleBoardKeyDown = (
                    event: React.KeyboardEvent<HTMLButtonElement>,
                  ) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectBoard();
                    }
                  };
                  return (
                    <li
                      key={board.id}
                      className={cn(
                        "group relative rounded-lg border transition hover:border-slate-300",
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <button
                        type="button"
                        onClick={selectBoard}
                        onKeyDown={handleBoardKeyDown}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 pr-16 text-left"
                      >
                        <div className="text-left">
                          <p
                            className={cn(
                              "text-sm font-semibold",
                              isSelected ? "text-white" : "text-slate-900",
                            )}
                          >
                            {board.name}
                          </p>
                          <p
                            className={cn(
                              "text-xs",
                              isSelected ? "text-slate-200" : "text-slate-500",
                            )}
                          >
                            {boardSubjects.length} subjects
                          </p>
                        </div>
                      </button>
                      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => openEditBoard(board)}
                          disabled={isBusy}
                          className={cn(
                            isSelected
                              ? "text-white hover:text-white/80"
                              : "text-slate-500 hover:text-slate-800",
                          )}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDeleteBoard(board)}
                          disabled={isBusy}
                          className={cn(
                            isSelected
                              ? "text-red-200 hover:text-red-100"
                              : "text-red-500 hover:text-red-600",
                          )}
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base">Subjects & Chapters</CardTitle>
            <CardDescription className="text-sm">
              Manage subjects and chapters under the current exam board.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedBoard == null ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-500">
                Please select an exam board on the left.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedBoard.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {subjectsByBoard.get(selectedBoard.id)?.length ?? 0}{" "}
                      subjects
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openCreateSubject(selectedBoard)}
                      className="gap-2"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      New Subject
                    </Button>
                  </div>
                </div>

                {(subjectsByBoard.get(selectedBoard.id) ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-slate-500">
                    No subjects yet. Click "New Subject" to start.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(subjectsByBoard.get(selectedBoard.id) ?? []).map(
                      (subject) => {
                        const roots =
                          rootChaptersBySubject.get(subject.id) ?? [];
                        const totalChapters =
                          chapters.filter(
                            (chapter) => chapter.subject_id === subject.id,
                          ).length ?? 0;
                        const isOpen = openSubjectId === subject.id;
                        const isBusy = busySubjectId === subject.id;
                        const toggleSubject = () =>
                          setOpenSubjectId(isOpen ? null : subject.id);
                        return (
                          <div
                            key={subject.id}
                            className="rounded-xl border border-slate-200 bg-white shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-2 px-4 py-3">
                              <button
                                type="button"
                                onClick={toggleSubject}
                                className="flex flex-1 items-center gap-3 text-left"
                              >
                                {isOpen ? (
                                  <ChevronDown className="size-4 text-slate-500" />
                                ) : (
                                  <ChevronRight className="size-4 text-slate-500" />
                                )}
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {subject.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {totalChapters} chapters
                                  </p>
                                </div>
                              </button>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() =>
                                    openCreateChapter(subject, null)
                                  }
                                >
                                  <Plus className="size-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => openEditSubject(subject)}
                                  disabled={isBusy}
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
                                  onClick={() => handleDeleteSubject(subject)}
                                  disabled={isBusy}
                                  className="text-red-500 hover:text-red-600"
                                >
                                  {isBusy ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Trash2
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                  )}
                                </Button>
                              </div>
                            </div>
                            {isOpen ? (
                              <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                                {roots.length === 0 ? (
                                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                                    No chapters yet. Click the + above to add.
                                  </div>
                                ) : (
                                  renderChapterTree(roots, subject)
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={modalState != null}
        title={
          modalState?.type === "createBoard"
            ? "New Exam Board"
            : modalState?.type === "editBoard"
              ? "Rename Exam Board"
              : modalState?.type === "createSubject"
                ? "New Subject"
                : modalState?.type === "editSubject"
                  ? "Rename Subject"
                  : modalState?.type === "createChapter"
                    ? "New Chapter"
                    : "Rename Chapter"
        }
        description={
          modalState?.type === "createSubject" && modalState.board
            ? `Exam board: ${modalState.board.name}`
            : modalState?.type === "createChapter" && modalState.subject
              ? `Subject: ${modalState.subject.name}`
              : undefined
        }
        onClose={closeModal}
        onConfirm={submitModal}
        busy={modalBusy}
        confirmLabel="Save"
      >
        <div className="space-y-2">
          <Label htmlFor="modal-name">Name</Label>
          <Input
            id="modal-name"
            autoFocus
            value={modalName}
            onChange={(event) => setModalName(event.target.value)}
            disabled={modalBusy}
            placeholder="Please enter a name"
          />
        </div>
      </Modal>
    </div>
  );
}
