import { NextResponse } from "next/server";

import { isAdminRole } from "@/app/console/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ChapterSubjectRow = {
  id: number;
  name: string;
  exam_board_id: number;
};

type ChapterRow = {
  id: number;
  name: string;
  subject: ChapterSubjectRow | ChapterSubjectRow[] | null;
};

type QuestionImageRow = {
  id: number;
  storage_path: string;
  position: number;
};

type QuestionRow = {
  id: number;
  marks: number;
  difficulty: number;
  created_at: string;
  question_images: QuestionImageRow[] | null;
  answer_images: QuestionImageRow[] | null;
};

const toSingle = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

async function getRequesterRole() {
  const supabase = await createClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();

  if (userError || !userResult.user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .maybeSingle();

  if (profileError || !profile?.role || !isAdminRole(profile.role)) {
    return { error: "Forbidden", status: 403 };
  }

  return { role: profile.role, userId: userResult.user.id };
}

export async function GET(request: Request) {
  const requester = await getRequesterRole();
  if ("error" in requester) {
    return NextResponse.json(
      { error: requester.error },
      { status: requester.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const chapterIdParam = searchParams.get("chapterId");
  const chapterId = chapterIdParam ? Number.parseInt(chapterIdParam, 10) : NaN;

  if (!Number.isFinite(chapterId)) {
    return NextResponse.json({ error: "Invalid chapter ID." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: selectedChapter, error: selectedChapterError } =
    await adminClient
      .from("chapters")
      .select("id, name, subject:subjects(id, name, exam_board_id)")
      .eq("id", chapterId)
      .single();

  if (selectedChapterError || !selectedChapter) {
    return NextResponse.json(
      { error: selectedChapterError?.message ?? "Chapter not found." },
      { status: 404 },
    );
  }

  const selectedSubject = toSingle(selectedChapter.subject);
  const selectedExamBoardId = selectedSubject?.exam_board_id ?? null;

  const { data: orderRows, error: orderError } = await adminClient
    .from("chapter_question_orders")
    .select("question_id, position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: true });

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  const orderedQuestionIds = (orderRows ?? []).map((row) => row.question_id);

  if (orderedQuestionIds.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  const { data: questionsData, error: questionsError } = await adminClient
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
    .in("id", orderedQuestionIds);

  if (questionsError || !questionsData) {
    return NextResponse.json(
      { error: questionsError?.message ?? "Failed to load questions." },
      { status: 500 },
    );
  }

  const { data: questionChapters, error: questionChaptersError } =
    await adminClient
      .from("question_chapters")
      .select("question_id, chapter_id")
      .in("question_id", orderedQuestionIds);

  if (questionChaptersError) {
    return NextResponse.json(
      { error: questionChaptersError.message },
      { status: 500 },
    );
  }

  // Fetch question_subjects for calculator values per subject
  const { data: questionSubjectsData } = await adminClient
    .from("question_subjects")
    .select("question_id, subject_id, calculator")
    .in("question_id", orderedQuestionIds);

  // Build questionId -> Map<subjectId, calculator> for lookup
  const questionSubjectCalcMap = new Map<number, Map<number, boolean>>();
  for (const qs of questionSubjectsData ?? []) {
    const existing =
      questionSubjectCalcMap.get(qs.question_id) ?? new Map<number, boolean>();
    existing.set(qs.subject_id, qs.calculator);
    questionSubjectCalcMap.set(qs.question_id, existing);
  }

  const chapterIds = Array.from(
    new Set((questionChapters ?? []).map((row) => row.chapter_id)),
  );

  let chapterMap = new Map<number, ChapterRow>();
  if (chapterIds.length > 0) {
    const { data: chapterRows, error: chapterError } = await adminClient
      .from("chapters")
      .select("id, name, subject:subjects(id, name, exam_board_id)")
      .in("id", chapterIds);

    if (chapterError) {
      return NextResponse.json(
        { error: chapterError.message },
        { status: 500 },
      );
    }

    chapterMap = new Map(
      (chapterRows ?? []).map((chapter) => [chapter.id, chapter as ChapterRow]),
    );
  }

  const questionToChapterMap = new Map<number, number>();
  for (const row of questionChapters ?? []) {
    const chapter = chapterMap.get(row.chapter_id);
    const subject = chapter ? toSingle(chapter.subject) : null;
    const matchesExam =
      selectedExamBoardId != null &&
      subject?.exam_board_id === selectedExamBoardId;
    if (!matchesExam) continue;
    if (!questionToChapterMap.has(row.question_id)) {
      questionToChapterMap.set(row.question_id, row.chapter_id);
    }
  }

  const questionById = new Map(
    (questionsData ?? []).map((row) => [row.id, row as QuestionRow]),
  );
  const positionById = new Map(
    (orderRows ?? []).map((row) => [row.question_id, row.position]),
  );

  const orderedQuestions = orderedQuestionIds
    .map((id) => {
      const question = questionById.get(id);
      if (!question) return null;
      const chapterIdForQuestion =
        questionToChapterMap.get(question.id) ??
        questionChapters?.find((row) => row.question_id === question.id)
          ?.chapter_id ??
        null;
      const chapter = chapterIdForQuestion
        ? (chapterMap.get(chapterIdForQuestion) ?? null)
        : null;
      const subject = chapter ? toSingle(chapter.subject) : null;
      const position = positionById.get(question.id) ?? null;

      // Get calculator value for the question's subject
      const subjectCalcMap = questionSubjectCalcMap.get(question.id);
      const calculator =
        subject?.id && subjectCalcMap
          ? (subjectCalcMap.get(subject.id) ?? true)
          : true;

      return {
        id: question.id,
        marks: question.marks,
        difficulty: question.difficulty,
        calculator,
        createdAt: question.created_at,
        chapterId: chapterIdForQuestion,
        chapterName: chapter?.name ?? null,
        subjectName: subject?.name ?? null,
        position,
        images:
          question.question_images
            ?.slice()
            .sort((a, b) => a.position - b.position) ?? [],
        answerImages:
          question.answer_images
            ?.slice()
            .sort((a, b) => a.position - b.position) ?? [],
      };
    })
    .filter(
      (question): question is NonNullable<typeof question> => question !== null,
    );

  const questionImagePaths = new Set<string>();
  const answerImagePaths = new Set<string>();

  for (const question of orderedQuestions) {
    if (!question) continue;
    for (const image of question.images) {
      questionImagePaths.add(image.storage_path);
    }
    for (const image of question.answerImages) {
      answerImagePaths.add(image.storage_path);
    }
  }

  const supabase = await createClient();
  const questionSignedUrlMap: Record<string, string> = {};
  const answerSignedUrlMap: Record<string, string> = {};

  if (questionImagePaths.size > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("question_images")
      .createSignedUrls(Array.from(questionImagePaths), 3600);
    for (const item of signedUrls ?? []) {
      if (item.path && item.signedUrl) {
        questionSignedUrlMap[item.path] = item.signedUrl;
      }
    }
  }

  if (answerImagePaths.size > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("answer_images")
      .createSignedUrls(Array.from(answerImagePaths), 3600);
    for (const item of signedUrls ?? []) {
      if (item.path && item.signedUrl) {
        answerSignedUrlMap[item.path] = item.signedUrl;
      }
    }
  }

  const withSigned = orderedQuestions.map((question) => ({
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

  return NextResponse.json({ questions: withSigned });
}

export async function POST(request: Request) {
  const requester = await getRequesterRole();
  if ("error" in requester) {
    return NextResponse.json(
      { error: requester.error },
      { status: requester.status },
    );
  }

  let payload: { chapterId?: number; orderedQuestionIds?: number[] } | null =
    null;
  try {
    payload = (await request.json()) as {
      chapterId?: number;
      orderedQuestionIds?: number[];
    };
  } catch {
    payload = null;
  }

  const chapterId = payload?.chapterId;
  const orderedQuestionIds = payload?.orderedQuestionIds ?? [];

  if (!chapterId || !Number.isFinite(chapterId)) {
    return NextResponse.json({ error: "Invalid chapter ID." }, { status: 400 });
  }

  if (!Array.isArray(orderedQuestionIds) || orderedQuestionIds.length === 0) {
    return NextResponse.json(
      { error: "Question order cannot be empty." },
      { status: 400 },
    );
  }

  const uniqueIds = Array.from(new Set(orderedQuestionIds));
  if (uniqueIds.length !== orderedQuestionIds.length) {
    return NextResponse.json(
      { error: "Question order contains duplicates." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const updates = orderedQuestionIds.map((questionId, index) => ({
    chapter_id: chapterId,
    question_id: questionId,
    position: index + 1,
  }));

  const { count, error: countError } = await adminClient
    .from("chapter_question_orders")
    .select("question_id", { count: "exact", head: true })
    .eq("chapter_id", chapterId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if (typeof count === "number" && count !== orderedQuestionIds.length) {
    return NextResponse.json(
      {
        error: "Question order is out of date. Please refresh and try again.",
      },
      { status: 409 },
    );
  }

  const { error: deleteError } = await adminClient
    .from("chapter_question_orders")
    .delete()
    .eq("chapter_id", chapterId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await adminClient
    .from("chapter_question_orders")
    .insert(updates);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
