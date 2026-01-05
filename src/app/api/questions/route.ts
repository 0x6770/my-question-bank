import { NextResponse } from "next/server";

import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "../../../../database.types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const subjectIdParam = searchParams.get("subjectId");
  const chapterIdParam = searchParams.get("chapterId");
  const difficultiesParam = searchParams.get("difficulties");
  const pageParam = searchParams.get("page");
  const completionParam = searchParams.get("completion"); // "all" | "completed" | "incompleted"
  const bookmarkParam = searchParams.get("bookmark"); // "all" | "bookmarked"
  const bankParam = searchParams.get("bank"); // "topical" | "past-paper" | "exam-paper"

  const subjectId = subjectIdParam ? Number.parseInt(subjectIdParam, 10) : null;
  const chapterId = chapterIdParam ? Number.parseInt(chapterIdParam, 10) : null;

  // Map URL parameter to question bank value, default to "past paper questions"
  let selectedBank: QuestionBank = QUESTION_BANK.PAST_PAPER_QUESTIONS;
  if (bankParam === "topical") {
    selectedBank = QUESTION_BANK.TOPICAL_QUESTIONS;
  } else if (bankParam === "exam-paper") {
    selectedBank = QUESTION_BANK.EXAM_PAPER;
  }
  const difficultySet =
    difficultiesParam && difficultiesParam.length > 0
      ? new Set(
          difficultiesParam
            .split(",")
            .map((item) => Number.parseInt(item, 10))
            .filter((value) => Number.isFinite(value)),
        )
      : null;
  const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const pageSize = 20;
  const offset = (safePage - 1) * pageSize;
  const fetchLimit = pageSize + 1; // +1 用于判定是否还有下一页

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get exam boards for the selected question bank
  const { data: examBoards } = await supabase
    .from("exam_boards")
    .select("id")
    .eq("question_bank", selectedBank);

  const examBoardIds = (examBoards ?? []).map((board) => board.id);

  // Get subjects belonging to these exam boards
  const { data: allSubjects } = await supabase
    .from("subjects")
    .select("id, name, exam_board_id");

  const subjects = (allSubjects ?? []).filter((subject) =>
    examBoardIds.includes(subject.exam_board_id),
  );

  const subjectIds = subjects.map((subject) => subject.id);

  // Get chapters belonging to these subjects
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id");

  const chapters = (allChapters ?? []).filter((chapter) =>
    subjectIds.includes(chapter.subject_id),
  );

  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const subjectMap = new Map(
    subjects.map((subject) => [subject.id, subject.name]),
  );

  const childChapterMap = new Map<number, number[]>();
  for (const chapter of chapters ?? []) {
    if (chapter.parent_chapter_id == null) continue;
    const list = childChapterMap.get(chapter.parent_chapter_id) ?? [];
    list.push(chapter.id);
    childChapterMap.set(chapter.parent_chapter_id, list);
  }

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
  } else if (Number.isFinite(subjectId)) {
    const roots = (chapters ?? [])
      .filter((chapter) => chapter.subject_id === subjectId)
      .map((chapter) => chapter.id);
    const all = new Set<number>();
    for (const root of roots) {
      for (const descendant of collectDescendants(root)) {
        all.add(descendant);
      }
    }
    allowedChapterIds = Array.from(all);
  }

  if (allowedChapterIds && allowedChapterIds.length === 0) {
    return NextResponse.json({ questions: [], hasMore: false, page: safePage });
  }

  const shouldFilterBookmarks = bookmarkParam === "bookmarked";
  let bookmarkedQuestionIds: number[] | null = null;
  if (shouldFilterBookmarks) {
    if (!user) {
      return NextResponse.json({
        questions: [],
        hasMore: false,
        page: safePage,
      });
    }
    const { data: bookmarkRows, error: bookmarkError } = await supabase
      .from("user_questions")
      .select("question_id")
      .eq("user_id", user.id)
      .eq("is_bookmarked", true);
    if (bookmarkError) {
      return NextResponse.json(
        { error: bookmarkError.message },
        { status: 500 },
      );
    }
    bookmarkedQuestionIds = (bookmarkRows ?? []).map((row) => row.question_id);
    if (bookmarkedQuestionIds.length === 0) {
      return NextResponse.json({
        questions: [],
        hasMore: false,
        page: safePage,
      });
    }
  }

  // 第一步：通过 question_chapters 找到符合条件的 question_ids
  let questionIdsQuery = supabase
    .from("question_chapters")
    .select("question_id");

  if (allowedChapterIds) {
    questionIdsQuery = questionIdsQuery.in("chapter_id", allowedChapterIds);
  }

  const { data: questionChapterRows, error: qcError } = await questionIdsQuery;

  if (qcError) {
    return NextResponse.json({ error: qcError.message }, { status: 500 });
  }

  const matchingQuestionIds = Array.from(
    new Set((questionChapterRows ?? []).map((row) => row.question_id)),
  );

  if (matchingQuestionIds.length === 0) {
    return NextResponse.json({ questions: [], hasMore: false, page: safePage });
  }

  // 第二步：查询题目详情
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
    .in("id", matchingQuestionIds)
    .range(offset, offset + fetchLimit - 1);

  if (bookmarkedQuestionIds) {
    query = query.in("id", bookmarkedQuestionIds);
  }

  if (difficultySet && difficultySet.size > 0) {
    query = query.in("difficulty", Array.from(difficultySet));
  }

  const { data: questions, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
      },
    );
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

  // 第三步：获取每个题目的所有 chapters
  const questionIds = (questions ?? []).map((q) => (q as QuestionRow).id);
  const { data: allQuestionChapters } = await supabase
    .from("question_chapters")
    .select("question_id, chapter_id")
    .in("question_id", questionIds);

  // 构建 questionId -> chapterIds[] 映射
  const questionToChaptersMap = new Map<number, number[]>();
  for (const qc of allQuestionChapters ?? []) {
    const existing = questionToChaptersMap.get(qc.question_id) ?? [];
    existing.push(qc.chapter_id);
    questionToChaptersMap.set(qc.question_id, existing);
  }

  const questionImagePaths = new Set<string>();
  const answerImagePaths = new Set<string>();

  const hasMore = (questions?.length ?? 0) > pageSize;
  const limitedQuestions = hasMore
    ? (questions ?? []).slice(0, pageSize)
    : (questions ?? []);

  const normalized = limitedQuestions.map((question) => {
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

    // 获取这个题目的所有 chapters
    const questionChapterIds = questionToChaptersMap.get(row.id) ?? [];

    // 选择第一个在查询范围内的 chapter 作为"主要" chapter 显示
    // （为了向后兼容，前端期望有 chapterId/chapterName）
    let primaryChapterId: number | null = null;
    if (allowedChapterIds) {
      // 如果有查询范围，优先选择范围内的第一个
      primaryChapterId =
        questionChapterIds.find((cid) => allowedChapterIds.includes(cid)) ??
        questionChapterIds[0] ??
        null;
    } else {
      // 否则选择第一个
      primaryChapterId = questionChapterIds[0] ?? null;
    }

    const chapter = primaryChapterId
      ? (chapterMap.get(primaryChapterId) ?? null)
      : null;
    const subjectIdFromChapter = chapter?.subject_id ?? null;

    return {
      id: row.id,
      marks: row.marks,
      difficulty: row.difficulty,
      calculator: row.calculator,
      createdAt: row.created_at,
      chapterIds: questionChapterIds, // Array of all chapter IDs
      chapterId: primaryChapterId, // Keep for backward compatibility
      chapterName: chapter?.name ?? null,
      subjectId: subjectIdFromChapter,
      subjectName:
        subjectIdFromChapter != null
          ? (subjectMap.get(subjectIdFromChapter) ?? null)
          : null,
      images: sortedImages,
      answerImages: sortedAnswerImages,
    };
  });

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

  // Bookmarks for current user (if signed in)
  let bookmarksById: Record<number, boolean> = {};
  let answersViewedById: Record<number, boolean> = {};
  if (user && withSigned.length > 0) {
    const { data: bookmarkRows } = await supabase
      .from("user_questions")
      .select("question_id, is_bookmarked, answer_viewed_at")
      .in(
        "question_id",
        withSigned.map((q) => q.id),
      );
    bookmarksById = Object.fromEntries(
      (bookmarkRows ?? []).map((row) => [row.question_id, row.is_bookmarked]),
    );
    answersViewedById = Object.fromEntries(
      (bookmarkRows ?? []).map((row) => [
        row.question_id,
        Boolean(row.answer_viewed_at),
      ]),
    );
  }

  let filtered = withSigned;
  if (user && completionParam && completionParam !== "all") {
    const shouldIncludeViewed = completionParam === "completed";
    filtered = withSigned.filter((question) =>
      shouldIncludeViewed
        ? answersViewedById[question.id]
        : !answersViewedById[question.id],
    );
  }

  const withBookmarks = filtered.map((question) => ({
    ...question,
    isBookmarked: bookmarksById[question.id] ?? false,
    isAnswerViewed: answersViewedById[question.id] ?? false,
  }));

  return NextResponse.json({
    questions: withBookmarks,
    hasMore,
    page: safePage,
  });
}
