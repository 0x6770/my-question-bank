import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../../../database.types";
import { QuestionOrderManagement } from "./question-order-management-client";

type SubjectRow = Tables<"subjects"> & {
  exam_board?:
    | { id: number; name: string }[]
    | { id: number; name: string }
    | null;
};

type ChapterRow = Pick<
  Tables<"chapters">,
  "id" | "name" | "subject_id" | "parent_chapter_id" | "position"
> & {
  subject?:
    | Pick<SubjectRow, "id" | "name" | "exam_board">
    | Pick<SubjectRow, "id" | "name" | "exam_board">[]
    | null;
};

type PageProps = {
  searchParams: Promise<{
    bank?: string;
  }>;
};

export default async function ConsoleQuestionOrderPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const bankParam = searchParams.bank;
  let selectedBank: QuestionBank = QUESTION_BANK.QUESTIONBANK;

  if (bankParam === "checkpoint") {
    selectedBank = QUESTION_BANK.CHECKPOINT;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  } else if (bankParam === "questionbank") {
    selectedBank = QUESTION_BANK.QUESTIONBANK;
  }

  const { data: examBoards, error: examBoardsError } = await supabase
    .from("exam_boards")
    .select("id, name, question_bank")
    .eq("question_bank", selectedBank);

  const examBoardIds = (examBoards ?? []).map((board) => board.id);

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, name, exam_board_id, exam_board:exam_boards(id, name)")
    .in("exam_board_id", examBoardIds.length > 0 ? examBoardIds : [-1]);

  const subjectIds = (subjects ?? []).map((subject) => subject.id);

  const { data: chapters, error: chaptersError } = await supabase
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
          exam_board:exam_board_id (
            id,
            name
          )
        )
      `,
    )
    .in("subject_id", subjectIds.length > 0 ? subjectIds : [-1])
    .order("subject_id", { ascending: true })
    .order("position", { ascending: true });

  const loadError =
    examBoardsError?.message ??
    subjectsError?.message ??
    chaptersError?.message ??
    null;

  return (
    <QuestionOrderManagement
      questionBank={selectedBank}
      chapters={(chapters ?? []) as ChapterRow[]}
      loadError={loadError}
    />
  );
}
