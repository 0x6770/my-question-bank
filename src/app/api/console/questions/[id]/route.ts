import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type AdminSearchQuestionImage = {
  id: number;
  storage_path: string;
  position: number;
};

type AdminSearchQuestionChapter = {
  chapter_id: number;
  chapter_name: string | null;
  subject_name: string | null;
};

type AdminSearchQuestionResult = {
  id: number;
  marks: number;
  difficulty: number;
  calculator: boolean;
  created_at: string;
  question_images: AdminSearchQuestionImage[] | null;
  answer_images: AdminSearchQuestionImage[] | null;
  question_chapters: AdminSearchQuestionChapter[] | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const questionId = parseInt(id, 10);

  if (Number.isNaN(questionId)) {
    return NextResponse.json({ error: "Invalid question ID" }, { status: 400 });
  }

  const supabase = await createClient();

  // Check if user is admin or super_admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "super_admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use RPC function to bypass RLS and fetch question data
  const { data: questionData, error: questionError } = await supabase.rpc(
    "admin_search_question",
    { question_id_param: questionId },
  );

  if (questionError || !questionData) {
    console.error("RPC error:", questionError);
    return NextResponse.json(
      {
        error: `Question #${questionId} not found`,
        details: questionError?.message ?? "No question data returned.",
      },
      { status: 404 },
    );
  }

  const typedQuestionData = questionData as AdminSearchQuestionResult;

  // Parse JSON response from RPC function
  const questionImages = (typedQuestionData.question_images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  const answerImages = (typedQuestionData.answer_images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position);

  // Get signed URLs for images
  const questionPaths = questionImages.map((img) => img.storage_path);
  const answerPaths = answerImages.map((img) => img.storage_path);

  let questionSignedUrls: Record<string, string> = {};
  let answerSignedUrls: Record<string, string> = {};

  if (questionPaths.length > 0) {
    const { data: signedData } = await supabase.storage
      .from("question_images")
      .createSignedUrls(questionPaths, 3600);
    if (signedData) {
      questionSignedUrls = Object.fromEntries(
        signedData.map((item) => [item.path, item.signedUrl]),
      );
    }
  }

  if (answerPaths.length > 0) {
    const { data: signedData } = await supabase.storage
      .from("answer_images")
      .createSignedUrls(answerPaths, 3600);
    if (signedData) {
      answerSignedUrls = Object.fromEntries(
        signedData.map((item) => [item.path, item.signedUrl]),
      );
    }
  }

  // Extract chapter and subject info
  const questionChapters = typedQuestionData.question_chapters ?? [];
  const firstChapter = questionChapters[0];

  return NextResponse.json({
    id: typedQuestionData.id,
    marks: typedQuestionData.marks,
    difficulty: typedQuestionData.difficulty,
    calculator: typedQuestionData.calculator,
    createdAt: typedQuestionData.created_at,
    images: questionImages.map((img) => ({
      id: img.id,
      storage_path: img.storage_path,
      position: img.position,
      signedUrl: questionSignedUrls[img.storage_path] || null,
    })),
    answerImages: answerImages.map((img) => ({
      id: img.id,
      storage_path: img.storage_path,
      position: img.position,
      signedUrl: answerSignedUrls[img.storage_path] || null,
    })),
    chapterIds: questionChapters.map((qc) => qc.chapter_id),
    chapterName: firstChapter?.chapter_name,
    subjectName: firstChapter?.subject_name,
  });
}
