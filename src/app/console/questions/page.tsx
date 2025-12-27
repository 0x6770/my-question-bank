import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../../database.types";
import { QuestionManagement } from "./question-management-client";

const PAGE_SIZE = 20;

type SubjectRow = Tables<"subjects">;
type ChapterRow = Pick<
  Tables<"chapters">,
  "id" | "name" | "subject_id" | "parent_chapter_id" | "position"
> & {
  subject?: Pick<SubjectRow, "id" | "name"> | null;
};

type QuestionSummary = {
  id: number;
  chapterIds: number[]; // Changed from single chapterId to array
  chapterName: string | null; // Primary chapter name for display
  subjectName: string | null; // Primary subject name for display
  createdAt: string;
  difficulty: number;
  calculator: boolean;
  marks: number;
  images: {
    id: number;
    storage_path: string;
    position: number;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
  }[];
};

type PageProps = {
  searchParams: Promise<{
    bank?: string;
  }>;
};

export default async function ConsoleQuestionsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  // Map URL parameter to question bank value, default to "past paper questions"
  const bankParam = searchParams.bank;
  let selectedBank: QuestionBank = QUESTION_BANK.PAST_PAPER_QUESTIONS;

  if (bankParam === "typical") {
    selectedBank = QUESTION_BANK.TYPICAL_QUESTIONS;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  }

  // First, get exam boards for the selected question bank
  const { data: examBoards } = await supabase
    .from("exam_boards")
    .select("id")
    .eq("question_bank", selectedBank);

  const examBoardIds = (examBoards ?? []).map((board) => board.id);

  // Get subjects belonging to these exam boards
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id")
    .in("exam_board_id", examBoardIds.length > 0 ? examBoardIds : [-1]);

  const subjectIds = (subjects ?? []).map((subject) => subject.id);

  const [
    { data: chapters, error: chaptersError },
    { data: questionChapters, error: qcError },
  ] = await Promise.all([
    supabase
      .from("chapters")
      .select(
        `
          id,
          name,
          subject_id,
          parent_chapter_id,
          position,
          subject:subject_id (
            id,
            name
          )
        `,
      )
      .in("subject_id", subjectIds.length > 0 ? subjectIds : [-1])
      .order("subject_id", { ascending: true })
      .order("position", { ascending: true }),
    supabase.from("question_chapters").select("question_id, chapter_id"),
  ]);

  // Filter chapter IDs that belong to the selected question bank
  const chapterIds = (chapters ?? []).map((chapter) => chapter.id);

  // Get questions that belong to these chapters
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      `
        id,
        difficulty,
        calculator,
        marks,
        created_at,
        question_images (
          id,
          storage_path,
          position
        ),
        answer_images (
          id,
          storage_path,
          position
        )
      `,
    )
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE);

  // Build chapter map for lookup
  const chapterMap = new Map((chapters ?? []).map((ch) => [ch.id, ch]));

  // Build question_id -> chapter_ids mapping (filtered by question bank)
  const questionToChaptersMap = new Map<number, number[]>();
  const chapterIdSet = new Set(chapterIds);
  for (const qc of questionChapters ?? []) {
    // Only include relationships where chapter belongs to selected question bank
    if (chapterIdSet.has(qc.chapter_id)) {
      const existing = questionToChaptersMap.get(qc.question_id) ?? [];
      existing.push(qc.chapter_id);
      questionToChaptersMap.set(qc.question_id, existing);
    }
  }

  // Filter questions to only include those linked to chapters in selected question bank
  const validQuestionIds = new Set(questionToChaptersMap.keys());
  const filteredQuestions = (questions ?? []).filter((q) =>
    validQuestionIds.has(q.id),
  );

  const hasMoreInitial = filteredQuestions.length > PAGE_SIZE;
  const limitedQuestions = hasMoreInitial
    ? filteredQuestions.slice(0, PAGE_SIZE)
    : filteredQuestions;

  const questionSummaries: QuestionSummary[] = limitedQuestions.map(
    (question) => {
      const rawQuestion = question as unknown as {
        id: number;
        created_at: string;
        difficulty: number;
        calculator: boolean;
        marks: number;
        question_images: QuestionSummary["images"] | null;
        answer_images: QuestionSummary["answerImages"] | null;
      };

      const images = (rawQuestion.question_images ?? [])
        .slice()
        .sort((a, b) => {
          return a.position - b.position;
        });

      const answerImages = (rawQuestion.answer_images ?? [])
        .slice()
        .sort((a, b) => {
          return a.position - b.position;
        });

      // Get all chapter IDs for this question
      const chapterIds = questionToChaptersMap.get(rawQuestion.id) ?? [];

      // Select primary chapter (first one) for display compatibility
      const primaryChapterId = chapterIds[0] ?? null;
      const primaryChapter = primaryChapterId
        ? (chapterMap.get(primaryChapterId) ?? null)
        : null;

      type RawChapterRow = Tables<"chapters"> & {
        subject?:
          | Pick<SubjectRow, "id" | "name">
          | Pick<SubjectRow, "id" | "name">[]
          | null;
      };

      const subject = primaryChapter
        ? Array.isArray((primaryChapter as unknown as RawChapterRow).subject)
          ? ((primaryChapter as unknown as RawChapterRow).subject?.[0] ?? null)
          : ((primaryChapter as unknown as RawChapterRow).subject ?? null)
        : null;

      return {
        id: rawQuestion.id,
        chapterIds, // Array of all chapter IDs
        chapterName: primaryChapter?.name ?? null,
        subjectName: subject?.name ?? null,
        createdAt: rawQuestion.created_at,
        difficulty: rawQuestion.difficulty,
        calculator: rawQuestion.calculator,
        marks: rawQuestion.marks,
        images,
        answerImages,
      };
    },
  );

  type RawChapterRow = Tables<"chapters"> & {
    subject?:
      | Pick<SubjectRow, "id" | "name">
      | Pick<SubjectRow, "id" | "name">[]
      | null;
  };

  const chapterSummaries: ChapterRow[] = (chapters ?? []).map((chapter) => {
    const rawChapter = chapter as RawChapterRow;
    const subject = Array.isArray(rawChapter.subject)
      ? (rawChapter.subject[0] ?? null)
      : (rawChapter.subject ?? null);

    return {
      id: rawChapter.id,
      name: rawChapter.name,
      subject_id: rawChapter.subject_id,
      parent_chapter_id: rawChapter.parent_chapter_id,
      position: rawChapter.position,
      subject,
    };
  });

  return (
    <QuestionManagement
      initialChapters={chapterSummaries}
      initialQuestions={questionSummaries}
      initialHasMore={hasMoreInitial}
      questionBank={selectedBank}
      loadError={
        chaptersError || questionsError || qcError
          ? "Failed to load question data. Please try again later."
          : null
      }
    />
  );
}
