import { BackToTopButton } from "@/components/back-to-top-button";
import { QuestionBrowser } from "@/components/question-browser";
import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { firstOrNull, type SubjectWithBoard } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    bank?: string;
  }>;
};

export default async function Home(props: PageProps) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  // Map URL parameter to question bank value, default to "topical questions"
  const bankParam = searchParams.bank;
  let selectedBank: QuestionBank = QUESTION_BANK.TOPICAL_QUESTIONS;

  if (bankParam === "past-paper") {
    selectedBank = QUESTION_BANK.PAST_PAPER_QUESTIONS;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  }

  const { data: examBoards } = await supabase
    .from("exam_boards")
    .select("id, name, question_bank")
    .eq("question_bank", selectedBank)
    .order("name", { ascending: true });

  const { data: subjects } = await supabase
    .from("subjects")
    .select(
      "id, name, exam_board_id, exam_board:exam_boards(name, question_bank)",
    )
    .eq("exam_board.question_bank", selectedBank)
    .order("name", { ascending: true })
    .overrideTypes<SubjectWithBoard[]>();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id, position")
    .order("position", { ascending: true });

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  const filteredSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === selectedBank,
  );
  const allowedSubjectIds = new Set(
    filteredSubjects.map((subject) => subject.id),
  );

  // Map question bank to URL parameter format for API
  const questionBankParam =
    selectedBank === QUESTION_BANK.PAST_PAPER_QUESTIONS
      ? "past-paper"
      : selectedBank === QUESTION_BANK.EXAM_PAPER
        ? "exam-paper"
        : "topical";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <QuestionBrowser
          examBoards={examBoards ?? []}
          subjects={filteredSubjects}
          chapters={
            chapters
              ?.filter(
                (chapter) =>
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
          questionBank={questionBankParam}
        />
      </div>
      <BackToTopButton />
    </main>
  );
}
