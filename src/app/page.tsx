import { BackToTopButton } from "@/components/back-to-top-button";
import { QuestionBrowser } from "@/components/question-browser";
import { firstOrNull, type SubjectWithBoard } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { data: examBoards } = await supabase
    .from("exam_boards")
    .select("id, name, question_bank")
    .eq("question_bank", 0)
    .order("name", { ascending: true });

  const { data: subjects } = await supabase
    .from("subjects")
    .select(
      "id, name, exam_board_id, exam_board:exam_boards(name, question_bank)",
    )
    .eq("exam_board.question_bank", 0)
    .order("name", { ascending: true })
    .returns<SubjectWithBoard[]>();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id, position")
    .order("position", { ascending: true });

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  const filteredSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === 0,
  );
  const allowedSubjectIds = new Set(
    filteredSubjects.map((subject) => subject.id),
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <QuestionBrowser
          examBoards={examBoards ?? []}
          subjects={filteredSubjects}
          chapters={
            chapters
              ?.filter((chapter) =>
                chapter.subject_id != null &&
                allowedSubjectIds.has(chapter.subject_id),
              )
              .map((chapter) => ({
                id: chapter.id,
                name: chapter.name,
                subjectId: chapter.subject_id ?? null,
                parentChapterId: chapter.parent_chapter_id ?? null,
              })) ?? []
          }
        />
      </div>
      <BackToTopButton />
    </main>
  );
}
