import { QUESTION_BANK } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";

import { SubjectManagement } from "../../subjects/subject-management-client";

export default async function ConsoleExamPaperSubjectsPage() {
  const supabase = await createClient();

  const [examBoardsResult, subjectsResult, chaptersResult] = await Promise.all([
    supabase
      .from("exam_boards")
      .select("id, name, question_bank, created_at")
      .eq("question_bank", QUESTION_BANK.EXAM_PAPER)
      .order("name", { ascending: true }),
    supabase
      .from("subjects")
      .select("id, name, exam_board_id, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("chapters")
      .select("id, name, subject_id, parent_chapter_id, position, created_at")
      .order("subject_id", { ascending: true })
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const loadError =
    examBoardsResult.error || subjectsResult.error || chaptersResult.error
      ? "Failed to load exam boards, subjects, or chapters. Please try again later."
      : null;

  const examBoards = (examBoardsResult.data ?? []).filter(
    (board) => board.question_bank === QUESTION_BANK.EXAM_PAPER,
  );
  const allowedSubjectIds = new Set(
    (subjectsResult.data ?? [])
      .filter((subject) =>
        examBoards.some((board) => board.id === subject.exam_board_id),
      )
      .map((subject) => subject.id),
  );
  const subjects = (subjectsResult.data ?? []).filter((subject) =>
    allowedSubjectIds.has(subject.id),
  );
  const chapters = (chaptersResult.data ?? []).filter((chapter) =>
    allowedSubjectIds.has(chapter.subject_id),
  );

  return (
    <SubjectManagement
      initialExamBoards={examBoards}
      initialSubjects={subjects}
      initialChapters={chapters}
      questionBank={QUESTION_BANK.EXAM_PAPER}
      loadError={loadError}
    />
  );
}
