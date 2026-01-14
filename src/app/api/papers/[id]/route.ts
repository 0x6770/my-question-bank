import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "../../../../../database.types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const paperId = Number.parseInt(id, 10);

  if (!Number.isFinite(paperId)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  // Step 1: Fetch paper record (RLS ensures user owns it)
  const { data: paper, error: paperError } = await supabase
    .from("generated_papers")
    .select("id, title, question_bank, show_answers, created_at, updated_at")
    .eq("id", paperId)
    .single();

  if (paperError) {
    if (paperError.code === "PGRST116") {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }
    return NextResponse.json({ error: paperError.message }, { status: 500 });
  }

  // Step 2: Fetch paper questions (ordered by position)
  const { data: paperQuestions, error: pqError } = await supabase
    .from("generated_paper_questions")
    .select("question_id, position")
    .eq("paper_id", paperId)
    .order("position", { ascending: true });

  if (pqError) {
    return NextResponse.json({ error: pqError.message }, { status: 500 });
  }

  if (!paperQuestions || paperQuestions.length === 0) {
    return NextResponse.json({
      ...paper,
      questions: [],
    });
  }

  const questionIds = paperQuestions.map((pq) => pq.question_id);

  // Step 3: Fetch question details with images
  const { data: questions, error: questionsError } = await supabase
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
    return NextResponse.json(
      { error: questionsError.message },
      { status: 500 },
    );
  }

  // Fetch question_subjects for calculator values
  const { data: questionSubjectsData } = await supabase
    .from("question_subjects")
    .select("question_id, calculator")
    .in("question_id", questionIds);

  // For papers without specific subject context, use first available calculator value or default true
  const questionCalculatorMap = new Map<number, boolean>();
  for (const qs of questionSubjectsData ?? []) {
    // Keep first value found for each question
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
    (questions ?? []).map((q) => [(q as QuestionRow).id, q as QuestionRow]),
  );

  const questionImagePaths = new Set<string>();
  const answerImagePaths = new Set<string>();

  // Reorder questions based on position in paper
  const orderedQuestions = paperQuestions
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

  // Step 4: Generate signed URLs for images
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

  const withSigned = normalized.map((question) => ({
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

  return NextResponse.json({
    ...paper,
    questions: withSigned,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const paperId = Number.parseInt(id, 10);

  if (!Number.isFinite(paperId)) {
    return NextResponse.json({ error: "Invalid paper ID" }, { status: 400 });
  }

  // Delete paper (RLS ensures user owns it, CASCADE will delete related questions)
  const { error } = await supabase
    .from("generated_papers")
    .delete()
    .eq("id", paperId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
