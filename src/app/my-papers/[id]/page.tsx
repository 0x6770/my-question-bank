import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "../../../../database.types";
import { PaperViewClient } from "./paper-view-client";

type Question = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  createdAt: string;
  images: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl: string | null;
  }[];
};

type Paper = {
  id: number;
  title: string;
  question_bank: string;
  show_answers: boolean;
  one_question_per_page: boolean | null;
  created_at: string;
  updated_at: string;
  questions: Question[];
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const supabase = await createClient();
  const params = await props.params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {};
  }

  const paperId = Number.parseInt(params.id, 10);

  if (!Number.isFinite(paperId)) {
    return {};
  }

  const { data: paperData } = await supabase
    .from("generated_papers")
    .select("title")
    .eq("id", paperId)
    .single();

  if (!paperData?.title) {
    return {};
  }

  return {
    title: paperData.title,
  };
}

export default async function PaperViewPage(props: PageProps) {
  const supabase = await createClient();
  const params = await props.params;

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const paperId = Number.parseInt(params.id, 10);

  if (!Number.isFinite(paperId)) {
    redirect("/my-papers");
  }

  // Fetch paper record directly from database (RLS ensures user owns it)
  const { data: paperData, error: paperError } = await supabase
    .from("generated_papers")
    .select(
      "id, title, question_bank, show_answers, one_question_per_page, created_at, updated_at",
    )
    .eq("id", paperId)
    .single();

  if (paperError || !paperData) {
    redirect("/my-papers");
  }

  // Fetch paper questions (ordered by position)
  const { data: paperQuestions, error: pqError } = await supabase
    .from("generated_paper_questions")
    .select("question_id, position")
    .eq("paper_id", paperId)
    .order("position", { ascending: true });

  if (pqError) {
    redirect("/my-papers");
  }

  const questionIds = (paperQuestions ?? []).map((pq) => pq.question_id);

  let questions: Question[] = [];

  if (questionIds.length > 0) {
    // Fetch question details with images
    const { data: questionsData, error: questionsError } = await supabase
      .from("questions")
      .select(
        `
          id,
          marks,
          difficulty,
          created_at,
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
      .in("id", questionIds);

    if (questionsError) {
      redirect("/my-papers");
    }

    // Fetch question_subjects for calculator values
    const { data: questionSubjectsData } = await supabase
      .from("question_subjects")
      .select("question_id, calculator")
      .in("question_id", questionIds);

    // For papers without specific subject context, use first available calculator value or default true
    const questionCalculatorMap = new Map<number, boolean>();
    for (const qs of questionSubjectsData ?? []) {
      if (!questionCalculatorMap.has(qs.question_id)) {
        questionCalculatorMap.set(qs.question_id, qs.calculator);
      }
    }

    type QuestionRow = Omit<
      Database["public"]["Tables"]["questions"]["Row"],
      "chapter_id"
    > & {
      question_images:
        | {
            id: number;
            storage_path: string;
            position: number;
          }[]
        | null;
      answer_images:
        | {
            id: number;
            storage_path: string;
            position: number;
          }[]
        | null;
    };

    // Create a map of question ID to question data
    const questionMap = new Map(
      (questionsData ?? []).map((q) => [
        (q as QuestionRow).id,
        q as QuestionRow,
      ]),
    );

    const questionImagePaths = new Set<string>();
    const answerImagePaths = new Set<string>();

    // Reorder questions based on position in paper
    const orderedQuestions = (paperQuestions ?? [])
      .map((pq) => questionMap.get(pq.question_id))
      .filter((q): q is QuestionRow => q !== undefined);

    const normalized = orderedQuestions.map((question) => {
      const sortedImages = (question.question_images ?? [])
        .slice()
        .sort((a, b) => a.position - b.position);
      const sortedAnswerImages = (question.answer_images ?? [])
        .slice()
        .sort((a, b) => a.position - b.position);

      for (const image of sortedImages) {
        questionImagePaths.add(image.storage_path);
      }
      for (const image of sortedAnswerImages) {
        answerImagePaths.add(image.storage_path);
      }

      return {
        id: question.id,
        marks: question.marks,
        difficulty: question.difficulty,
        calculator: questionCalculatorMap.get(question.id) ?? true,
        createdAt: question.created_at,
        images: sortedImages,
        answerImages: sortedAnswerImages,
      };
    });

    // Generate signed URLs for images
    const questionPaths = Array.from(questionImagePaths);
    const answerPaths = Array.from(answerImagePaths);
    const questionSignedUrlMap: Record<string, string> = {};
    const answerSignedUrlMap: Record<string, string> = {};

    if (questionPaths.length > 0) {
      const { data: signedUrls } = await supabase.storage
        .from("question_images")
        .createSignedUrls(questionPaths, 3600);
      for (const item of signedUrls ?? []) {
        if (item.path && item.signedUrl) {
          questionSignedUrlMap[item.path] = item.signedUrl;
        }
      }
    }

    if (answerPaths.length > 0) {
      const { data: signedUrls } = await supabase.storage
        .from("answer_images")
        .createSignedUrls(answerPaths, 3600);
      for (const item of signedUrls ?? []) {
        if (item.path && item.signedUrl) {
          answerSignedUrlMap[item.path] = item.signedUrl;
        }
      }
    }

    questions = normalized.map((question) => ({
      ...question,
      images: question.images.map((image) => ({
        ...image,
        signedUrl: questionSignedUrlMap[image.storage_path] ?? null,
      })),
      answerImages: question.answerImages.map((image) => ({
        ...image,
        signedUrl: answerSignedUrlMap[image.storage_path] ?? null,
      })),
    }));
  }

  const paper: Paper = {
    ...paperData,
    questions,
  };

  return <PaperViewClient paper={paper} />;
}
