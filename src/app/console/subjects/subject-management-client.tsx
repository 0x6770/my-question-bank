"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

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

type Feedback = { type: "success" | "error"; message: string };

type SubjectManagementProps = {
  initialExamBoards: ExamBoardRow[];
  initialSubjects: SubjectRow[];
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

export function SubjectManagement({
  initialExamBoards,
  initialSubjects,
  loadError,
}: SubjectManagementProps) {
  const supabase = useMemo(() => createClient(), []);

  const [examBoards, setExamBoards] =
    useState<ExamBoardRow[]>(initialExamBoards);
  const [subjects, setSubjects] = useState<SubjectRow[]>(initialSubjects);

  const [newExamBoardName, setNewExamBoardName] = useState("");
  const [newSubjectNames, setNewSubjectNames] = useState<
    Record<number, string>
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
  const [busyExamBoardId, setBusyExamBoardId] = useState<number | null>(null);
  const [busySubjectId, setBusySubjectId] = useState<number | null>(null);

  const [editingExamBoardId, setEditingExamBoardId] = useState<number | null>(
    null,
  );
  const [editingExamBoardName, setEditingExamBoardName] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");

  const examBoardFormRef = useRef<HTMLFormElement>(null);
  const newExamBoardInputRef = useRef<HTMLInputElement>(null);
  const editingExamBoardInputRef = useRef<HTMLInputElement>(null);
  const editingSubjectInputRef = useRef<HTMLInputElement>(null);

  const sortedExamBoards = useMemo(
    () => examBoards.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [examBoards],
  );

  const subjectsByBoard = useMemo(
    () => buildSubjectsByBoard(subjects),
    [subjects],
  );

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
    setExamBoards((prev) => {
      return prev.filter((item) => item.id !== board.id);
    });
    setSubjects((prev) =>
      prev.filter((subject) => subject.exam_board_id !== board.id),
    );
    setNewSubjectNames((prev) => {
      if (!(board.id in prev)) {
        return prev;
      }
      const { [board.id]: _removed, ...rest } = prev;
      return rest;
    });
    if (wasEditingBoard) {
      cancelEditingExamBoard();
    }
    if (editingSubject?.exam_board_id === board.id) {
      cancelEditingSubject();
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
    const confirmed = window.confirm(
      `Delete the subject "${subject.name}"? This action cannot be undone.`,
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
            ? "Cannot delete this subject because it is linked to existing questions."
            : error.message,
      });
      return;
    }

    setSubjects((prev) => prev.filter((item) => item.id !== subject.id));
    if (editingSubjectId === subject.id) {
      cancelEditingSubject();
    }
    setListFeedback({
      type: "success",
      message: `Deleted subject "${subject.name}".`,
    });
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
                            const isSubjectBusy =
                              busySubjectId === subject.id ||
                              isBusy ||
                              creatingSubjectBoardId === board.id;
                            const isEditingSubject =
                              editingSubjectId === subject.id;
                            return (
                              <li
                                key={subject.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                              >
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
