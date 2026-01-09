import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type QuestionImageRow = {
  id: number;
  storage_path: string;
  position: number;
};

type ChapterSubjectRow = {
  id: number;
  name: string;
};

type ChapterRow = {
  id: number;
  name: string;
  subject: ChapterSubjectRow | ChapterSubjectRow[] | null;
};

const toSingle = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

  const adminClient = createAdminClient();

  const { data: questionData, error: questionError } = await adminClient
    .from("questions")
    .select("id, marks, difficulty, calculator, created_at")
    .eq("id", questionId)
    .single();

  if (questionError || !questionData) {
    return NextResponse.json(
      {
        error: `Question #${questionId} not found`,
        details: questionError?.message ?? "No question data returned.",
      },
      { status: 404 },
    );
  }

  const [questionImagesResult, answerImagesResult, questionChaptersResult] =
    await Promise.all([
      adminClient
        .from("question_images")
        .select("id, storage_path, position")
        .eq("question_id", questionId)
        .order("position", { ascending: true }),
      adminClient
        .from("answer_images")
        .select("id, storage_path, position")
        .eq("question_id", questionId)
        .order("position", { ascending: true }),
      adminClient
        .from("question_chapters")
        .select("chapter_id, created_at")
        .eq("question_id", questionId)
        .order("created_at", { ascending: true }),
    ]);

  if (questionImagesResult.error || answerImagesResult.error) {
    return NextResponse.json(
      {
        error: "Failed to load question images.",
        details:
          questionImagesResult.error?.message ??
          answerImagesResult.error?.message,
      },
      { status: 500 },
    );
  }

  if (questionChaptersResult.error) {
    return NextResponse.json(
      {
        error: "Failed to load question chapters.",
        details: questionChaptersResult.error.message,
      },
      { status: 500 },
    );
  }

  const questionImages = (questionImagesResult.data ??
    []) as QuestionImageRow[];
  const answerImages = (answerImagesResult.data ?? []) as QuestionImageRow[];

  const questionChapterRows = questionChaptersResult.data ?? [];
  const chapterIds = questionChapterRows.map((row) => row.chapter_id);

  let chapterMap = new Map<number, ChapterRow>();
  if (chapterIds.length > 0) {
    const { data: chapterData, error: chapterError } = await adminClient
      .from("chapters")
      .select("id, name, subject:subjects(id, name)")
      .in("id", chapterIds);

    if (chapterError) {
      return NextResponse.json(
        {
          error: "Failed to load chapter data.",
          details: chapterError.message,
        },
        { status: 500 },
      );
    }

    chapterMap = new Map(
      (chapterData ?? []).map((chapter) => [chapter.id, chapter as ChapterRow]),
    );
  }

  const questionChapters = chapterIds.map((chapterId) => {
    const chapter = chapterMap.get(chapterId) ?? null;
    const subject = chapter ? toSingle(chapter.subject) : null;
    return {
      chapter_id: chapterId,
      chapter_name: chapter?.name ?? null,
      subject_name: subject?.name ?? null,
    };
  });

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
  const firstChapter = questionChapters[0];

  return NextResponse.json({
    id: questionData.id,
    marks: questionData.marks,
    difficulty: questionData.difficulty,
    calculator: questionData.calculator,
    createdAt: questionData.created_at,
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
