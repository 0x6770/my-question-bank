import { ExamPaperBrowser } from "@/components/exam-paper-browser";
import { QUESTION_BANK } from "@/lib/question-bank";
import {
  firstOrNull,
  type SubjectExamTagWithValues,
  type SubjectWithBoard,
} from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";

export default async function PapersPage() {
  const supabase = await createClient();

  // RLS filters subjects by user_subject_access; keep exam boards scoped to those subjects.
  const { data: subjects } = await supabase
    .from("subjects")
    .select(
      "id, name, exam_board_id, exam_board:exam_boards(id, name, question_bank)",
    )
    .eq("exam_board.question_bank", QUESTION_BANK.EXAM_PAPER)
    .order("name", { ascending: true })
    .returns<SubjectWithBoard[]>();

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));
  const subjectsForPapers = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === QUESTION_BANK.EXAM_PAPER,
  );

  const accessibleExamBoardIds = new Set(
    subjectsForPapers
      .map((subject) => subject.exam_board_id)
      .filter((id): id is number => id != null),
  );

  const allowedSubjectIds = new Set(
    subjectsForPapers.map((subject) => subject.id),
  );

  const [{ data: examBoards }, { data: tags }] = await Promise.all([
    supabase
      .from("exam_boards")
      .select("id, name, question_bank")
      .eq("question_bank", QUESTION_BANK.EXAM_PAPER)
      .in("id", Array.from(accessibleExamBoardIds))
      .order("name", { ascending: true }),
    supabase
      .from("subject_exam_tags")
      .select(
        "id, subject_id, name, values:subject_exam_tag_values(id, value, tag_id)",
      )
      .in("name", ["paper", "season", "year", "time zone"])
      .in("subject_id", Array.from(allowedSubjectIds))
      .order("subject_id", { ascending: true })
      .order("name", { ascending: true })
      .returns<SubjectExamTagWithValues[]>(),
  ]);

  const examBoardsForPapers = examBoards ?? [];
  const tagsForPapers = tags ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <ExamPaperBrowser
          examBoards={examBoardsForPapers}
          subjects={subjectsForPapers}
          initialTags={tagsForPapers}
        />
      </div>
    </main>
  );
}
