"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(
    null,
  );
  const [questionCount, setQuestionCount] = useState<number>(10);

  // Paper state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState<string>("Worksheet");
  const [showAnswers, setShowAnswers] = useState<boolean>(false);

  // Loading states
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [generatingPaper, setGeneratingPaper] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Filter chapters by selected subject
  const subjectChapters = useMemo(() => {
    if (!selectedSubjectId) return [];
    return filteredChapters.filter((ch) => ch.subject_id === selectedSubjectId);
  }, [selectedSubjectId, filteredChapters]);

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
    setQuestions([]);
  };

  const handleGenerateQuestions = async () => {
    if (!selectedExamBoardId) {
      setError("Please select an exam board");
      return;
    }
    if (!selectedSubjectId) {
      setError("Please select a subject");
      return;
    }

    setError(null);
    setLoadingQuestions(true);

    try {
      const params = new URLSearchParams({
        bank: bankParam,
        subjectId: selectedSubjectId.toString(),
        count: questionCount.toString(),
      });

      if (selectedChapterId) {
        params.append("chapterId", selectedChapterId.toString());
      }

      if (selectedDifficulty !== null) {
        params.append("difficulty", selectedDifficulty.toString());
      }

      const response = await fetch(`/api/papers/random-questions?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate questions");
      }

      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleRemoveQuestion = (questionId: number) => {
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return; // Already at the top
    setQuestions((prev) => {
      const newQuestions = [...prev];
      [newQuestions[index - 1], newQuestions[index]] = [
        newQuestions[index],
        newQuestions[index - 1],
      ];
      return newQuestions;
    });
  };

  const handleMoveDown = (index: number) => {
    setQuestions((prev) => {
      if (index === prev.length - 1) return prev; // Already at the bottom
      const newQuestions = [...prev];
      [newQuestions[index], newQuestions[index + 1]] = [
        newQuestions[index + 1],
        newQuestions[index],
      ];
      return newQuestions;
    });
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
        <h1 className="text-3xl font-bold mb-6">Paper Builder</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Question Bank Selector */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Question Bank</h2>
          <div className="flex gap-4">
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      setSelectedChapterId(null); // Reset chapter when subject changes
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
                    Chapter (Optional)
                  </label>
                  <Select
                    value={selectedChapterId?.toString()}
                    onValueChange={(value) => {
                      setSelectedChapterId(value ? Number(value) : null);
                    }}
                    disabled={!selectedSubjectId}
                  >
                    <SelectTrigger id="chapter">
                      <SelectValue placeholder="All chapters" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectChapters.map((chapter) => (
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
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3 (Medium)</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5 (Hard)</SelectItem>
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
                    max="30"
                    value={questionCount}
                    onChange={(e) =>
                      setQuestionCount(
                        Math.max(1, Math.min(30, Number(e.target.value))),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum: 30</p>
                </div>

                {/* Generate Button */}
                <button
                  type="button"
                  onClick={handleGenerateQuestions}
                  disabled={
                    loadingQuestions ||
                    !selectedExamBoardId ||
                    !selectedSubjectId
                  }
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingQuestions
                    ? "Generating..."
                    : "Generate Random Questions"}
                </button>
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
              <h2 className="text-xl font-semibold mb-4">
                Selected Questions ({questions.length})
              </h2>

              {questions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No questions selected. Generate random questions to get
                  started.
                </p>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <div
                      key={question.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            Question {index + 1}
                          </h3>
                          <div className="flex gap-4 text-sm text-gray-600 mt-1">
                            <span>ID: {question.id}</span>
                            <span>Marks: {question.marks}</span>
                            <span>Difficulty: {question.difficulty}</span>
                            <span>
                              {question.calculator
                                ? "Calculator"
                                : "No Calculator"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            className="text-gray-600 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === questions.length - 1}
                            className="text-gray-600 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(question.id)}
                            className="text-red-600 hover:text-red-800 ml-1"
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
                            <Image
                              src={question.images[0].signedUrl}
                              alt="Question preview"
                              width={400}
                              height={300}
                              className="max-w-full h-auto rounded border border-gray-200"
                              unoptimized
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
