import { createClient } from "@/lib/supabase/server";

import { SubjectManagement } from "./subject-management-client";

export default async function ConsoleSubjectsPage() {
  const supabase = await createClient();

  const [examBoardsResult, subjectsResult] = await Promise.all([
    supabase
      .from("exam_boards")
      .select("id, name, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("subjects")
      .select("id, name, exam_board_id, created_at")
      .order("name", { ascending: true }),
  ]);

  const loadError =
    examBoardsResult.error || subjectsResult.error
      ? "无法加载考试局或学科数据，请稍后重试。"
      : null;

  return (
    <SubjectManagement
      initialExamBoards={examBoardsResult.data ?? []}
      initialSubjects={subjectsResult.data ?? []}
      loadError={loadError}
    />
  );
}
