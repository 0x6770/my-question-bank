"use client";

import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "../../../../database.types";

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
};

type Feedback =
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type QuestionManagementProps = {
  initialChapters: ChapterRow[];
  initialQuestions: QuestionSummary[];
  loadError: string | null;
};

type FormImage = {
  id: string;
  url: string;
  file?: File;
};

function buildChapterLabelMap(chapters: ChapterRow[]) {
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const memo = new Map<number, string>();
  const fallbackSubjectName = "未分配学科";

  const computeLabel = (chapter: ChapterRow): string => {
    if (memo.has(chapter.id)) {
      const cachedLabel = memo.get(chapter.id);
      if (cachedLabel != null) {
        return cachedLabel;
      }
    }

    const parent =
      chapter.parent_chapter_id != null
        ? chapterMap.get(chapter.parent_chapter_id)
        : null;
    const parentLabel = parent
      ? computeLabel(parent)
      : (chapter.subject?.name ?? fallbackSubjectName);

    const label = `${parentLabel} > ${chapter.name}`;
    memo.set(chapter.id, label);
    return label;
  };

  const labelMap = new Map<number, string>();
  for (const chapter of chapters) {
    labelMap.set(chapter.id, computeLabel(chapter));
  }
  return labelMap;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function QuestionManagement({
  initialChapters,
  initialQuestions,
  loadError,
}: QuestionManagementProps) {
  const supabase = useMemo(() => createClient(), []);

  const chapterMap = useMemo(
    () => new Map(initialChapters.map((chapter) => [chapter.id, chapter])),
    [initialChapters],
  );

  const chapterLabelById = useMemo(
    () => buildChapterLabelMap(initialChapters),
    [initialChapters],
  );

  const chapterOptions = useMemo(
    () =>
      Array.from(chapterLabelById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [chapterLabelById],
  );

  const [questions, setQuestions] =
    useState<QuestionSummary[]>(initialQuestions);
  const [chapterId, setChapterId] = useState<string>("");
  const [marks, setMarks] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("2");
  const [calculatorAllowed, setCalculatorAllowed] = useState(false);
  const [images, setImages] = useState<FormImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(
    loadError
      ? {
          type: "error",
          message: loadError,
        }
      : null,
  );
  const [busyQuestionId, setBusyQuestionId] = useState<number | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(
    null,
  );
  const [editChapterId, setEditChapterId] = useState<string>("");
  const [editMarks, setEditMarks] = useState<string>("");
  const [editDifficulty, setEditDifficulty] = useState<string>("2");
  const [editCalculatorAllowed, setEditCalculatorAllowed] = useState(false);
  const [editImages, setEditImages] = useState<FormImage[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const chapterSelectRef = useRef<HTMLSelectElement>(null);
  const imageIdRef = useRef(0);
  const editImageIdRef = useRef(0);

  const uploadImageToStorage = async (file: File) => {
    const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
    const path = `questions/${crypto.randomUUID()}-${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage
      .from("question_images")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
    if (error || !data?.path) {
      throw new Error(error?.message ?? "上传图片失败，请稍后重试。");
    }
    const { data: publicUrlData } = supabase.storage
      .from("question_images")
      .getPublicUrl(data.path);
    if (!publicUrlData?.publicUrl) {
      throw new Error("无法获取图片访问链接。");
    }
    return {
      publicUrl: publicUrlData.publicUrl,
      path: data.path,
    };
  };

  const uploadImagesIfNeeded = async (list: FormImage[]) => {
    const results: FormImage[] = [];
    for (const image of list) {
      if (image.file) {
        const { publicUrl } = await uploadImageToStorage(image.file);
        results.push({
          ...image,
          url: publicUrl,
          file: undefined,
        });
      } else {
        results.push(image);
      }
    }
    return results;
  };

  const resetForm = () => {
    setChapterId("");
    setMarks("");
    setDifficulty("2");
    setCalculatorAllowed(false);
    setImages([]);
    chapterSelectRef.current?.focus();
  };

  const handleAddImageFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    const next: FormImage[] = Array.from(files).map((file) => ({
      id: `local-${imageIdRef.current++}`,
      url: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...next]);
    event.target.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    setImages((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const chosenChapterId =
      chapterId === "" ? null : Number.parseInt(chapterId, 10);
    const trimmedMarks = marks.trim();
    const parsedMarks =
      trimmedMarks === "" ? Number.NaN : Number.parseInt(trimmedMarks, 10);
    const parsedDifficulty =
      difficulty === "" ? Number.NaN : Number.parseInt(difficulty, 10);

    if (!chosenChapterId) {
      setFeedback({
        type: "error",
        message: "请选择所属章节。",
      });
      return;
    }

    if (
      !Number.isFinite(parsedDifficulty) ||
      parsedDifficulty < 1 ||
      parsedDifficulty > 4
    ) {
      setFeedback({
        type: "error",
        message: "请选择正确的难度（1 至 4）。",
      });
      return;
    }

    if (!Number.isFinite(parsedMarks) || parsedMarks <= 0) {
      setFeedback({
        type: "error",
        message: "请填写大于 0 的分值。",
      });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    let readyImages: FormImage[] = [];
    try {
      readyImages = await uploadImagesIfNeeded(images);
    } catch (error) {
      setIsSubmitting(false);
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "上传图片时出现问题。",
      });
      return;
    }

    const { data: question, error: insertError } = await supabase
      .from("questions")
      .insert({
        chapter_id: chosenChapterId,
        difficulty: parsedDifficulty,
        calculator: calculatorAllowed,
        marks: parsedMarks,
      })
      .select("id, chapter_id, created_at, marks, difficulty, calculator")
      .single();

    if (insertError || !question) {
      setIsSubmitting(false);
      setFeedback({
        type: "error",
        message: insertError?.message ?? "创建题目时出现问题。",
      });
      return;
    }

    const createdQuestionId = question.id;
    let insertedImages: QuestionSummary["images"] | null = null;

    if (readyImages.length > 0) {
      const { data: imageRows, error: imageError } = await supabase
        .from("question_images")
        .insert(
          readyImages.map((image, index) => ({
            question_id: createdQuestionId,
            storage_path: image.url,
            position: index + 1,
          })),
        )
        .select("id, storage_path, position");

      if (imageError) {
        await supabase.from("questions").delete().eq("id", createdQuestionId);
        setIsSubmitting(false);
        setFeedback({
          type: "error",
          message: imageError.message ?? "保存图片列表失败，稍后重试。",
        });
        return;
      }

      insertedImages = (imageRows ?? []).slice().sort((a, b) => {
        return a.position - b.position;
      });
    }

    const chapter = chosenChapterId
      ? (chapterMap.get(chosenChapterId) ?? null)
      : null;

    const newQuestion: QuestionSummary = {
      id: createdQuestionId,
      chapterId: question.chapter_id,
      chapterName: chapter?.name ?? null,
      subjectName: chapter?.subject?.name ?? null,
      createdAt: question.created_at,
      difficulty: question.difficulty,
      calculator: question.calculator,
      marks: question.marks,
      images: insertedImages ?? [],
    };

    setQuestions((prev) => [newQuestion, ...prev]);
    setFeedback({
      type: "success",
      message: "题目已创建成功。",
    });
    setIsSubmitting(false);
    resetForm();
  };

  const handleDelete = async (questionId: number) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question) {
      return;
    }

    const confirmed = window.confirm(
      `确定要删除题目 #${question.id} 吗？此操作不可撤销。`,
    );
    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setBusyQuestionId(questionId);
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", questionId);
    setBusyQuestionId(null);

    if (error) {
      setFeedback({
        type: "error",
        message: error.message ?? "删除题目时出现问题。",
      });
      return;
    }

    setQuestions((prev) => prev.filter((item) => item.id !== questionId));
    setFeedback({
      type: "success",
      message: "题目已删除。",
    });
  };

  const beginEdit = (question: QuestionSummary) => {
    setFeedback(null);
    setEditingQuestionId(question.id);
    setEditChapterId(question.chapterId ? String(question.chapterId) : "");
    setEditMarks(String(question.marks));
    setEditDifficulty(String(question.difficulty));
    setEditCalculatorAllowed(question.calculator);
    editImageIdRef.current = 0;
    const sortedImages = question.images
      .slice()
      .sort((a, b) => a.position - b.position);
    setEditImages(
      sortedImages.map((image) => ({
        id: `existing-${image.id}`,
        url: image.storage_path,
      })),
    );
  };

  const cancelEdit = () => {
    setEditingQuestionId(null);
    setEditImages([]);
    setIsUpdating(false);
  };

  const handleEditAddImageFiles = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) return;
    const next: FormImage[] = Array.from(files).map((file) => ({
      id: `edit-${editImageIdRef.current++}`,
      url: URL.createObjectURL(file),
      file,
    }));
    setEditImages((prev) => [...prev, ...next]);
    event.target.value = "";
  };

  const handleEditRemoveImage = (index: number) => {
    setEditImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveEditImage = (index: number, direction: "up" | "down") => {
    setEditImages((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingQuestionId) {
      return;
    }

    const chosenChapterId =
      editChapterId === "" ? null : Number.parseInt(editChapterId, 10);
    const trimmedMarks = editMarks.trim();
    const parsedMarks =
      trimmedMarks === "" ? Number.NaN : Number.parseInt(trimmedMarks, 10);
    const parsedDifficulty =
      editDifficulty === "" ? Number.NaN : Number.parseInt(editDifficulty, 10);

    if (!chosenChapterId) {
      setFeedback({
        type: "error",
        message: "请选择所属章节。",
      });
      return;
    }

    if (
      !Number.isFinite(parsedDifficulty) ||
      parsedDifficulty < 1 ||
      parsedDifficulty > 4
    ) {
      setFeedback({
        type: "error",
        message: "请选择正确的难度（1 至 4）。",
      });
      return;
    }

    if (!Number.isFinite(parsedMarks) || parsedMarks <= 0) {
      setFeedback({
        type: "error",
        message: "请填写大于 0 的分值。",
      });
      return;
    }

    setFeedback(null);
    setIsUpdating(true);

    let readyImages: FormImage[] = [];
    try {
      readyImages = await uploadImagesIfNeeded(editImages);
    } catch (error) {
      setIsUpdating(false);
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "上传图片时出现问题。",
      });
      return;
    }

    const { data: questionRow, error: updateError } = await supabase
      .from("questions")
      .update({
        chapter_id: chosenChapterId,
        difficulty: parsedDifficulty,
        calculator: editCalculatorAllowed,
        marks: parsedMarks,
      })
      .eq("id", editingQuestionId)
      .select("id, chapter_id, created_at, marks, difficulty, calculator")
      .single();

    if (updateError || !questionRow) {
      setIsUpdating(false);
      setFeedback({
        type: "error",
        message: updateError?.message ?? "更新题目时出现问题。",
      });
      return;
    }

    const { error: deleteImagesError } = await supabase
      .from("question_images")
      .delete()
      .eq("question_id", editingQuestionId);

    if (deleteImagesError) {
      setIsUpdating(false);
      setFeedback({
        type: "error",
        message: deleteImagesError.message ?? "更新图片列表失败。",
      });
      return;
    }

    let nextImages: QuestionSummary["images"] = [];

    if (readyImages.length > 0) {
      const { data: newImages, error: insertImagesError } = await supabase
        .from("question_images")
        .insert(
          readyImages.map((image, index) => ({
            question_id: editingQuestionId,
            storage_path: image.url,
            position: index + 1,
          })),
        )
        .select("id, storage_path, position");

      if (insertImagesError) {
        setIsUpdating(false);
        setFeedback({
          type: "error",
          message: insertImagesError.message ?? "保存图片列表失败，稍后重试。",
        });
        return;
      }

      nextImages = (newImages ?? []).slice().sort((a, b) => {
        return a.position - b.position;
      });
    }

    const chapter = chosenChapterId
      ? (chapterMap.get(chosenChapterId) ?? null)
      : null;

    setQuestions((prev) =>
      prev.map((item) =>
        item.id === editingQuestionId
          ? {
              ...item,
              chapterId: questionRow.chapter_id,
              chapterName: chapter?.name ?? null,
              subjectName: chapter?.subject?.name ?? null,
              difficulty: questionRow.difficulty,
              calculator: questionRow.calculator,
              marks: questionRow.marks,
              images: nextImages,
            }
          : item,
      ),
    );

    setFeedback({
      type: "success",
      message: "题目已更新。",
    });
    setIsUpdating(false);
    cancelEdit();
  };

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    chapterSelectRef.current?.focus();
  };

  const getChapterLabel = (question: QuestionSummary) => {
    if (!question.chapterId) {
      return null;
    }
    const label = chapterLabelById.get(question.chapterId);
    if (label) {
      return label;
    }
    if (question.subjectName && question.chapterName) {
      return `${question.subjectName} > ${question.chapterName}`;
    }
    return question.chapterName ?? null;
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Question Management
          </h1>
          <p className="text-sm text-slate-500">
            创建题目、上传图片并关联章节来构建题库。
          </p>
        </div>
        <Button onClick={scrollToForm} className="gap-2">
          <Plus className="size-4" />
          New Question
        </Button>
      </header>

      {feedback ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>创建新题目</CardTitle>
          <CardDescription>选择章节并上传按顺序展示的图片。</CardDescription>
        </CardHeader>

        <form ref={formRef} onSubmit={handleCreate} className="space-y-6">
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="question-chapter">Chapter</Label>
              <select
                id="question-chapter"
                ref={chapterSelectRef}
                value={chapterId}
                onChange={(event) => setChapterId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <option value="">Select a chapter</option>
                {chapterOptions.map((chapterOption) => (
                  <option key={chapterOption.id} value={chapterOption.id}>
                    {chapterOption.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="question-marks">Marks</Label>
                <Input
                  id="question-marks"
                  type="number"
                  min={1}
                  step={1}
                  value={marks}
                  onChange={(event) => setMarks(event.target.value)}
                  placeholder="请输入分值（正整数）"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="question-difficulty">Difficulty</Label>
                <select
                  id="question-difficulty"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
                >
                  <option value="1">较易 (1)</option>
                  <option value="2">中等 (2)</option>
                  <option value="3">较难 (3)</option>
                  <option value="4">挑战 (4)</option>
                </select>
              </div>
            </div>
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                <input
                  type="checkbox"
                  checked={calculatorAllowed}
                  onChange={(event) =>
                    setCalculatorAllowed(event.target.checked)
                  }
                  className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                />
                <div className="flex flex-col">
                  <span className="font-medium text-slate-800">
                    允许使用计算器
                  </span>
                  <span className="text-xs text-slate-500">
                    勾选表示此题可以使用计算器。
                  </span>
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="question-image">Images (Vertical Stack)</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    id="question-image"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAddImageFiles}
                    className="max-w-xl flex-1"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  选择一张或多张图片上传，按列表顺序显示，可上下调整顺序。
                </p>
              </div>

              {images.length > 0 ? (
                <ul className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                  {images.map((image, index) => (
                    <li
                      key={image.id}
                      className="flex flex-col gap-2 rounded-lg bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500">
                          {index + 1}
                        </span>
                        <div className="flex h-20 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                          <Image
                            src={image.url}
                            alt={`预览 ${index + 1}`}
                            width={200}
                            height={140}
                            className="h-full w-full object-contain"
                            sizes="160px"
                            unoptimized
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => moveImage(index, "up")}
                          disabled={index === 0}
                          aria-label="Move image up"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => moveImage(index, "down")}
                          disabled={index === images.length - 1}
                          aria-label="Move image down"
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveImage(index)}
                          aria-label="Remove image"
                        >
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CardContent>
          <CardFooter className="gap-3 border-t border-slate-200">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Create
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </CardFooter>
        </form>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <ScrollText className="size-4" />
          <span>题目列表</span>
        </div>
        {questions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            目前还没有题目，先在上方创建第一题吧。
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question) => (
              <Card key={question.id} className="border-slate-200">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-base font-semibold text-slate-800">
                    Question #{question.id}
                  </CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-3 text-xs">
                    <span>创建于：{formatDateTime(question.createdAt)}</span>
                    {(() => {
                      const chapterLabel = getChapterLabel(question);
                      return chapterLabel ? (
                        <Badge variant="outline">{chapterLabel}</Badge>
                      ) : (
                        <Badge variant="secondary">未设置章节</Badge>
                      );
                    })()}
                    <Badge
                      variant={question.calculator ? "outline" : "secondary"}
                    >
                      {question.calculator ? "可用计算器" : "禁用计算器"}
                    </Badge>
                    <span className="flex items-center gap-1 text-slate-500">
                      <ScrollText className="size-4" />
                      难度 {question.difficulty}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <ScrollText className="size-4" />
                      {question.marks} 分
                    </span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <ImageIcon className="size-4" />
                      {`${question.images.length} image${
                        question.images.length === 1 ? "" : "s"
                      }`}
                    </span>
                  </CardDescription>
                  <CardAction className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title="Edit question"
                      onClick={() => beginEdit(question)}
                      disabled={isUpdating && editingQuestionId === question.id}
                    >
                      {isUpdating && editingQuestionId === question.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Pencil className="size-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      title="Delete question"
                      onClick={() => handleDelete(question.id)}
                      disabled={busyQuestionId === question.id}
                    >
                      {busyQuestionId === question.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-red-500" />
                      )}
                    </Button>
                  </CardAction>
                </CardHeader>
                {question.images.length > 0 &&
                editingQuestionId !== question.id ? (
                  <div className="border-t border-slate-100 bg-slate-50/60">
                    <div className="flex gap-3 overflow-x-auto px-4 py-3">
                      {question.images.map((image) => (
                        <div
                          key={image.id}
                          className="flex h-32 min-w-[160px] max-w-[220px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                          title={`Image ${image.position}`}
                        >
                          <Image
                            src={image.storage_path}
                            alt={`Question ${question.id} image ${image.position}`}
                            width={320}
                            height={320}
                            className="h-full w-full object-contain"
                            sizes="(max-width: 768px) 60vw, 320px"
                            unoptimized
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {editingQuestionId === question.id ? (
                  <form onSubmit={handleUpdate} className="space-y-4 p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-chapter">Chapter</Label>
                        <select
                          id="edit-chapter"
                          value={editChapterId}
                          onChange={(event) =>
                            setEditChapterId(event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
                        >
                          <option value="">Select a chapter</option>
                          {chapterOptions.map((chapterOption) => (
                            <option
                              key={chapterOption.id}
                              value={chapterOption.id}
                            >
                              {chapterOption.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-marks">Marks</Label>
                        <Input
                          id="edit-marks"
                          type="number"
                          min={1}
                          step={1}
                          value={editMarks}
                          onChange={(event) => setEditMarks(event.target.value)}
                          placeholder="请输入分值（正整数）"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-difficulty">Difficulty</Label>
                        <select
                          id="edit-difficulty"
                          value={editDifficulty}
                          onChange={(event) =>
                            setEditDifficulty(event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
                        >
                          <option value="1">较易 (1)</option>
                          <option value="2">中等 (2)</option>
                          <option value="3">较难 (3)</option>
                          <option value="4">挑战 (4)</option>
                        </select>
                      </div>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                        <input
                          type="checkbox"
                          checked={editCalculatorAllowed}
                          onChange={(event) =>
                            setEditCalculatorAllowed(event.target.checked)
                          }
                          className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                        />
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800">
                            允许使用计算器
                          </span>
                          <span className="text-xs text-slate-500">
                            勾选表示此题可以使用计算器。
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="edit-image">
                          Images (Vertical Stack)
                        </Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Input
                            id="edit-image"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleEditAddImageFiles}
                            className="max-w-xl flex-1"
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          选择一张或多张图片上传，按列表顺序显示，可上下调整顺序。
                        </p>
                      </div>

                      {editImages.length > 0 ? (
                        <ul className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                          {editImages.map((image, index) => (
                            <li
                              key={image.id}
                              className="flex flex-col gap-2 rounded-lg bg-white p-3 shadow-sm"
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex size-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500">
                                  {index + 1}
                                </span>
                                <div className="flex h-20 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                                  <Image
                                    src={image.url}
                                    alt={`预览 ${index + 1}`}
                                    width={200}
                                    height={140}
                                    className="h-full w-full object-contain"
                                    sizes="160px"
                                    unoptimized
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => moveEditImage(index, "up")}
                                  disabled={index === 0}
                                  aria-label="Move image up"
                                >
                                  <ArrowUp className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => moveEditImage(index, "down")}
                                  disabled={index === editImages.length - 1}
                                  aria-label="Move image down"
                                >
                                  <ArrowDown className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleEditRemoveImage(index)}
                                  aria-label="Remove image"
                                >
                                  <Trash2 className="size-4 text-red-500" />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
                      <Button
                        type="submit"
                        disabled={isUpdating}
                        className="gap-2"
                      >
                        {isUpdating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={isUpdating}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
