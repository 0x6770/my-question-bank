import { createClient } from "@/lib/supabase/server";

import { ExamPaperTagManagement } from "./tag-management-client";

export default async function ExamPaperTagsPage() {
  const supabase = await createClient();

  const [
    { data: subjects, error: subjectsError },
    { data: tags, error: tagsError },
  ] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, exam_board:exam_boards(name, question_bank)")
      .order("name", { ascending: true }),
    supabase
      .from("subject_exam_tags")
      .select(
        "id, subject_id, name, required, position, created_at, values:subject_exam_tag_values(id, value, position, created_at)",
      )
      .order("subject_id", { ascending: true })
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const filteredSubjects = (subjects ?? []).filter(
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
