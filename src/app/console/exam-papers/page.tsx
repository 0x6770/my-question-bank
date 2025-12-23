import type { ExamPaper as BrowserExamPaper } from "@/components/exam-paper-browser";
import { QUESTION_BANK } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";

import {
  ExamPaperManagement,
  type SubjectRow,
} from "./exam-paper-management-client";

export default async function ConsoleExamPapersPage() {
  const supabase = await createClient();

  const [
    { data: subjects, error: subjectsError },
    { data: examPapers, error: papersError },
    { data: subjectTags, error: tagsError },
  ] = await Promise.all([
    supabase
      .from("subjects")
      .select(
        "id, name, created_at, exam_board_id, exam_board:exam_boards(id, name, question_bank)",
      )
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

  const normalizedSubjects: SubjectRow[] = (subjects ?? []).map((subject) => {
    const examBoard = Array.isArray(subject.exam_board)
      ? (subject.exam_board[0] ?? null)
      : (subject.exam_board ?? null);
    return { ...subject, exam_board: examBoard } as SubjectRow;
  });

  const filteredSubjects = normalizedSubjects.filter((subject) => {
    const qb = subject.exam_board?.question_bank ?? QUESTION_BANK.EXAM_PAPER;
    return qb === QUESTION_BANK.EXAM_PAPER;
  });
  const allowedSubjectIds = new Set(
    filteredSubjects.map((subject) => subject.id),
  );
  const filteredExamPapers = (examPapers ?? []).filter((paper) =>
    allowedSubjectIds.has(paper.subject_id),
  );
  const normalizedExamPapers: BrowserExamPaper[] = filteredExamPapers.map(
    (paper) => {
      const subject = Array.isArray(paper.subject)
        ? (paper.subject[0] ?? null)
        : (paper.subject ?? null);
      const examBoard =
        subject && Array.isArray(subject.exam_board)
          ? (subject.exam_board[0] ?? null)
          : (subject?.exam_board ?? null);
      const normalizedTagValues =
        paper.tag_values?.map((entry) => {
          const tagValue = Array.isArray(entry.tag_value)
            ? (entry.tag_value[0] ?? null)
            : (entry.tag_value ?? null);
          return {
            tag_value_id: entry.tag_value_id,
            tag_value: tagValue
              ? {
                  id: tagValue.id,
                  value: tagValue.value,
                  tag_id: tagValue.tag_id ?? null,
                }
              : null,
          };
        }) ?? [];
      return {
        ...paper,
        subject: subject ? { ...subject, exam_board: examBoard } : null,
        tag_values: normalizedTagValues,
      } as BrowserExamPaper;
    },
  );
  const filteredSubjectTags = (subjectTags ?? []).filter((tag) =>
    allowedSubjectIds.has(tag.subject_id),
  );

  const loadError =
    subjectsError || papersError || tagsError
      ? "Failed to load subjects, papers, or tags. Please try again later."
      : null;

  return (
    <ExamPaperManagement
      initialSubjects={filteredSubjects}
      initialExamPapers={normalizedExamPapers}
      initialSubjectTags={filteredSubjectTags}
      loadError={loadError}
    />
  );
}
