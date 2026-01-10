import { BackToTopButton } from "@/components/back-to-top-button";
import { QuestionBrowserWithBuilder } from "@/components/question-browser-with-builder";
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

  // Map URL parameter to question bank value, default to "checkpoint"
  const bankParam = searchParams.bank;
  let selectedBank: QuestionBank = QUESTION_BANK.CHECKPOINT;

  if (bankParam === "questionbank") {
    selectedBank = QUESTION_BANK.QUESTIONBANK;
  } else if (bankParam === "checkpoint") {
    selectedBank = QUESTION_BANK.CHECKPOINT;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  }

  // First fetch subjects - RLS will automatically filter based on user_subject_access
  const { data: subjects } = await supabase
    .from("subjects")
    .select(
      "id, name, exam_board_id, exam_board:exam_boards(name, question_bank)",
    )
    .eq("exam_board.question_bank", selectedBank)
    .order("name", { ascending: true })
    .overrideTypes<SubjectWithBoard[]>();

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  const filteredSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === selectedBank,
  );

  // Extract exam board IDs from user's accessible subjects
  const accessibleExamBoardIds = new Set(
    filteredSubjects
      .map((subject) => subject.exam_board_id)
      .filter((id): id is number => id != null),
  );

  // Only fetch exam boards that the user has access to via their subjects
  const { data: examBoards } = await supabase
    .from("exam_boards")
    .select("id, name, question_bank")
    .eq("question_bank", selectedBank)
    .in("id", Array.from(accessibleExamBoardIds))
    .order("name", { ascending: true });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id, position")
    .order("position", { ascending: true });
  const allowedSubjectIds = new Set(
    filteredSubjects.map((subject) => subject.id),
  );

  // Fetch tags for all subjects in this question bank
  const { data: tags } = await supabase
    .from("subject_question_tags")
    .select(
      `
      id,
      subject_id,
      name,
      required,
      position,
      values:subject_question_tag_values(id, value, position)
    `,
    )
    .in("subject_id", Array.from(allowedSubjectIds))
    .order("subject_id", { ascending: true })
    .order("position", { ascending: true });

  // Map question bank to URL parameter format for API
  const questionBankParam =
    selectedBank === QUESTION_BANK.QUESTIONBANK
      ? "questionbank"
      : selectedBank === QUESTION_BANK.EXAM_PAPER
        ? "exam-paper"
        : "checkpoint";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <QuestionBrowserWithBuilder
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
          tags={tags ?? []}
          questionBank={questionBankParam}
        />
      </div>
      <BackToTopButton />
    </main>
  );
}
