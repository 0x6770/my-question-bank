import { ExamPaperBrowser } from "@/components/exam-paper-browser";
import {
  firstOrNull,
  type SubjectExamTagWithValues,
  type SubjectWithBoard,
} from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";

export default async function PapersPage() {
  const supabase = await createClient();

  const [{ data: examBoards }, { data: subjects }, { data: tags }] =
    await Promise.all([
      supabase
        .from("exam_boards")
        .select("id, name, question_bank")
        .order("name", { ascending: true }),
      supabase
        .from("subjects")
        .select(
          "id, name, exam_board_id, exam_board:exam_boards(id, name, question_bank)",
        )
        .order("name", { ascending: true })
        .returns<SubjectWithBoard[]>(),
      supabase
        .from("subject_exam_tags")
        .select(
          "id, subject_id, name, values:subject_exam_tag_values(id, value, tag_id)",
        )
        .in("name", ["paper", "season", "year", "time zone"])
        .order("subject_id", { ascending: true })
        .order("name", { ascending: true })
        .returns<SubjectExamTagWithValues[]>(),
    ]);

  const examBoardsForPapers = (examBoards ?? []).filter((board) => {
    const qb = board.question_bank ?? 1;
    return qb === 1;
  });

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));
  const allowedSubjectIds = new Set(
    normalizedSubjects
      .filter(
        (subject) =>
          (subject.exam_board?.question_bank ?? 1) === 1 &&
          examBoardsForPapers.some(
            (board) => board.id === subject.exam_board_id,
          ),
      )
      .map((subject) => subject.id),
  );
  const subjectsForPapers = normalizedSubjects.filter((subject) =>
    allowedSubjectIds.has(subject.id),
  );
  const tagsForPapers = (tags ?? []).filter((tag) =>
    allowedSubjectIds.has(tag.subject_id),
  );

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
