import { createClient } from "@/lib/supabase/server";
import {
  firstOrNull,
  type SubjectExamTagWithValues,
  type SubjectWithBoard,
} from "@/lib/supabase/relations";

import { ExamPaperTagManagement } from "./tag-management-client";

export default async function ExamPaperTagsPage() {
  const supabase = await createClient();

  const [
    { data: subjects, error: subjectsError },
    { data: tags, error: tagsError },
  ] = await Promise.all([
    supabase
      .from("subjects")
      .select(
        "id, name, created_at, exam_board_id, exam_board:exam_boards(id, name, question_bank)",
      )
      .order("name", { ascending: true })
      .returns<SubjectWithBoard[]>(),
    supabase
      .from("subject_exam_tags")
      .select(
        "id, subject_id, name, required, position, created_at, values:subject_exam_tag_values(id, value, position, created_at)",
      )
      .order("subject_id", { ascending: true })
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .returns<SubjectExamTagWithValues[]>(),
  ]);

  const normalizedSubjects = (subjects ?? []).map((subject) => ({
    ...subject,
    exam_board: firstOrNull(subject.exam_board),
  }));

  const filteredSubjects = normalizedSubjects.filter(
    (subject) => subject.exam_board?.question_bank === 1,
  );
  const allowedSubjectIds = new Set(
    filteredSubjects.map((subject) => subject.id),
  );
  const filteredTags = (tags ?? []).filter((tag) =>
    allowedSubjectIds.has(tag.subject_id),
  );

  const loadError =
    subjectsError || tagsError
      ? "Failed to load subjects or tags. Please try again later."
      : null;

  return (
    <ExamPaperTagManagement
      initialSubjects={filteredSubjects}
      initialTags={filteredTags}
      loadError={loadError}
    />
  );
}
