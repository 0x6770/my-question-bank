"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { QuestionBrowser } from "@/components/question-browser";
import {
  type SelectedQuestion,
  SelectedQuestionsPanel,
} from "@/components/selected-questions-panel";
import { QUESTION_BANK } from "@/lib/question-bank";

type QuestionBrowserWithBuilderProps = {
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
  questionBank: string;
};

export function QuestionBrowserWithBuilder({
  examBoards,
  subjects,
  chapters,
  tags,
  questionBank,
}: QuestionBrowserWithBuilderProps) {
  const router = useRouter();
  const [selectedQuestions, setSelectedQuestions] = useState<
    SelectedQuestion[]
  >([]);
  const [paperTitle, setPaperTitle] = useState("Custom Worksheet");
  const [showAnswers, setShowAnswers] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Create a Set of selected question IDs for O(1) lookup
  const selectedQuestionIds = useMemo(
    () => new Set(selectedQuestions.map((q) => q.id)),
    [selectedQuestions],
  );

  // Map question bank param to database value
  const questionBankDbValue = useMemo(() => {
    if (questionBank === "checkpoint") {
      return QUESTION_BANK.CHECKPOINT;
    }
    if (questionBank === "questionbank") {
      return QUESTION_BANK.QUESTIONBANK;
    }
    if (questionBank === "exam-paper") {
      return QUESTION_BANK.EXAM_PAPER;
    }
    return questionBank;
  }, [questionBank]);

  const handleAddQuestion = (question: SelectedQuestion) => {
    // Prevent duplicates
    if (selectedQuestionIds.has(question.id)) {
      return;
    }

    setSelectedQuestions((prev) => [...prev, question]);
  };

  const handleRemoveQuestion = (id: number) => {
    setSelectedQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleReorder = (startIndex: number, endIndex: number) => {
    setSelectedQuestions((prev) => arrayMove(prev, startIndex, endIndex));
  };

  const handleClearAll = () => {
    setSelectedQuestions([]);
  };

  const handleTitleChange = (title: string) => {
    setPaperTitle(title);
  };

  const handleShowAnswersChange = (show: boolean) => {
    setShowAnswers(show);
  };

  const handleGenerate = async () => {
    if (selectedQuestions.length === 0) {
      setGenerationError("Please select at least one question");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/papers/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: paperTitle,
          question_bank: questionBankDbValue,
          show_answers: showAnswers,
          question_ids: selectedQuestions.map((q) => q.id),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          // Quota exceeded
          const resetDate = data.reset_date
            ? new Date(data.reset_date).toLocaleDateString()
            : "soon";
          setGenerationError(
            `Quota exceeded. You can generate more papers after ${resetDate}.`,
          );
        } else {
          setGenerationError(data.error || "Failed to generate paper");
        }
        return;
      }

      // Success - redirect to the paper view
      router.push(`/my-papers/${data.paper_id}`);
    } catch (error) {
      console.error("Failed to generate paper:", error);
      setGenerationError("Failed to generate paper. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const hasSelectedQuestions = selectedQuestions.length > 0;

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {generationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {generationError}
        </div>
      )}

      {/* Split Layout: Question Browser + Selected Questions Panel */}
      <div
        className={
          hasSelectedQuestions
            ? "grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6"
            : ""
        }
      >
        {/* Question Browser */}
        <div>
          <QuestionBrowser
            examBoards={examBoards}
            subjects={subjects}
            chapters={chapters}
            tags={tags}
            questionBank={questionBank}
            paperBuilderMode={true}
            selectedQuestionIds={selectedQuestionIds}
            onAddToPaper={handleAddQuestion}
          />
        </div>

        {/* Selected Questions Panel (only show when questions are selected) */}
        {hasSelectedQuestions && (
          <div className="lg:sticky lg:top-6 lg:self-start">
            <SelectedQuestionsPanel
              selectedQuestions={selectedQuestions}
              paperTitle={paperTitle}
              showAnswers={showAnswers}
              onRemove={handleRemoveQuestion}
              onReorder={handleReorder}
              onClearAll={handleClearAll}
              onTitleChange={handleTitleChange}
              onShowAnswersChange={handleShowAnswersChange}
              onGenerate={handleGenerate}
              questionBank={questionBank}
              isGenerating={isGenerating}
            />
          </div>
        )}
      </div>
    </div>
  );
}
