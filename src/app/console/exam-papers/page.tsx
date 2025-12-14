import { createClient } from "@/lib/supabase/server";

import { ExamPaperManagement } from "./exam-paper-management-client";

export default async function ConsoleExamPapersPage() {
  const supabase = await createClient();

  const [
    { data: subjects, error: subjectsError },
    { data: examPapers, error: papersError },
    { data: subjectTags, error: tagsError },
  ] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, exam_board:exam_boards(name, question_bank)")
      .order("name", { ascending: true }),
    supabase
      .from("exam_papers")
      .select(
        "id, subject_id, year, season, paper_code, paper_label, time_zone, question_paper_path, mark_scheme_path, created_at, updated_at, subject:subjects(name, exam_board:exam_boards(name)), tag_values:exam_paper_tag_values(tag_value_id, tag_value:subject_exam_tag_values(id, value, tag_id))",
      )
      .order("year", { ascending: false })
      .order("season", { ascending: false })
      .order("paper_code", { ascending: true }),
    supabase
      .from("subject_exam_tags")
      .select(
        "id, subject_id, name, required, position, values:subject_exam_tag_values(id, value, position, tag_id)",
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
  const filteredExamPapers = (examPapers ?? []).filter((paper) =>
    allowedSubjectIds.has(paper.subject_id),
  );
  const filteredSubjectTags = (subjectTags ?? []).filter((tag) =>
    allowedSubjectIds.has(tag.subject_id),
  );

  const loadError =
    subjectsError || papersError || tagsError
      ? "无法加载学科、试卷或标签数据，请稍后重试。"
      : null;

  return (
    <ExamPaperManagement
      initialSubjects={filteredSubjects}
      initialExamPapers={filteredExamPapers}
      initialSubjectTags={filteredSubjectTags}
      loadError={loadError}
    />
  );
}
