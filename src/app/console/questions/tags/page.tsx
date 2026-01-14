import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { firstOrNull } from "@/lib/supabase/relations";
import { createClient } from "@/lib/supabase/server";
import { QuestionTagManagementClient } from "./tag-management-client";

type PageProps = {
  searchParams: Promise<{
    bank?: string;
  }>;
};

export default async function QuestionTagsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  // Map URL parameter to question bank value, default to "questionbank"
  const bankParam = searchParams.bank;
  let selectedBank: QuestionBank = QUESTION_BANK.QUESTIONBANK;

  if (bankParam === "checkpoint") {
    selectedBank = QUESTION_BANK.CHECKPOINT;
  }

  // Fetch only subjects from the selected question bank
  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select(
      "id, name, created_at, exam_board_id, exam_board:exam_boards!inner(id, name, question_bank, created_at)",
    )
    .eq("exam_board.question_bank", selectedBank)
    .order("name", { ascending: true });

  // Fetch all question tags with their values
  const { data: tags, error: tagsError } = await supabase
    .from("subject_question_tags")
    .select(`
      id,
      subject_id,
      name,
      required,
      position,
      created_at,
      values:subject_question_tag_values(id, value, position, created_at)
    `)
    .order("subject_id", { ascending: true })
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (subjectsError || tagsError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">
          Error loading tags: {subjectsError?.message || tagsError?.message}
        </p>
      </div>
    );
  }

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  return (
    <QuestionTagManagementClient
      initialSubjects={normalizedSubjects}
      initialTags={tags || []}
      loadError={null}
      questionBank={selectedBank}
    />
  );
}
