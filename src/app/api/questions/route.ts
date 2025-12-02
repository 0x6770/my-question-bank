import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "../../../../database.types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const subjectIdParam = searchParams.get("subjectId");
  const chapterIdParam = searchParams.get("chapterId");
  const difficultiesParam = searchParams.get("difficulties");

  const subjectId = subjectIdParam ? Number.parseInt(subjectIdParam, 10) : null;
  const chapterId = chapterIdParam ? Number.parseInt(chapterIdParam, 10) : null;
  const difficultySet =
    difficultiesParam && difficultiesParam.length > 0
      ? new Set(
          difficultiesParam
            .split(",")
            .map((item) => Number.parseInt(item, 10))
            .filter((value) => Number.isFinite(value)),
        )
      : null;

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, name, subject_id, parent_chapter_id");

  const { data: subjects } = await supabase.from("subjects").select("id, name");

  const chapterMap = new Map(
    (chapters ?? []).map((chapter) => [chapter.id, chapter]),
  );
  const subjectMap = new Map(
    (subjects ?? []).map((subject) => [subject.id, subject.name]),
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
    return NextResponse.json({ questions: [] });
  }

  let query = supabase
    .from("questions")
    .select<`${"id" | "chapter_id" | "marks" | "difficulty" | "calculator" | "created_at"}, question_images(id, storage_path, position), answer_images(id, storage_path, position)`>(
      `
      id,
      chapter_id,
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
    );

  if (allowedChapterIds) {
    query = query.in("chapter_id", allowedChapterIds);
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

  type QuestionRow = Database["public"]["Tables"]["questions"]["Row"] & {
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

  const questionImagePaths = new Set<string>();
  const answerImagePaths = new Set<string>();

  const normalized = (questions ?? []).map((question) => {
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

    const chapter = row.chapter_id
      ? (chapterMap.get(row.chapter_id) ?? null)
      : null;
    const subjectIdFromChapter = chapter?.subject_id ?? null;

    return {
      id: row.id,
      marks: row.marks,
      difficulty: row.difficulty,
      calculator: row.calculator,
      createdAt: row.created_at,
      chapterId: row.chapter_id ?? null,
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

  return NextResponse.json({ questions: withSigned });
}
