"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QuestionCard } from "@/components/question-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type TreeNode, TreeSelect } from "@/components/ui/tree-select";
import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";

type ExamBoardRow = { id: number; name: string };

type SubjectRow = {
  id: number;
  name: string;
  exam_board?: ExamBoardRow | ExamBoardRow[] | null;
};

type ChapterRow = {
  id: number;
  name: string;
  subject_id: number;
  parent_chapter_id: number | null;
  position: number;
  subject?: SubjectRow | SubjectRow[] | null;
};

type OrderQuestion = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  chapterId: number | null;
  chapterName: string | null;
  subjectName: string | null;
  position: number | null;
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
};

type Feedback = { type: "success" | "error"; message: string };

type QuestionOrderManagementProps = {
  questionBank: QuestionBank;
  chapters: ChapterRow[];
  loadError: string | null;
};

type PendingOrderChange = {
  id: number;
  fromIndex: number;
  toIndex: number;
  source: "drag" | "input";
  previousQuestions: OrderQuestion[];
  nextQuestions: OrderQuestion[];
};

const toSingle = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const buildChapterTree = (chapters: ChapterRow[]): TreeNode[] => {
  const childrenMap = new Map<number | null, ChapterRow[]>();

  for (const chapter of chapters) {
    const parentId = chapter.parent_chapter_id ?? null;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)?.push(chapter);
  }

  const sortChapters = (items: ChapterRow[]) =>
    items.slice().sort((a, b) => {
      const posA = a.position ?? 0;
      const posB = b.position ?? 0;
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name, "zh-CN");
    });

  const buildNode = (chapter: ChapterRow): TreeNode => {
    const children = sortChapters(childrenMap.get(chapter.id) ?? []);
    const childNodes = children.map(buildNode);

    return {
      id: chapter.id,
      label: chapter.name,
      value: chapter.id,
      ...(childNodes.length > 0 ? { children: childNodes } : {}),
    };
  };

  const roots = sortChapters(childrenMap.get(null) ?? []);
  return roots.map(buildNode);
};

const buildQuestionCardData = (question: OrderQuestion) => ({
  id: question.id,
  marks: question.marks,
  difficulty: question.difficulty,
  calculator: question.calculator,
  createdAt: question.createdAt,
  chapterId: question.chapterId,
  chapterName: question.chapterName,
  subjectName: question.subjectName,
  images: question.images.slice().sort((a, b) => a.position - b.position),
  answerImages: question.answerImages
    .slice()
    .sort((a, b) => a.position - b.position),
});

function SortableQuestionOrderItem({
  question,
  index,
  total,
  positionValue,
  onPositionChange,
  onPositionCommit,
  disabled,
}: {
  question: OrderQuestion;
  index: number;
  total: number;
  positionValue: string;
  onPositionChange: (id: number, value: string) => void;
  onPositionCommit: (id: number) => void;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const questionCardData = buildQuestionCardData(question);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          disabled={disabled}
          className={`mt-2 text-slate-400 ${
            disabled
              ? "cursor-not-allowed text-slate-300"
              : "cursor-grab hover:text-slate-600 active:cursor-grabbing"
          }`}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-5" />
        </button>
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-slate-700">
            <span>Order #{index + 1}</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">Set position</Label>
              <Input
                type="number"
                min={1}
                max={total}
                value={positionValue}
                onChange={(event) =>
                  onPositionChange(question.id, event.target.value)
                }
                onBlur={() => onPositionCommit(question.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onPositionCommit(question.id);
                  }
                }}
                disabled={disabled}
                className="h-9 w-20 text-center"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <QuestionCard question={questionCardData} disableInteractions />
          </div>
        </div>
      </div>
    </li>
  );
}

function StaticQuestionOrderItem({
  question,
  index,
  total,
  positionValue,
}: {
  question: OrderQuestion;
  index: number;
  total: number;
  positionValue: string;
}) {
  const questionCardData = buildQuestionCardData(question);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-2 text-slate-300">
          <GripVertical className="size-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-slate-700">
            <span>Order #{index + 1}</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">Set position</Label>
              <Input
                type="number"
                min={1}
                max={total}
                value={positionValue}
                disabled
                className="h-9 w-20 text-center"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <QuestionCard question={questionCardData} disableInteractions />
          </div>
        </div>
      </div>
    </li>
  );
}

export function QuestionOrderManagement({
  questionBank,
  chapters,
  loadError,
}: QuestionOrderManagementProps) {
  const router = useRouter();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    null,
  );
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null,
  );
  const [questions, setQuestions] = useState<OrderQuestion[]>([]);
  const [positionInputs, setPositionInputs] = useState<Record<number, string>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [pendingOrderChange, setPendingOrderChange] =
    useState<PendingOrderChange | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(
    loadError ? { type: "error", message: loadError } : null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const nextInputs: Record<number, string> = {};
    questions.forEach((question, index) => {
      nextInputs[question.id] = String(index + 1);
    });
    setPositionInputs(nextInputs);
  }, [questions]);

  useEffect(() => {
    if (selectedSubjectId == null) return;
    const stillExists = chapters.some(
      (chapter) => chapter.subject_id === selectedSubjectId,
    );
    if (!stillExists) {
      setSelectedSubjectId(null);
      setSelectedChapterId(null);
      setQuestions([]);
      setPositionInputs({});
      setPendingOrderChange(null);
    }
  }, [chapters, selectedSubjectId]);

  useEffect(() => {
    if (selectedChapterId == null) {
      return;
    }

    let cancelled = false;
    const loadQuestions = async () => {
      setIsLoading(true);
      setFeedback(null);
      try {
        const response = await fetch(
          `/api/console/chapter-question-orders?chapterId=${selectedChapterId}`,
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to load question order.");
        }
        const data = (await response.json()) as { questions: OrderQuestion[] };
        if (!cancelled) {
          setQuestions(data.questions ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load question order.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [selectedChapterId]);

  useEffect(() => {
    if (!feedback || feedback.type !== "success") return;
    const timeout = window.setTimeout(() => setFeedback(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const subjectTreeData = useMemo(() => {
    const subjectMap = new Map<number, SubjectRow>();

    for (const chapter of chapters) {
      const subject = toSingle(chapter.subject);
      if (!subject) continue;
      subjectMap.set(subject.id, subject);
    }

    const boardMap = new Map<
      number,
      { name: string; subjects: SubjectRow[] }
    >();
    const unassignedSubjects: SubjectRow[] = [];

    for (const subject of subjectMap.values()) {
      const examBoard = toSingle(subject.exam_board);
      if (!examBoard) {
        unassignedSubjects.push(subject);
        continue;
      }

      if (!boardMap.has(examBoard.id)) {
        boardMap.set(examBoard.id, { name: examBoard.name, subjects: [] });
      }
      boardMap.get(examBoard.id)?.subjects.push(subject);
    }

    const treeNodes: TreeNode[] = Array.from(boardMap.entries())
      .map(([boardId, { name, subjects }]) => ({
        id: `board-${boardId}`,
        label: name,
        children: subjects
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
          .map((subject) => ({
            id: `subject-${subject.id}`,
            label: subject.name,
            value: subject.id,
          })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));

    if (unassignedSubjects.length > 0) {
      treeNodes.push({
        id: "board-unassigned",
        label: "Unassigned",
        children: unassignedSubjects
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
          .map((subject) => ({
            id: `subject-${subject.id}`,
            label: subject.name,
            value: subject.id,
          })),
      });
    }

    return treeNodes;
  }, [chapters]);

  const subjectChapters = useMemo(() => {
    if (selectedSubjectId == null) return [];
    return chapters.filter(
      (chapter) => chapter.subject_id === selectedSubjectId,
    );
  }, [chapters, selectedSubjectId]);

  const chapterTreeData = useMemo(
    () => buildChapterTree(subjectChapters),
    [subjectChapters],
  );

  useEffect(() => {
    if (selectedChapterId == null) return;
    const stillExists = subjectChapters.some(
      (chapter) => chapter.id === selectedChapterId,
    );
    if (!stillExists) {
      setSelectedChapterId(null);
      setQuestions([]);
      setPositionInputs({});
      setPendingOrderChange(null);
    }
  }, [selectedChapterId, subjectChapters]);

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams();
      if (value !== "questionbank") {
        params.set("bank", value);
      }
      const query = params.toString();
      router.push(`/console/questions/order${query ? `?${query}` : ""}`);
    },
    [router],
  );

  const handleSaveOrder = useCallback(
    async (nextQuestions: OrderQuestion[]) => {
      if (!selectedChapterId) return;
      setIsSaving(true);
      setFeedback(null);
      try {
        const response = await fetch("/api/console/chapter-question-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: selectedChapterId,
            orderedQuestionIds: nextQuestions.map((question) => question.id),
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update order.");
        }

        setFeedback({ type: "success", message: "Order updated." });
      } catch (error) {
        setFeedback({
          type: "error",
          message:
            error instanceof Error ? error.message : "Failed to update order.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [selectedChapterId],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (isSaving || isLoading || pendingOrderChange) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    if (oldIndex === newIndex) return;

    const next = arrayMove(questions, oldIndex, newIndex);
    setQuestions(next);
    const movedId = questions[oldIndex]?.id ?? Number(active.id);
    setPendingOrderChange({
      id: movedId,
      fromIndex: oldIndex,
      toIndex: newIndex,
      source: "drag",
      previousQuestions: questions,
      nextQuestions: next,
    });
  };

  const handlePositionChange = (id: number, value: string) => {
    setPositionInputs((prev) => ({ ...prev, [id]: value }));
  };

  const handlePositionCommit = (id: number) => {
    if (isSaving || isLoading || pendingOrderChange) return;
    const total = questions.length;
    const rawValue = positionInputs[id];
    const parsed = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isFinite(parsed) || total === 0) {
      setPositionInputs((prev) => ({
        ...prev,
        [id]: String(questions.findIndex((q) => q.id === id) + 1),
      }));
      return;
    }

    const clampedPosition = Math.min(total, Math.max(1, parsed));
    const nextIndex = clampedPosition - 1;
    const currentIndex = questions.findIndex((q) => q.id === id);
    if (currentIndex === -1) return;
    if (currentIndex === nextIndex) {
      setPositionInputs((prev) => ({
        ...prev,
        [id]: String(currentIndex + 1),
      }));
      return;
    }

    setPositionInputs((prev) => ({
      ...prev,
      [id]: String(clampedPosition),
    }));
    const next = arrayMove(questions, currentIndex, nextIndex);
    setQuestions(next);
    setPendingOrderChange({
      id,
      fromIndex: currentIndex,
      toIndex: nextIndex,
      source: "input",
      previousQuestions: questions,
      nextQuestions: next,
    });
  };

  const pendingOrderDetails = useMemo(() => {
    if (!pendingOrderChange) return null;
    return {
      id: pendingOrderChange.id,
      fromPosition: pendingOrderChange.fromIndex + 1,
      toPosition: pendingOrderChange.toIndex + 1,
      source: pendingOrderChange.source,
    };
  }, [pendingOrderChange]);

  const handleCancelOrderChange = useCallback(() => {
    if (!pendingOrderChange) return;
    setQuestions(pendingOrderChange.previousQuestions);
    setPendingOrderChange(null);
  }, [pendingOrderChange]);

  const handleConfirmOrderChange = useCallback(() => {
    if (!pendingOrderChange) return;
    setPendingOrderChange(null);
    void handleSaveOrder(pendingOrderChange.nextQuestions);
  }, [pendingOrderChange, handleSaveOrder]);

  const currentBankTab =
    questionBank === QUESTION_BANK.CHECKPOINT ? "checkpoint" : "questionbank";
  const isConfirmingOrder = pendingOrderChange != null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {feedback ? (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center p-4">
          <div
            className={`pointer-events-auto rounded-lg px-6 py-3 text-sm font-medium shadow-lg ${feedback.type === "success" ? "border border-green-200 bg-green-50 text-green-800" : "border border-red-200 bg-red-50 text-red-800"}`}
          >
            {feedback.message}
          </div>
        </div>
      ) : null}

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Question Order Management
          </h1>
          <p className="text-sm text-slate-500">
            Reorder questions within a chapter or subchapter.
          </p>
        </div>
      </header>

      <Tabs value={currentBankTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="questionbank">Questionbank</TabsTrigger>
          <TabsTrigger value="checkpoint">Checkpoint</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Select Chapter</CardTitle>
          <CardDescription>
            Choose an exam/subject, then pick the chapter or subchapter to
            manage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="order-subject">Exam / Subject</Label>
              <TreeSelect
                data={subjectTreeData}
                value={selectedSubjectId}
                onValueChange={(value) => {
                  setSelectedSubjectId(value);
                  setSelectedChapterId(null);
                  setQuestions([]);
                  setPositionInputs({});
                  setPendingOrderChange(null);
                }}
                placeholder="Select exam / subject..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-chapter">Chapter / Concept</Label>
              <TreeSelect
                data={chapterTreeData}
                value={selectedChapterId}
                onValueChange={(value) => {
                  setSelectedChapterId(value);
                  setQuestions([]);
                  setPositionInputs({});
                  setPendingOrderChange(null);
                }}
                placeholder={
                  selectedSubjectId == null
                    ? "Select exam / subject first..."
                    : "Select chapter / subchapter..."
                }
                disabled={selectedSubjectId == null}
                selectableParents
              />
            </div>
            <Button
              variant="outline"
              className="h-11"
              disabled={!selectedSubjectId && !selectedChapterId}
              onClick={() => {
                setSelectedSubjectId(null);
                setSelectedChapterId(null);
                setQuestions([]);
                setPositionInputs({});
                setPendingOrderChange(null);
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Question Order</CardTitle>
          <CardDescription>
            Drag to reorder or set the exact position for any question.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {!selectedChapterId ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Select a chapter to load its questions.
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading questions...
            </div>
          ) : questions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No questions found for this chapter.
            </div>
          ) : isClient ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={questions.map((question) => question.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-4">
                  {questions.map((question, index) => (
                    <SortableQuestionOrderItem
                      key={question.id}
                      question={question}
                      index={index}
                      total={questions.length}
                      positionValue={positionInputs[question.id] ?? ""}
                      onPositionChange={handlePositionChange}
                      onPositionCommit={handlePositionCommit}
                      disabled={isSaving || isConfirmingOrder}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <ul className="space-y-4">
              {questions.map((question, index) => (
                <StaticQuestionOrderItem
                  key={question.id}
                  question={question}
                  index={index}
                  total={questions.length}
                  positionValue={positionInputs[question.id] ?? ""}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isConfirmingOrder}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelOrderChange();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm order change</DialogTitle>
            <DialogDescription>
              {pendingOrderDetails
                ? `Move question #${pendingOrderDetails.id} from position ${pendingOrderDetails.fromPosition} to ${pendingOrderDetails.toPosition}?`
                : "The selected question is no longer available."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelOrderChange}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOrderChange}
              disabled={!pendingOrderDetails}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
