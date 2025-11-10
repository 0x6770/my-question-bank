import { createClient } from "@/lib/supabase/server";

import { SubjectManagement } from "./subject-management-client";

export default async function ConsoleSubjectsPage() {
  const supabase = await createClient();

  const [examBoardsResult, subjectsResult, chaptersResult] = await Promise.all([
    supabase
      .from("exam_boards")
      .select("id, name, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("subjects")
      .select("id, name, exam_board_id, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("chapters")
      .select("id, name, subject_id, parent_chapter_id, position, created_at")
      .order("subject_id", { ascending: true })
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const loadError =
    examBoardsResult.error || subjectsResult.error || chaptersResult.error
      ? "无法加载考试局、学科或章节数据，请稍后重试。"
      : null;

  return (
    <SubjectManagement
      initialExamBoards={examBoardsResult.data ?? []}
      initialSubjects={subjectsResult.data ?? []}
      initialChapters={chaptersResult.data ?? []}
      loadError={loadError}
    />
  );
}
