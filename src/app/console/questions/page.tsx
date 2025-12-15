import { createClient } from "@/lib/supabase/server";
import type { Tables } from "../../../../database.types";
import { QuestionManagement } from "./question-management-client";

const PAGE_SIZE = 20;

type SubjectRow = Tables<"subjects">;
type ChapterRow = Pick<
  Tables<"chapters">,
  "id" | "name" | "subject_id" | "parent_chapter_id" | "position"
> & {
  subject?: Pick<SubjectRow, "id" | "name"> | null;
};

type QuestionSummary = {
  id: number;
  chapterId: number | null;
  chapterName: string | null;
  subjectName: string | null;
  createdAt: string;
  difficulty: number;
  calculator: boolean;
  marks: number;
  images: {
    id: number;
    storage_path: string;
    position: number;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
  }[];
};

export default async function ConsoleQuestionsPage() {
  const supabase = await createClient();

  const [
    { data: chapters, error: chaptersError },
    { data: questions, error: questionsError },
  ] = await Promise.all([
    supabase
      .from("chapters")
      .select(
        `
          id,
          name,
          subject_id,
          parent_chapter_id,
          position,
          subject:subject_id (
            id,
            name
          )
        `,
      )
      .order("subject_id", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("questions")
      .select(
        `
          id,
          chapter_id,
          difficulty,
          calculator,
          marks,
        created_at,
        chapter:chapter_id (
          id,
          name,
          parent_chapter_id,
          subject_id,
          subject:subject_id (
            id,
            name
          )
        ),
        question_images (
          id,
          storage_path,
          position
        ),
        answer_images (
          id,
          storage_path,
          position
        )
      `,
      )
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE),
  ]);

  const hasMoreInitial = (questions?.length ?? 0) > PAGE_SIZE;
  const limitedQuestions = hasMoreInitial
    ? (questions ?? []).slice(0, PAGE_SIZE)
    : (questions ?? []);

  const questionSummaries: QuestionSummary[] = limitedQuestions.map(
    (question) => {
      const rawQuestion = question as unknown as {
        id: number;
        chapter_id: number | null;
        created_at: string;
        difficulty: number;
        calculator: boolean;
        marks: number;
        chapter: {
          id: number;
          name: string;
          parent_chapter_id: number | null;
          subject_id: number;
          subject: { id: number; name: string } | null;
        } | null;
        question_images: QuestionSummary["images"] | null;
        answer_images: QuestionSummary["answerImages"] | null;
      };

      const images = (rawQuestion.question_images ?? [])
        .slice()
        .sort((a, b) => {
          return a.position - b.position;
        });

      const answerImages = (rawQuestion.answer_images ?? [])
        .slice()
        .sort((a, b) => {
          return a.position - b.position;
        });

      const chapter = rawQuestion.chapter ?? null;

      return {
        id: rawQuestion.id,
        chapterId: rawQuestion.chapter_id,
        chapterName: chapter?.name ?? null,
        subjectName: chapter?.subject?.name ?? null,
        createdAt: rawQuestion.created_at,
        difficulty: rawQuestion.difficulty,
        calculator: rawQuestion.calculator,
        marks: rawQuestion.marks,
        images,
        answerImages,
      };
    },
  );

  type RawChapterRow = Tables<"chapters"> & {
    subject?:
      | Pick<SubjectRow, "id" | "name">
      | Pick<SubjectRow, "id" | "name">[]
      | null;
  };

  const chapterSummaries: ChapterRow[] = (chapters ?? []).map((chapter) => {
    const rawChapter = chapter as RawChapterRow;
    const subject = Array.isArray(rawChapter.subject)
      ? (rawChapter.subject[0] ?? null)
      : (rawChapter.subject ?? null);

    return {
      id: rawChapter.id,
      name: rawChapter.name,
      subject_id: rawChapter.subject_id,
      parent_chapter_id: rawChapter.parent_chapter_id,
      position: rawChapter.position,
      subject,
    };
  });

  return (
    <QuestionManagement
      initialChapters={chapterSummaries}
      initialQuestions={questionSummaries}
      initialHasMore={hasMoreInitial}
      loadError={
        chaptersError || questionsError
          ? "Failed to load question data. Please try again later."
          : null
      }
    />
  );
}
