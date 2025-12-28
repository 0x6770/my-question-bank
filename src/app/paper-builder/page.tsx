import { QUESTION_BANK } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../database.types";
import { PaperBuilderClient } from "./paper-builder-client";

type SubjectRow = Tables<"subjects">;
type ChapterRow = Pick<
  Tables<"chapters">,
  "id" | "name" | "subject_id" | "parent_chapter_id" | "position"
> & {
  subject?: Pick<SubjectRow, "id" | "name" | "exam_board_id"> | null;
};

export default async function PaperBuilderPage() {
  const supabase = await createClient();

  // Get exam boards for paper builder (only past paper and topical questions)
  const { data: allExamBoards } = await supabase
    .from("exam_boards")
    .select("id, name, question_bank")
    .in("question_bank", [
      QUESTION_BANK.PAST_PAPER_QUESTIONS,
      QUESTION_BANK.TOPICAL_QUESTIONS,
    ]);

  // Get all subjects
  const examBoardIds = (allExamBoards ?? []).map((board) => board.id);
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, name, exam_board_id")
    .in("exam_board_id", examBoardIds.length > 0 ? examBoardIds : [-1])
    .order("name", { ascending: true });

  const subjectIds = (subjects ?? []).map((s) => s.id);

  // Get all chapters
  const { data: rawChapters } = await supabase
    .from("chapters")
    .select(
      `
        id,
        name,
        subject_id,
        parent_chapter_id,
        position
      `,
    )
    .in("subject_id", subjectIds.length > 0 ? subjectIds : [-1])
    .order("subject_id", { ascending: true })
    .order("position", { ascending: true });

  // Build subject map for lookups
  const subjectMap = new Map(
    (subjects ?? []).map((s) => [s.id, s]),
  );

  // Attach subject info to chapters
  const chapters: ChapterRow[] = (rawChapters ?? []).map((ch) => ({
    id: ch.id,
    name: ch.name,
    subject_id: ch.subject_id,
    parent_chapter_id: ch.parent_chapter_id,
    position: ch.position,
    subject: subjectMap.get(ch.subject_id) ?? null,
  }));

  return (
    <PaperBuilderClient
      examBoards={allExamBoards ?? []}
      subjects={subjects ?? []}
      chapters={chapters}
    />
  );
}
