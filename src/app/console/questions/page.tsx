import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../../database.types";
import { QuestionManagement } from "./question-management-client";

type TagRow = Tables<"tags">;

type QuestionSummary = {
  id: number;
  subjectId: number | null;
  subjectName: string | null;
  createdAt: string;
  images: {
    id: number;
    storage_path: string;
    position: number;
  }[];
  tags: TagRow[];
};

export default async function ConsoleQuestionsPage() {
  const supabase = await createClient();

  const [
    { data: tags, error: tagsError },
    { data: questions, error: questionsError },
  ] = await Promise.all([
    supabase
      .from("tags")
      .select("id, name, parent_id, created_at")
      .order("name", { ascending: true }),
    supabase
      .from("questions")
      .select(
        `
          id,
          subject_id,
          created_at,
          subject:subject_id (
            id,
            name,
            parent_id
          ),
          question_images (
            id,
            storage_path,
            position
          ),
          question_tags (
            tag:tag_id (
              id,
              name,
              parent_id,
              created_at
            )
          )
        `,
      )
      .order("created_at", { ascending: false }),
  ]);

  const tagById = new Map((tags ?? []).map((tag) => [tag.id, tag]));

  const questionSummaries: QuestionSummary[] = (questions ?? []).map(
    (question) => {
      const rawQuestion = question as unknown as {
        id: number;
        subject_id: number | null;
        created_at: string;
        subject: TagRow | null;
        question_images: QuestionSummary["images"] | null;
        question_tags: { tag: TagRow | null }[] | null;
      };

      const images = (rawQuestion.question_images ?? [])
        .slice()
        .sort((a, b) => {
          return a.position - b.position;
        });

      const resolvedTags: TagRow[] = [];
      (rawQuestion.question_tags ?? []).forEach((entry) => {
        if (entry?.tag) {
          resolvedTags.push(entry.tag);
        }
      });

      const subject = rawQuestion.subject_id
        ? (tagById.get(rawQuestion.subject_id) ?? rawQuestion.subject ?? null)
        : null;

      return {
        id: rawQuestion.id,
        subjectId: rawQuestion.subject_id,
        subjectName: subject?.name ?? null,
        createdAt: rawQuestion.created_at,
        images,
        tags: resolvedTags,
      };
    },
  );

  return (
    <QuestionManagement
      initialTags={tags ?? []}
      initialQuestions={questionSummaries}
      loadError={
        tagsError || questionsError ? "无法加载题目数据，请稍后重试。" : null
      }
    />
  );
}
