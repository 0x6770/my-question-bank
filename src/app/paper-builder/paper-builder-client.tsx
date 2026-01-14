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
import { GripVertical, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WatermarkedImage } from "@/components/watermarked-image";
import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import type { Tables } from "../../../database.types";

type SubjectRow = Tables<"subjects">;
type ExamBoardRow = Tables<"exam_boards">;
type ChapterRow = Pick<
  Tables<"chapters">,
  "id" | "name" | "subject_id" | "parent_chapter_id" | "position"
> & {
  subject?: Pick<SubjectRow, "id" | "name" | "exam_board_id"> | null;
};

type Question = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  chapterIds: number[];
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

type PaperQuestion = Question & {
  locked: boolean;
};

type PendingOrderChange = {
  id: number;
  fromIndex: number;
  toIndex: number;
  source: "drag" | "input";
  previousQuestions: PaperQuestion[];
  nextQuestions: PaperQuestion[];
};

function SortableQuestionRow({
  question,
  index,
  total,
  positionValue,
  onPositionChange,
  onPositionCommit,
  onRemove,
  disabled,
}: {
  question: PaperQuestion;
  index: number;
  total: number;
  positionValue: string;
  onPositionChange: (id: number, value: string) => void;
  onPositionCommit: (id: number) => void;
  onRemove: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors bg-white"
    >
      <div className="flex justify-between items-start mb-2 gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            disabled={disabled}
            className={`mt-1 text-gray-400 ${
              disabled
                ? "cursor-not-allowed text-gray-300"
                : "hover:text-gray-600 cursor-grab active:cursor-grabbing"
            }`}
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">
              Question {index + 1}
              {question.locked ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Locked
                </span>
              ) : null}
            </h3>
            <div className="flex gap-4 text-sm text-gray-600 mt-1 whitespace-nowrap">
              <span>ID: {question.id}</span>
              <span>Marks: {question.marks}</span>
              <span>Difficulty: {question.difficulty}</span>
              <span>
                {question.calculator ? "Calculator" : "No Calculator"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-2">
          <div className="flex items-center gap-2">
            <Label
              className="text-xs text-slate-500 whitespace-nowrap"
              htmlFor={`question-position-${question.id}`}
            >
              Set position
            </Label>
            <Input
              id={`question-position-${question.id}`}
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
              className="h-9 w-20 text-center"
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className={`text-red-600 ${
              disabled
                ? "cursor-not-allowed text-red-300"
                : "hover:text-red-800"
            }`}
            title="Remove question"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Question Images Preview */}
      {question.images.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">
            {question.images.length} image(s)
          </p>
          {question.images[0]?.signedUrl && (
            <WatermarkedImage
              src={question.images[0].signedUrl}
              alt="Question preview"
              className="max-w-full h-auto rounded border border-gray-200"
              watermarkSrc="/logo.jpg"
            />
          )}
        </div>
      )}
    </div>
  );
}

type PaperBuilderClientProps = {
  examBoards: Pick<ExamBoardRow, "id" | "name" | "question_bank">[];
  subjects: Pick<SubjectRow, "id" | "name" | "exam_board_id">[];
  chapters: ChapterRow[];
};

export function PaperBuilderClient({
  examBoards,
  subjects,
  chapters,
}: PaperBuilderClientProps) {
  const maxQuestionCount = 30;
  const router = useRouter();

  // Question Bank selection
  const [selectedQuestionBank, setSelectedQuestionBank] =
    useState<QuestionBank>(QUESTION_BANK.QUESTIONBANK);

  // Form state
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    null,
  );
  const [selectedExamBoardId, setSelectedExamBoardId] = useState<number | null>(
    null,
  );
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(
    null,
  );
  const [selectedSubChapterId, setSelectedSubChapterId] = useState<
    number | null
  >(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "incompleted" | "bookmarked"
  >("all");
  const [questionCountInput, setQuestionCountInput] = useState("10");

  // Paper state
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [title, setTitle] = useState<string>("Worksheet");
  const [showAnswers, setShowAnswers] = useState<boolean>(false);
  const [positionInputs, setPositionInputs] = useState<Record<number, string>>(
    {},
  );
  const [pendingOrderChange, setPendingOrderChange] =
    useState<PendingOrderChange | null>(null);

  // Loading states
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [generatingPaper, setGeneratingPaper] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter exam boards by selected question bank
  const filteredExamBoards = useMemo(() => {
    return examBoards.filter(
      (board) => board.question_bank === selectedQuestionBank,
    );
  }, [examBoards, selectedQuestionBank]);

  // Filter subjects by selected question bank
  const filteredSubjects = useMemo(() => {
    return subjects.filter((subject) =>
      filteredExamBoards.some((board) => board.id === subject.exam_board_id),
    );
  }, [subjects, filteredExamBoards]);

  const examBoardSubjects = useMemo(() => {
    if (!selectedExamBoardId) return [];
    return filteredSubjects.filter(
      (subject) => subject.exam_board_id === selectedExamBoardId,
    );
  }, [filteredSubjects, selectedExamBoardId]);

  const examBoardSubjectIds = useMemo(() => {
    return examBoardSubjects.map((subject) => subject.id);
  }, [examBoardSubjects]);

  // Filter chapters by selected question bank
  const filteredChapters = useMemo(() => {
    if (!selectedExamBoardId) return [];
    return chapters.filter((chapter) =>
      examBoardSubjectIds.includes(chapter.subject_id),
    );
  }, [chapters, examBoardSubjectIds, selectedExamBoardId]);

  const subjectChapters = useMemo(() => {
    if (!selectedSubjectId) return [];
    return filteredChapters.filter((ch) => ch.subject_id === selectedSubjectId);
  }, [selectedSubjectId, filteredChapters]);

  const rootChapters = useMemo(() => {
    return subjectChapters.filter(
      (chapter) => chapter.parent_chapter_id == null,
    );
  }, [subjectChapters]);

  const subChapters = useMemo(() => {
    if (!selectedChapterId) return [];
    return subjectChapters.filter(
      (chapter) => chapter.parent_chapter_id === selectedChapterId,
    );
  }, [selectedChapterId, subjectChapters]);

  const chapterDisabled = !selectedSubjectId || rootChapters.length === 0;
  const subChapterDisabled = !selectedChapterId || subChapters.length === 0;
  const chapterSelectValue = chapterDisabled
    ? ""
    : selectedChapterId != null
      ? selectedChapterId.toString()
      : "all";
  const subChapterSelectValue = subChapterDisabled
    ? ""
    : selectedSubChapterId != null
      ? selectedSubChapterId.toString()
      : "all";
  const chapterPlaceholder = !selectedSubjectId
    ? "Select a subject"
    : rootChapters.length === 0
      ? "NA"
      : "All chapters";
  const subChapterPlaceholder = !selectedChapterId
    ? "Select a chapter"
    : subChapters.length === 0
      ? "NA"
      : "All concepts";

  // Get bank param for API calls
  const bankParam = useMemo(() => {
    if (selectedQuestionBank === QUESTION_BANK.CHECKPOINT) {
      return "checkpoint";
    }
    if (selectedQuestionBank === QUESTION_BANK.EXAM_PAPER) {
      return "exam-paper";
    }
    return "questionbank";
  }, [selectedQuestionBank]);

  const handleQuestionBankChange = (bank: QuestionBank) => {
    setSelectedQuestionBank(bank);
    // Reset selections when changing question bank
    setSelectedExamBoardId(null);
    setSelectedSubjectId(null);
    setSelectedChapterId(null);
    setSelectedSubChapterId(null);
    setQuestions([]);
  };

  const { lockedCount, draftCount, lockedQuestionIds, draftQuestionIds } =
    useMemo(() => {
      const lockedIds: number[] = [];
      const draftIds: number[] = [];
      for (const question of questions) {
        if (question.locked) {
          lockedIds.push(question.id);
        } else {
          draftIds.push(question.id);
        }
      }
      return {
        lockedCount: lockedIds.length,
        draftCount: draftIds.length,
        lockedQuestionIds: lockedIds,
        draftQuestionIds: draftIds,
      };
    }, [questions]);

  const remainingSlots = Math.max(0, maxQuestionCount - questions.length);
  const maxSelectableCount = Math.max(
    1,
    Math.min(maxQuestionCount, remainingSlots),
  );
  const canSelectQuestions =
    selectedExamBoardId != null && selectedSubjectId != null;
  const generateButtonLabel =
    questions.length > 0 ? "Generate Next Batch" : "Generate Random Questions";

  useEffect(() => {
    setQuestionCountInput((prev) => {
      if (prev.trim() === "") return prev;
      const parsed = Number.parseInt(prev, 10);
      if (!Number.isFinite(parsed)) return prev;
      if (parsed > maxSelectableCount) return String(maxSelectableCount);
      if (parsed < 1) return "1";
      return prev;
    });
  }, [maxSelectableCount]);

  useEffect(() => {
    const nextInputs: Record<number, string> = {};
    questions.forEach((question, index) => {
      nextInputs[question.id] = String(index + 1);
    });
    setPositionInputs(nextInputs);
  }, [questions]);

  const fetchRandomQuestions = async ({
    count,
    excludeIds,
  }: {
    count: number;
    excludeIds: number[];
  }) => {
    const params = new URLSearchParams({
      bank: bankParam,
      subjectId: selectedSubjectId?.toString() ?? "",
      count: count.toString(),
    });
    if (excludeIds.length > 0) {
      params.set("excludeIds", excludeIds.join(","));
    }

    const resolvedChapterId = selectedSubChapterId ?? selectedChapterId;
    if (resolvedChapterId) {
      params.append("chapterId", resolvedChapterId.toString());
    }

    if (selectedDifficulty !== null) {
      params.append("difficulty", selectedDifficulty.toString());
    }

    if (statusFilter !== "all") {
      params.append("status", statusFilter);
    }

    const response = await fetch(`/api/papers/random-questions?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate questions");
    }

    const incoming = (data.questions ?? []) as Question[];
    const requestedCount =
      typeof data.requestedCount === "number" ? data.requestedCount : count;
    const availableCount =
      typeof data.availableCount === "number"
        ? data.availableCount
        : incoming.length;
    const returnedCount =
      typeof data.returnedCount === "number"
        ? data.returnedCount
        : incoming.length;

    return {
      incoming,
      requestedCount,
      availableCount,
      returnedCount,
    };
  };

  const handleGenerateQuestions = async () => {
    if (remainingSlots <= 0) {
      setError("Maximum 30 questions per worksheet.");
      return;
    }
    const parsedCount = Number.parseInt(questionCountInput, 10);
    const safeCount = Number.isFinite(parsedCount)
      ? Math.min(Math.max(parsedCount, 1), maxSelectableCount)
      : 1;
    if (!selectedExamBoardId) {
      setError("Please select an exam board");
      return;
    }
    if (!selectedSubjectId) {
      setError("Please select a subject");
      return;
    }

    setError(null);
    setNotice(null);
    setLoadingQuestions(true);

    try {
      const requestCount = Math.min(safeCount, remainingSlots);
      const { incoming, requestedCount, availableCount, returnedCount } =
        await fetchRandomQuestions({
          count: requestCount,
          excludeIds: lockedQuestionIds,
        });

      setQuestions((prev) => {
        const next = [
          ...prev,
          ...incoming.map((question) => ({ ...question, locked: false })),
        ];
        return next.slice(0, maxQuestionCount);
      });

      if (availableCount < requestedCount) {
        setNotice(
          `Only ${availableCount} question${availableCount === 1 ? "" : "s"} available for the current filters. Added ${returnedCount}.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleRerandomQuestions = async () => {
    if (draftCount <= 0) {
      return;
    }
    if (!selectedExamBoardId) {
      setError("Please select an exam board");
      return;
    }
    if (!selectedSubjectId) {
      setError("Please select a subject");
      return;
    }

    setError(null);
    setNotice(null);
    setLoadingQuestions(true);

    try {
      const excludeIds = Array.from(
        new Set([...lockedQuestionIds, ...draftQuestionIds]),
      );
      const { incoming, requestedCount, availableCount, returnedCount } =
        await fetchRandomQuestions({
          count: draftCount,
          excludeIds,
        });
      const replacements = incoming.map((question) => ({
        ...question,
        locked: false,
      }));

      setQuestions((prev) => {
        let replacementIndex = 0;
        return prev.map((question) => {
          if (question.locked) {
            return question;
          }
          const replacement = replacements[replacementIndex];
          if (replacement) {
            replacementIndex += 1;
            return replacement;
          }
          return question;
        });
      });

      if (availableCount < requestedCount) {
        setNotice(
          `Only ${availableCount} question${availableCount === 1 ? "" : "s"} available for the current filters. Refreshed ${returnedCount}.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleLockCurrentBatch = () => {
    if (draftCount <= 0) return;
    setQuestions((prev) =>
      prev.map((question) =>
        question.locked ? question : { ...question, locked: true },
      ),
    );
  };

  const handleRemoveQuestion = (questionId: number) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (pendingOrderChange) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = arrayMove(questions, oldIndex, newIndex);
    setQuestions(next);
    setPendingOrderChange({
      id: questions[oldIndex]?.id ?? Number(active.id),
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
    if (pendingOrderChange) return;
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

  const handleCancelOrderChange = () => {
    if (!pendingOrderChange) return;
    setQuestions(pendingOrderChange.previousQuestions);
    setPendingOrderChange(null);
  };

  const handleConfirmOrderChange = () => {
    if (!pendingOrderChange) return;
    setPendingOrderChange(null);
  };

  const handleGeneratePaper = async () => {
    if (questions.length === 0) {
      setError("Please generate some questions first");
      return;
    }

    setError(null);
    setGeneratingPaper(true);

    try {
      const response = await fetch("/api/papers/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          question_bank: selectedQuestionBank,
          show_answers: showAnswers,
          question_ids: questions.map((q) => q.id),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            data.message || "You have exceeded your paper generation quota",
          );
        }
        throw new Error(data.error || "Failed to generate paper");
      }

      // Redirect to paper view page
      router.push(`/my-papers/${data.paper_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setGeneratingPaper(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto p-6 max-w-6xl">
        <h1 className="text-3xl font-bold mb-6">Worksheet Builder</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded mb-6">
            {notice}
          </div>
        )}

        {/* Question Bank Selector */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Source</h2>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => handleQuestionBankChange(QUESTION_BANK.CHECKPOINT)}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                selectedQuestionBank === QUESTION_BANK.CHECKPOINT
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Checkpoint
            </button>
            <button
              type="button"
              onClick={() =>
                handleQuestionBankChange(QUESTION_BANK.QUESTIONBANK)
              }
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                selectedQuestionBank === QUESTION_BANK.QUESTIONBANK
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Questionbank
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Left Column: Question Selection */}
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Question Selection</h2>

              <div className="space-y-4">
                {/* Exam Board Selection */}
                <div>
                  <label
                    htmlFor="exam-board"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Exam Board *
                  </label>
                  <Select
                    value={selectedExamBoardId?.toString() ?? ""}
                    onValueChange={(value) => {
                      const nextExamBoardId = value
                        ? Number.parseInt(value, 10)
                        : null;
                      setSelectedExamBoardId(nextExamBoardId);
                      setSelectedSubjectId(null);
                      setSelectedChapterId(null);
                      setSelectedSubChapterId(null);
                    }}
                  >
                    <SelectTrigger id="exam-board">
                      <SelectValue placeholder="Select an exam board" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredExamBoards.map((board) => (
                        <SelectItem key={board.id} value={board.id.toString()}>
                          {board.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject Selection */}
                <div>
                  <label
                    htmlFor="subject"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Subject *
                  </label>
                  <Select
                    value={selectedSubjectId?.toString() ?? ""}
                    onValueChange={(value) => {
                      setSelectedSubjectId(value ? Number(value) : null);
                      setSelectedChapterId(null);
                      setSelectedSubChapterId(null);
                    }}
                    disabled={!selectedExamBoardId}
                  >
                    <SelectTrigger id="subject">
                      <SelectValue
                        placeholder={
                          selectedExamBoardId
                            ? "Select a subject"
                            : "Select an exam board first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {examBoardSubjects.map((subject) => (
                        <SelectItem
                          key={subject.id}
                          value={subject.id.toString()}
                        >
                          {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Chapter Selection */}
                <div>
                  <label
                    htmlFor="chapter"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Chapter
                  </label>
                  <Select
                    value={chapterSelectValue}
                    onValueChange={(value) => {
                      const nextChapterId =
                        value === "all" ? null : Number.parseInt(value, 10);
                      setSelectedChapterId(nextChapterId);
                      setSelectedSubChapterId(null);
                    }}
                    disabled={chapterDisabled}
                  >
                    <SelectTrigger id="chapter">
                      <SelectValue placeholder={chapterPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All chapters</SelectItem>
                      {rootChapters.map((chapter) => (
                        <SelectItem
                          key={chapter.id}
                          value={chapter.id.toString()}
                        >
                          {chapter.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subchapter Selection */}
                <div>
                  <label
                    htmlFor="subchapter"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Subchapter
                  </label>
                  <Select
                    value={subChapterSelectValue}
                    onValueChange={(value) => {
                      const nextSubChapterId =
                        value === "all" ? null : Number.parseInt(value, 10);
                      setSelectedSubChapterId(nextSubChapterId);
                    }}
                    disabled={subChapterDisabled}
                  >
                    <SelectTrigger id="subchapter">
                      <SelectValue placeholder={subChapterPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All concepts</SelectItem>
                      {subChapters.map((chapter) => (
                        <SelectItem
                          key={chapter.id}
                          value={chapter.id.toString()}
                        >
                          {chapter.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Difficulty Selection */}
                <div>
                  <label
                    htmlFor="difficulty"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Difficulty (Optional)
                  </label>
                  <Select
                    value={selectedDifficulty?.toString()}
                    onValueChange={(value) => {
                      setSelectedDifficulty(value ? Number(value) : null);
                    }}
                  >
                    <SelectTrigger id="difficulty">
                      <SelectValue placeholder="All difficulties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 (Easy)</SelectItem>
                      <SelectItem value="2">2 (Medium)</SelectItem>
                      <SelectItem value="3">3 (Hard)</SelectItem>
                      <SelectItem value="4">4 (Challenge)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Selection */}
                <div>
                  <label
                    htmlFor="status"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Status (Optional)
                  </label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(
                        value as
                          | "all"
                          | "completed"
                          | "incompleted"
                          | "bookmarked",
                      );
                    }}
                  >
                    <SelectTrigger id="status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="incompleted">Incomplete</SelectItem>
                      <SelectItem value="bookmarked">Bookmarked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Question Count */}
                <div>
                  <label
                    htmlFor="count"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Number of Questions
                  </label>
                  <input
                    id="count"
                    type="number"
                    min="1"
                    value={questionCountInput}
                    onChange={(e) => setQuestionCountInput(e.target.value)}
                    onBlur={(e) => {
                      const nextValue = e.target.value.trim();
                      if (nextValue === "") {
                        setQuestionCountInput("1");
                        return;
                      }
                      const parsed = Number.parseInt(nextValue, 10);
                      if (!Number.isFinite(parsed)) {
                        setQuestionCountInput("1");
                        return;
                      }
                      const clamped = Math.min(
                        Math.max(parsed, 1),
                        maxSelectableCount,
                      );
                      setQuestionCountInput(String(clamped));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    max={maxSelectableCount}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum: {maxQuestionCount}
                    {` · Remaining slots: ${remainingSlots}`}
                    {draftCount > 0 ? ` · Current batch: ${draftCount}` : ""}
                  </p>
                </div>

                {/* Generate Button */}
                <div className="space-y-3">
                  {draftCount > 0 ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleRerandomQuestions}
                        disabled={loadingQuestions || !canSelectQuestions}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {loadingQuestions
                          ? "Re-randomizing..."
                          : "Re-randomize Current Batch"}
                      </button>
                      <button
                        type="button"
                        onClick={handleLockCurrentBatch}
                        disabled={loadingQuestions}
                        className="w-full border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <Lock className="h-4 w-4" />
                          Lock current batch
                        </span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGenerateQuestions}
                      disabled={
                        loadingQuestions ||
                        !canSelectQuestions ||
                        remainingSlots <= 0
                      }
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {loadingQuestions ? "Generating..." : generateButtonLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Paper Settings */}
            {questions.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Paper Settings</h2>

                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label
                      htmlFor="title"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Paper Title
                    </label>
                    <input
                      id="title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Worksheet"
                    />
                  </div>

                  {/* Show Answers */}
                  <div className="flex items-center">
                    <input
                      id="showAnswers"
                      type="checkbox"
                      checked={showAnswers}
                      onChange={(e) => setShowAnswers(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label
                      htmlFor="showAnswers"
                      className="ml-2 block text-sm text-gray-700"
                    >
                      Include answers in PDF
                    </label>
                  </div>

                  {/* Generate Paper Button */}
                  <button
                    type="button"
                    onClick={handleGeneratePaper}
                    disabled={generatingPaper}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingPaper ? "Generating Paper..." : "Generate Paper"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Selected Questions */}
          <div>
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-1">
                Selected Questions ({questions.length})
              </h2>
              {questions.length > 0 ? (
                <p className="mb-4 text-xs text-slate-500">
                  Locked: {lockedCount} · Current batch: {draftCount}
                </p>
              ) : null}

              {questions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No questions selected. Generate random questions to get
                  started.
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={questions.map((question) => question.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {questions.map((question, index) => (
                        <SortableQuestionRow
                          key={question.id}
                          question={question}
                          index={index}
                          total={questions.length}
                          positionValue={positionInputs[question.id] ?? ""}
                          onPositionChange={handlePositionChange}
                          onPositionCommit={handlePositionCommit}
                          onRemove={() => handleRemoveQuestion(question.id)}
                          disabled={pendingOrderChange != null}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={pendingOrderChange != null}
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
            <button
              type="button"
              className="h-9 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={handleCancelOrderChange}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              onClick={handleConfirmOrderChange}
              disabled={!pendingOrderDetails}
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
