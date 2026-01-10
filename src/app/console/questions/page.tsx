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

  // Map URL parameter to question bank value, default to "questionbank"
  const bankParam = searchParams.bank;
  let selectedBank: QuestionBank = QUESTION_BANK.QUESTIONBANK;

  if (bankParam === "checkpoint") {
    selectedBank = QUESTION_BANK.CHECKPOINT;
  } else if (bankParam === "questionbank") {
    selectedBank = QUESTION_BANK.QUESTIONBANK;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  }

  // Get ALL exam boards (for both Questionbank and Checkpoint question banks)
  // This allows the form to select chapters from either question bank
  const { data: allExamBoards } = await supabase
    .from("exam_boards")
    .select("id, question_bank")
    .in("question_bank", [
      QUESTION_BANK.QUESTIONBANK,
      QUESTION_BANK.CHECKPOINT,
    ]);

  // Get exam boards for the CURRENT selected question bank (for filtering display list)
  const currentBankExamBoards = (allExamBoards ?? []).filter(
    (board) => board.question_bank === selectedBank,
  );
  const currentBankExamBoardIds = currentBankExamBoards.map(
    (board) => board.id,
  );

  // Get ALL subjects for all exam boards (for form selection)
  const allExamBoardIds = (allExamBoards ?? []).map((board) => board.id);
  const { data: allSubjects } = await supabase
    .from("subjects")
    .select("id, exam_board_id")
    .in("exam_board_id", allExamBoardIds.length > 0 ? allExamBoardIds : [-1]);

  // Get subjects for current question bank only (for filtering display list)
  const currentBankSubjects = (allSubjects ?? []).filter((subject) =>
    currentBankExamBoardIds.includes(subject.exam_board_id),
  );
  const subjectIds = currentBankSubjects.map((subject) => subject.id);

  // Get ALL chapters for all subjects (for form selection from both question banks)
  const allSubjectIds = (allSubjects ?? []).map((s) => s.id);

  const { data: allChapters, error: chaptersError } = await supabase
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
          name,
          exam_board_id
        )
      `,
    )
    .in("subject_id", allSubjectIds.length > 0 ? allSubjectIds : [-1])
    .order("subject_id", { ascending: true })
    .order("position", { ascending: true });

  // Filter chapters for current question bank (for display list)
  const chapters = (allChapters ?? []).filter((chapter) =>
    subjectIds.includes(chapter.subject_id),
  );

  // Filter chapter IDs that belong to the selected question bank
  const chapterIds = (chapters ?? []).map((chapter) => chapter.id);

  // Get questions that belong to the current question bank's chapters
  // Use inner join to only fetch questions linked to chapters in the selected question bank
  const { data: questionsData, error: questionsError } = await supabase
    .from("question_chapters")
    .select(
      `
        question_id,
        questions!inner (
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
        )
      `,
    )
    .in("chapter_id", chapterIds.length > 0 ? chapterIds : [-1])
    .order("questions(created_at)", { ascending: false })
    .limit(PAGE_SIZE + 1);

  // Extract unique questions from the joined result
  type QuestionRow = {
    id: number;
    difficulty: number;
    calculator: boolean;
    marks: number;
    created_at: string;
    question_images:
      | { id: number; storage_path: string; position: number }[]
      | null;
    answer_images:
      | { id: number; storage_path: string; position: number }[]
      | null;
  };

  const questionMap = new Map<number, QuestionRow>();
  for (const row of questionsData ?? []) {
    const q = (row as unknown as { questions: QuestionRow }).questions;
    if (q && !questionMap.has(q.id)) {
      questionMap.set(q.id, q);
    }
  }
  const questions = Array.from(questionMap.values());

  // Build chapter map for lookup
  const chapterMap = new Map((chapters ?? []).map((ch) => [ch.id, ch]));

  // Now fetch question_chapters ONLY for the questions we're displaying
  const questionIds = questions.map((q) => q.id);
  const { data: questionChapters, error: qcError } = await supabase
    .from("question_chapters")
    .select("question_id, chapter_id")
    .in("question_id", questionIds.length > 0 ? questionIds : [-1]);

  // Build ALL question_id -> chapter_ids mapping (for editing - includes all question banks)
  const allQuestionToChaptersMap = new Map<number, number[]>();
  for (const qc of questionChapters ?? []) {
    const existing = allQuestionToChaptersMap.get(qc.question_id) ?? [];
    existing.push(qc.chapter_id);
    allQuestionToChaptersMap.set(qc.question_id, existing);
  }

  // Build question_id -> chapter_ids mapping (filtered by current question bank - for display)
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

  // Check if there are more results
  const hasMoreInitial = questions.length > PAGE_SIZE;
  const limitedQuestions = hasMoreInitial
    ? questions.slice(0, PAGE_SIZE)
    : questions;

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

      // Get all chapter IDs for this question (from ALL question banks for editing)
      const chapterIds = allQuestionToChaptersMap.get(rawQuestion.id) ?? [];

      // Get filtered chapter IDs for display (only from current question bank)
      const displayChapterIds = questionToChaptersMap.get(rawQuestion.id) ?? [];

      // Select primary chapter (first one from current question bank) for display compatibility
      const primaryChapterId = displayChapterIds[0] ?? null;
      const primaryChapter = primaryChapterId
        ? (chapterMap.get(primaryChapterId) ?? null)
        : null;

      type RawChapterRowForDisplay = {
        subject?:
          | Pick<SubjectRow, "id" | "name">
          | Pick<SubjectRow, "id" | "name">[]
          | null;
      };

      const rawSubject = primaryChapter
        ? (primaryChapter as unknown as RawChapterRowForDisplay).subject
        : null;
      const subject = rawSubject
        ? Array.isArray(rawSubject)
          ? (rawSubject[0] ?? null)
          : rawSubject
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

  type RawChapterRow = {
    id: number;
    name: string;
    subject_id: number;
    parent_chapter_id: number | null;
    position: number;
    subject?:
      | Pick<SubjectRow, "id" | "name">
      | Pick<SubjectRow, "id" | "name">[]
      | null;
  };

  const chapterSummaries: ChapterRow[] = (chapters ?? []).map((chapter) => {
    const rawChapter = chapter as unknown as RawChapterRow;
    const rawSubject = rawChapter.subject;
    const subject = rawSubject
      ? Array.isArray(rawSubject)
        ? (rawSubject[0] ?? null)
        : rawSubject
      : null;

    return {
      id: rawChapter.id,
      name: rawChapter.name,
      subject_id: rawChapter.subject_id,
      parent_chapter_id: rawChapter.parent_chapter_id,
      position: rawChapter.position,
      subject,
    };
  });

  // Map ALL chapters for form selection (includes both question banks)
  type AllChapterRow = {
    id: number;
    name: string;
    subject_id: number;
    parent_chapter_id: number | null;
    position: number;
    subject: Pick<SubjectRow, "id" | "name"> | null;
    exam_board_id: number;
  };

  const allChapterSummaries = (allChapters ?? [])
    .map((chapter): AllChapterRow | null => {
      const rawChapter = chapter as unknown as RawChapterRow & {
        subject?:
          | (Pick<SubjectRow, "id" | "name"> & { exam_board_id: number })
          | (Pick<SubjectRow, "id" | "name"> & { exam_board_id: number })[]
          | null;
      };

      const rawSubject = rawChapter.subject;
      const subjectData = rawSubject
        ? Array.isArray(rawSubject)
          ? (rawSubject[0] ?? null)
          : rawSubject
        : null;

      if (
        !subjectData ||
        !("exam_board_id" in subjectData) ||
        typeof subjectData.exam_board_id !== "number"
      ) {
        return null;
      }

      // Extract exam_board_id before creating clean subject
      const examBoardId = subjectData.exam_board_id;

      // Return flat object with all fields at top level
      return {
        id: rawChapter.id,
        name: rawChapter.name,
        subject_id: rawChapter.subject_id,
        parent_chapter_id: rawChapter.parent_chapter_id,
        position: rawChapter.position,
        subject: {
          id: subjectData.id,
          name: subjectData.name,
        },
        exam_board_id: examBoardId,
      };
    })
    .filter((ch): ch is AllChapterRow => ch !== null);

  return (
    <QuestionManagement
      initialChapters={chapterSummaries}
      allChapters={allChapterSummaries}
      allExamBoards={allExamBoards ?? []}
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
