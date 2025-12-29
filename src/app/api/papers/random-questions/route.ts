import { NextResponse } from "next/server";

import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "../../../../../database.types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  // Parse query parameters
  const bankParam = searchParams.get("bank"); // "typical" | "past-paper" | "exam-paper"
  const subjectIdParam = searchParams.get("subjectId");
  const chapterIdParam = searchParams.get("chapterId");
  const difficultyParam = searchParams.get("difficulty");
  const countParam = searchParams.get("count");

  // Validate required parameters
  if (!bankParam || !subjectIdParam) {
    return NextResponse.json(
      { error: "Missing required parameters: bank and subjectId" },
      { status: 400 },
    );
  }

  const subjectId = Number.parseInt(subjectIdParam, 10);
  const chapterId = chapterIdParam ? Number.parseInt(chapterIdParam, 10) : null;
  const difficulty = difficultyParam
    ? Number.parseInt(difficultyParam, 10)
    : null;
  const count = countParam ? Number.parseInt(countParam, 10) : 10;

  // Validate count (1-30 for MVP)
  if (!Number.isFinite(count) || count < 1 || count > 30) {
    return NextResponse.json(
      { error: "Count must be between 1 and 30" },
      { status: 400 },
    );
  }

  // Map URL parameter to question bank value
  let selectedBank: QuestionBank = QUESTION_BANK.PAST_PAPER_QUESTIONS;
  if (bankParam === "typical") {
    selectedBank = QUESTION_BANK.TOPICAL_QUESTIONS;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  }

  // Get exam boards for the selected question bank
  const { data: examBoards } = await supabase
    .from("exam_boards")
    .select("id")
    .eq("question_bank", selectedBank);

  const examBoardIds = (examBoards ?? []).map((board) => board.id);

  // Verify subject belongs to the question bank
  const { data: subject } = await supabase
    .from("subjects")
    .select("id, exam_board_id")
    .eq("id", subjectId)
    .single();

  if (!subject || !examBoardIds.includes(subject.exam_board_id)) {
    return NextResponse.json(
      { error: "Invalid subject for the selected question bank" },
      { status: 400 },
    );
  }

  // Get chapters belonging to this subject
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, parent_chapter_id")
    .eq("subject_id", subjectId);

  const chapters = allChapters ?? [];
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));

  const childChapterMap = new Map<number, number[]>();
  for (const chapter of chapters) {
    if (chapter.parent_chapter_id == null) continue;
    const list = childChapterMap.get(chapter.parent_chapter_id) ?? [];
    list.push(chapter.id);
    childChapterMap.set(chapter.parent_chapter_id, list);
  }

  // Collect all descendant chapters if chapterId is specified
  const collectDescendants = (id: number) => {
    const result = new Set<number>();
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null || result.has(current)) continue;
      result.add(current);
      const children = childChapterMap.get(current);
      if (children) {
        stack.push(...children);
      }
    }
    return Array.from(result);
  };

  let allowedChapterIds: number[] | null = null;
  if (Number.isFinite(chapterId)) {
    allowedChapterIds = collectDescendants(chapterId as number);
  } else {
    // All chapters for this subject
    const roots = chapters
      .filter((chapter) => chapter.parent_chapter_id === null)
      .map((chapter) => chapter.id);
    const all = new Set<number>();
    for (const root of roots) {
      for (const descendant of collectDescendants(root)) {
        all.add(descendant);
      }
    }
    // Also add chapters without parent
    for (const chapter of chapters) {
      all.add(chapter.id);
    }
    allowedChapterIds = Array.from(all);
  }

  if (allowedChapterIds.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  // Step 1: Find question IDs matching the criteria through question_chapters
  let questionIdsQuery = supabase
    .from("question_chapters")
    .select("question_id")
    .in("chapter_id", allowedChapterIds);

  const { data: questionChapterRows, error: qcError } = await questionIdsQuery;

  if (qcError) {
    return NextResponse.json({ error: qcError.message }, { status: 500 });
  }

  const matchingQuestionIds = Array.from(
    new Set((questionChapterRows ?? []).map((row) => row.question_id)),
  );

  if (matchingQuestionIds.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  // Step 2: Randomly select questions
  // Use a SQL query with ORDER BY RANDOM() for random sampling
  // Note: For better performance with large datasets, consider using TABLESAMPLE
  let query = supabase
    .from("questions")
    .select(
      `
        id,
        marks,
        difficulty,
        calculator,
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
    .in("id", matchingQuestionIds);

  // Apply difficulty filter if specified
  if (difficulty !== null && Number.isFinite(difficulty)) {
    query = query.eq("difficulty", difficulty);
  }

  const { data: allQuestions, error: questionsError } = await query;

  if (questionsError) {
    return NextResponse.json(
      { error: questionsError.message },
      { status: 500 },
    );
  }

  // Random sampling in JavaScript (since Supabase doesn't support ORDER BY RANDOM() with .select())
  // Shuffle the array using Fisher-Yates algorithm
  const shuffled = [...(allQuestions ?? [])];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Take the first 'count' items
  const selectedQuestions = shuffled.slice(0, Math.min(count, shuffled.length));

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

  // Step 3: Get chapter information for each question
  const questionIds = selectedQuestions.map((q) => (q as QuestionRow).id);

  if (questionIds.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  const { data: allQuestionChapters } = await supabase
    .from("question_chapters")
    .select("question_id, chapter_id")
    .in("question_id", questionIds);

  // Build questionId -> chapterIds[] mapping
  const questionToChaptersMap = new Map<number, number[]>();
  for (const qc of allQuestionChapters ?? []) {
    const existing = questionToChaptersMap.get(qc.question_id) ?? [];
    existing.push(qc.chapter_id);
    questionToChaptersMap.set(qc.question_id, existing);
  }

  const questionImagePaths = new Set<string>();
  const answerImagePaths = new Set<string>();

  const normalized = selectedQuestions.map((question) => {
    const row = question as unknown as QuestionRow;
    const sortedImages = (row.question_images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    const sortedAnswerImages = (row.answer_images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);

    for (const image of sortedImages) {
      questionImagePaths.add(image.storage_path);
    }
    for (const image of sortedAnswerImages) {
      answerImagePaths.add(image.storage_path);
    }

    // Get all chapters for this question
    const questionChapterIds = questionToChaptersMap.get(row.id) ?? [];

    return {
      id: row.id,
      marks: row.marks,
      difficulty: row.difficulty,
      calculator: row.calculator,
      createdAt: row.created_at,
      chapterIds: questionChapterIds,
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

  return NextResponse.json({ questions: withSigned });
}
