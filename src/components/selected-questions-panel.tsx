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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type SelectedQuestion = {
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
};

type SelectedQuestionsPanelProps = {
  selectedQuestions: SelectedQuestion[];
  paperTitle: string;
  showAnswers: boolean;
  onRemove: (id: number) => void;
  onReorder: (startIndex: number, endIndex: number) => void;
  onClearAll: () => void;
  onTitleChange: (title: string) => void;
  onShowAnswersChange: (show: boolean) => void;
  onGenerate: () => Promise<void>;
  questionBank: string;
  isGenerating?: boolean;
};

function SortableQuestionItem({
  question,
  index,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  question: SelectedQuestion;
  index: number;
  onRemove: (id: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const firstImage = question.images.find((img) => img.signedUrl);
  const difficultyLabels = ["", "Easy", "Medium", "Hard", "Challenge"];

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <button
          type="button"
          className="mt-1 cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>

        {/* Question Preview */}
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="font-semibold text-slate-900">
                Question #{index + 1}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>{question.marks} marks</span>
                <span>•</span>
                <span>{difficultyLabels[question.difficulty]}</span>
                <span>•</span>
                <span>
                  {question.calculator ? "Calculator" : "No Calculator"}
                </span>
              </div>
            </div>

            {/* Remove Button */}
            <button
              type="button"
              onClick={() => onRemove(question.id)}
              className="text-slate-400 hover:text-red-600 transition-colors"
              title="Remove question"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Image Preview */}
          {firstImage?.signedUrl && (
            <div className="overflow-hidden rounded border border-slate-200">
              <Image
                src={firstImage.signedUrl}
                alt={`Question ${index + 1} preview`}
                width={300}
                height={200}
                className="w-full h-auto"
                unoptimized
              />
            </div>
          )}

          {/* Move Up/Down Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <ChevronUp className="size-3" />
              Move Up
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <ChevronDown className="size-3" />
              Move Down
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function SelectedQuestionsPanel({
  selectedQuestions,
  paperTitle,
  showAnswers,
  onRemove,
  onReorder,
  onClearAll,
  onTitleChange,
  onShowAnswersChange,
  onGenerate,
  questionBank,
  isGenerating = false,
}: SelectedQuestionsPanelProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = selectedQuestions.findIndex((q) => q.id === active.id);
    const newIndex = selectedQuestions.findIndex((q) => q.id === over.id);

    onReorder(oldIndex, newIndex);
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < selectedQuestions.length - 1) {
      onReorder(index, index + 1);
    }
  };

  const handleClearAll = () => {
    if (showClearConfirm) {
      onClearAll();
      setShowClearConfirm(false);
    } else {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
    }
  };

  const questionCount = selectedQuestions.length;
  const totalMarks = selectedQuestions.reduce((sum, q) => sum + q.marks, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Selected Questions ({questionCount})
          </h2>
          {questionCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className={`inline-flex items-center gap-1 rounded px-3 py-1 text-sm font-medium transition-colors ${
                showClearConfirm
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {showClearConfirm ? (
                <>
                  <Trash2 className="size-4" />
                  Confirm Clear?
                </>
              ) : (
                "Clear All"
              )}
            </button>
          )}
        </div>
        {questionCount > 0 && (
          <p className="mt-1 text-sm text-slate-600">
            Total marks: {totalMarks}
          </p>
        )}
      </div>

      {/* Empty State */}
      {questionCount === 0 && (
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 size-16 rounded-full bg-slate-100 flex items-center justify-center">
            <svg
              className="size-8 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              role="img"
              aria-label="Empty state icon"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No Questions Selected
          </h3>
          <p className="text-sm text-slate-600">
            Click the <span className="font-medium">"Generator"</span> button on
            any question card to add it to your custom paper.
          </p>
        </div>
      )}

      {/* Question List */}
      {questionCount > 0 && (
        <div className="max-h-[600px] overflow-y-auto p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={selectedQuestions.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-3">
                {selectedQuestions.map((question, index) => (
                  <SortableQuestionItem
                    key={question.id}
                    question={question}
                    index={index}
                    onRemove={onRemove}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    isFirst={index === 0}
                    isLast={index === questionCount - 1}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Paper Settings & Generate */}
      {questionCount > 0 && (
        <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4 rounded-b-2xl">
          <div className="space-y-2">
            <Label htmlFor="paper-title" className="text-sm font-medium">
              Paper Title
            </Label>
            <Input
              id="paper-title"
              type="text"
              value={paperTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Enter paper title"
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="show-answers"
              checked={showAnswers}
              onChange={(e) => onShowAnswersChange(e.target.checked)}
              className="size-4 rounded border-slate-300 text-slate-900"
            />
            <Label
              htmlFor="show-answers"
              className="text-sm font-medium cursor-pointer"
            >
              Include answers in paper
            </Label>
          </div>

          <Button
            onClick={onGenerate}
            disabled={isGenerating || questionCount === 0}
            className="w-full"
          >
            {isGenerating
              ? "Generating..."
              : `Generate Paper (${questionCount} questions)`}
          </Button>

          <p className="text-xs text-slate-500 text-center">
            Question bank:{" "}
            {questionBank === "topical"
              ? "Topical Questions"
              : "Past Paper Questions"}
          </p>
        </div>
      )}
    </div>
  );
}
