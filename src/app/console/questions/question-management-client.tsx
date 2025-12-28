"use client";

import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QuestionCard } from "@/components/question-card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type TreeNode, TreeSelect } from "@/components/ui/tree-select";
import { QUESTION_BANK, type QuestionBank } from "@/lib/question-bank";
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
  chapterIds: number[]; // Array of chapter IDs (supports multiple question banks)
  chapterName: string | null; // Primary chapter name for display
  subjectName: string | null; // Primary subject name for display
  createdAt: string;
  difficulty: number;
  calculator: boolean;
  marks: number;
  images: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl?: string | null;
  }[];
  answerImages: {
    id: number;
    storage_path: string;
    position: number;
    signedUrl?: string | null;
  }[];
};

type Feedback =
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type ExamBoardRow = {
  id: number;
  question_bank: string;
};

type AllChapterRow = {
  id: number;
  name: string;
  subject_id: number;
  parent_chapter_id: number | null;
  position: number;
  subject: { id: number; name: string } | null;
  exam_board_id: number;
};

type QuestionManagementProps = {
  initialChapters: ChapterRow[];
  allChapters: AllChapterRow[]; // All chapters from both question banks
  allExamBoards: ExamBoardRow[]; // All exam boards to identify question banks
  initialQuestions: QuestionSummary[];
  initialHasMore: boolean;
  questionBank: QuestionBank;
  loadError: string | null;
};

type FormImage = {
  id: string;
  url: string;
  storagePath?: string;
  file?: File;
};

const _PAGE_SIZE = 20;

type QuestionApiResponse = {
  questions: Array<{
    id: number;
    marks: number;
    difficulty: number;
    calculator: boolean;
    createdAt: string;
    chapterIds: number[]; // Array of chapter IDs
    chapterName?: string | null;
    subjectName?: string | null;
    subjectId?: number | null;
    images: {
      id: number;
      storage_path: string;
      position: number;
      signedUrl?: string | null;
    }[];
    answerImages: {
      id: number;
      storage_path: string;
      position: number;
      signedUrl?: string | null;
    }[];
  }>;
  hasMore?: boolean;
  page?: number;
};

function buildChapterLabelMap(chapters: ChapterRow[]) {
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const memo = new Map<number, string>();
  const fallbackSubjectName = "Unassigned subject";

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

function isBlobUrl(value: string) {
  return value.startsWith("blob:");
}

// Build tree structure from chapters grouped by subject
function buildChapterTree(
  chapters: { id: number; label: string }[],
  allChapters: AllChapterRow[],
): TreeNode[] {
  // Group chapters by subject
  const subjectMap = new Map<
    number,
    { name: string; chapterIds: Set<number> }
  >();

  for (const chapter of chapters) {
    const fullChapter = allChapters.find((ch) => ch.id === chapter.id);
    if (!fullChapter?.subject) continue;

    const subjectId = fullChapter.subject.id;
    const subjectName = fullChapter.subject.name;

    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, { name: subjectName, chapterIds: new Set() });
    }
    subjectMap.get(subjectId)?.chapterIds.add(chapter.id);
  }

  // Helper function to build chapter hierarchy
  const buildChapterHierarchy = (
    subjectId: number,
    chapterIds: Set<number>,
  ): TreeNode[] => {
    // Get all chapters for this subject that are in our filtered list
    const subjectChapters = allChapters.filter(
      (ch) => ch.subject_id === subjectId && chapterIds.has(ch.id),
    );

    // Build a map of parent_id -> children
    const childrenMap = new Map<number | null, AllChapterRow[]>();
    for (const chapter of subjectChapters) {
      const parentId = chapter.parent_chapter_id;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(chapter);
    }

    // Recursive function to build tree nodes
    const buildNode = (chapter: AllChapterRow): TreeNode => {
      const children = childrenMap.get(chapter.id) || [];

      if (children.length === 0) {
        // Leaf node - can be selected
        return {
          id: chapter.id,
          label: chapter.name,
          value: chapter.id,
        };
      } else {
        // Parent node - has children, not selectable
        return {
          id: chapter.id,
          label: chapter.name,
          children: children
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map(buildNode),
        };
      }
    };

    // Get root chapters (parent_chapter_id is null)
    const rootChapters = childrenMap.get(null) || [];
    return rootChapters
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(buildNode);
  };

  // Convert to tree structure
  const tree: TreeNode[] = [];
  for (const [subjectId, { name, chapterIds }] of subjectMap) {
    const chapterTree = buildChapterHierarchy(subjectId, chapterIds);

    tree.push({
      id: `subject-${subjectId}`,
      label: name,
      children: chapterTree,
    });
  }

  return tree.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

export function QuestionManagement({
  initialChapters,
  allChapters,
  allExamBoards,
  initialQuestions,
  initialHasMore,
  questionBank,
  loadError,
}: QuestionManagementProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [signedUrlCache, setSignedUrlCache] = useState<Record<string, string>>(
    {},
  );

  const [chapters, setChapters] = useState<ChapterRow[]>(initialChapters);
  const [questions, setQuestions] =
    useState<QuestionSummary[]>(initialQuestions);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);

  // Update state when props change (e.g., when switching question bank tabs)
  useEffect(() => {
    setChapters(initialChapters);
    setQuestions(initialQuestions);
    setHasMore(initialHasMore);
    setPage(1);
    setEditingQuestionId(null);
    setBusyQuestionId(null);
    setPastPaperChapterId(null);
    setTypicalChapterId(null);
    setMarks("");
    setDifficulty("2");
    setCalculatorAllowed(false);
    setImages([]);
    setAnswerImages([]);
  }, [initialChapters, initialQuestions, initialHasMore]);

  const chapterMap = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter])),
    [chapters],
  );

  const chapterLabelById = useMemo(
    () => buildChapterLabelMap(chapters),
    [chapters],
  );

  const _chapterOptions = useMemo(
    () =>
      Array.from(chapterLabelById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [chapterLabelById],
  );

  // Filter chapters by question bank
  const pastPaperExamBoardIds = useMemo(
    () =>
      allExamBoards
        .filter(
          (board) => board.question_bank === QUESTION_BANK.PAST_PAPER_QUESTIONS,
        )
        .map((board) => board.id),
    [allExamBoards],
  );

  const typicalExamBoardIds = useMemo(
    () =>
      allExamBoards
        .filter(
          (board) => board.question_bank === QUESTION_BANK.TOPICAL_QUESTIONS,
        )
        .map((board) => board.id),
    [allExamBoards],
  );

  const pastPaperChapters = useMemo(
    () =>
      allChapters
        .filter((ch) =>
          ch.exam_board_id
            ? pastPaperExamBoardIds.includes(ch.exam_board_id)
            : false,
        )
        .map((ch) => ({
          id: ch.id,
          label: chapterLabelById.get(ch.id) ?? ch.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [allChapters, pastPaperExamBoardIds, chapterLabelById],
  );

  const typicalChapters = useMemo(
    () =>
      allChapters
        .filter((ch) =>
          ch.exam_board_id
            ? typicalExamBoardIds.includes(ch.exam_board_id)
            : false,
        )
        .map((ch) => ({
          id: ch.id,
          label: chapterLabelById.get(ch.id) ?? ch.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [allChapters, typicalExamBoardIds, chapterLabelById],
  );

  // Build tree data for TreeSelect
  const pastPaperTree = useMemo(
    () => buildChapterTree(pastPaperChapters, allChapters),
    [pastPaperChapters, allChapters],
  );

  const typicalTree = useMemo(
    () => buildChapterTree(typicalChapters, allChapters),
    [typicalChapters, allChapters],
  );
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Separate state for each question bank's chapter selection
  const [pastPaperChapterId, setPastPaperChapterId] = useState<number | null>(
    null,
  );
  const [typicalChapterId, setTypicalChapterId] = useState<number | null>(null);

  const [marks, setMarks] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("2");
  const [calculatorAllowed, setCalculatorAllowed] = useState(true);
  const [images, setImages] = useState<FormImage[]>([]);
  const [answerImages, setAnswerImages] = useState<FormImage[]>([]);
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

  // Separate state for editing each question bank's chapter selection
  const [editPastPaperChapterId, setEditPastPaperChapterId] = useState<
    number | null
  >(null);
  const [editTypicalChapterId, setEditTypicalChapterId] = useState<
    number | null
  >(null);

  const [editMarks, setEditMarks] = useState<string>("");
  const [editDifficulty, setEditDifficulty] = useState<string>("2");
  const [editCalculatorAllowed, setEditCalculatorAllowed] = useState(false);
  const [editImages, setEditImages] = useState<FormImage[]>([]);
  const [editAnswerImages, setEditAnswerImages] = useState<FormImage[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const imageIdRef = useRef(0);
  const editImageIdRef = useRef(0);
  const answerImageIdRef = useRef(0);
  const editAnswerImageIdRef = useRef(0);

  const resolveImageSrc = (storagePath: string) => {
    if (isBlobUrl(storagePath)) {
      return storagePath;
    }
    return signedUrlCache[storagePath];
  };

  const mapApiQuestions = useCallback(
    (apiQuestions: QuestionApiResponse["questions"]): QuestionSummary[] =>
      apiQuestions.map((item) => {
        // Use first chapter as primary for display
        const primaryChapterId = item.chapterIds[0] ?? null;
        const chapter = primaryChapterId
          ? (chapterMap.get(primaryChapterId) ?? null)
          : null;
        const resolvedChapterName = item.chapterName ?? chapter?.name ?? null;
        const resolvedSubjectName =
          item.subjectName ?? chapter?.subject?.name ?? null;

        return {
          id: item.id,
          chapterIds: item.chapterIds,
          chapterName: resolvedChapterName,
          subjectName: resolvedSubjectName,
          createdAt: item.createdAt,
          difficulty: item.difficulty,
          calculator: item.calculator,
          marks: item.marks,
          images: item.images.map((image) => ({
            id: image.id,
            storage_path: image.storage_path,
            position: image.position,
            signedUrl: image.signedUrl,
          })),
          answerImages: item.answerImages.map((image) => ({
            id: image.id,
            storage_path: image.storage_path,
            position: image.position,
            signedUrl: image.signedUrl,
          })),
        };
      }),
    [chapterMap],
  );

  const getTabValue = useCallback((bank: QuestionBank): string => {
    if (bank === QUESTION_BANK.TOPICAL_QUESTIONS) return "typical";
    if (bank === QUESTION_BANK.EXAM_PAPER) return "exam-paper";
    return "past-paper";
  }, []);

  const primeSignedUrlCache = useCallback((list: QuestionSummary[]) => {
    const nextCache: Record<string, string> = {};
    for (const question of list) {
      for (const image of question.images) {
        if (image.signedUrl) {
          nextCache[image.storage_path] = image.signedUrl;
        }
      }
      for (const image of question.answerImages) {
        if (image.signedUrl) {
          nextCache[image.storage_path] = image.signedUrl;
        }
      }
    }
    if (Object.keys(nextCache).length > 0) {
      setSignedUrlCache((prev) => ({ ...prev, ...nextCache }));
    }
  }, []);

  const loadQuestionsPage = useCallback(
    async (targetPage: number) => {
      const safePage = Math.max(1, targetPage);
      setIsLoadingQuestions(true);
      setListError(null);
      try {
        const bankValue = getTabValue(questionBank);
        const response = await fetch(
          `/api/questions?page=${safePage}&bank=${bankValue}`,
        );
        if (!response.ok) {
          throw new Error(
            "Failed to load question list, please try again later.",
          );
        }
        const data = (await response.json()) as QuestionApiResponse;
        const mapped = mapApiQuestions(data.questions ?? []);
        setQuestions(mapped);
        setHasMore(Boolean(data.hasMore));
        setPage(data.page && data.page > 0 ? data.page : safePage);
        setBusyQuestionId(null);
        setEditingQuestionId(null);
        setEditImages([]);
        setEditAnswerImages([]);
        setIsUpdating(false);
        primeSignedUrlCache(mapped);
      } catch (error) {
        setListError(
          error instanceof Error
            ? error.message
            : "Failed to load question list, please try again later.",
        );
      } finally {
        setIsLoadingQuestions(false);
      }
    },
    [mapApiQuestions, primeSignedUrlCache, questionBank, getTabValue],
  );

  useEffect(() => {
    const questionPaths = new Set<string>();
    const answerPaths = new Set<string>();
    for (const question of questions) {
      for (const image of question.images) {
        if (isBlobUrl(image.storage_path)) {
          continue;
        }
        if (image.signedUrl) {
          continue;
        }
        if (!signedUrlCache[image.storage_path]) {
          questionPaths.add(image.storage_path);
        }
      }
      for (const image of question.answerImages) {
        if (isBlobUrl(image.storage_path)) {
          continue;
        }
        if (image.signedUrl) {
          continue;
        }
        if (!signedUrlCache[image.storage_path]) {
          answerPaths.add(image.storage_path);
        }
      }
    }
    if (questionPaths.size === 0 && answerPaths.size === 0) {
      return;
    }

    let cancelled = false;
    const fetchSignedUrls = async () => {
      const nextCache: Record<string, string> = {};

      if (questionPaths.size > 0) {
        const { data, error } = await supabase.storage
          .from("question_images")
          .createSignedUrls(Array.from(questionPaths), 3600);
        if (!cancelled && !error && data) {
          for (const item of data) {
            if (item.path && item.signedUrl) {
              nextCache[item.path] = item.signedUrl;
            }
          }
        }
      }

      if (answerPaths.size > 0) {
        const { data, error } = await supabase.storage
          .from("answer_images")
          .createSignedUrls(Array.from(answerPaths), 3600);
        if (!cancelled && !error && data) {
          for (const item of data) {
            if (item.path && item.signedUrl) {
              nextCache[item.path] = item.signedUrl;
            }
          }
        }
      }

      if (cancelled) return;
      if (Object.keys(nextCache).length === 0) return;
      setSignedUrlCache((prev) => ({ ...prev, ...nextCache }));
    };

    void fetchSignedUrls();

    return () => {
      cancelled = true;
    };
  }, [questions, supabase, signedUrlCache]);

  const uploadImageToStorage = async (file: File, bucket: string) => {
    const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
    const path = `questions/${crypto.randomUUID()}-${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
    if (error || !data?.path) {
      throw new Error(
        error?.message ?? "Image upload failed, please try again later.",
      );
    }
    return {
      path: data.path,
    };
  };

  const uploadImagesIfNeeded = async (list: FormImage[], bucket: string) => {
    const results: FormImage[] = [];
    for (const image of list) {
      if (image.file) {
        const { path } = await uploadImageToStorage(image.file, bucket);
        results.push({
          ...image,
          storagePath: path,
          file: undefined,
        });
      } else {
        results.push(image);
      }
    }
    return results;
  };

  const resetForm = () => {
    setPastPaperChapterId(null);
    setTypicalChapterId(null);
    setMarks("");
    setDifficulty("2");
    setCalculatorAllowed(false);
    setImages([]);
    setAnswerImages([]);
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

  const handleAddAnswerImageFiles = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) return;
    const next: FormImage[] = Array.from(files).map((file) => ({
      id: `local-answer-${answerImageIdRef.current++}`,
      url: URL.createObjectURL(file),
      file,
    }));
    setAnswerImages((prev) => [...prev, ...next]);
    event.target.value = "";
  };

  const handleRemoveAnswerImage = (index: number) => {
    setAnswerImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveAnswerImage = (index: number, direction: "up" | "down") => {
    setAnswerImages((prev) => {
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

    const trimmedMarks = marks.trim();
    const parsedMarks =
      trimmedMarks === "" ? Number.NaN : Number.parseInt(trimmedMarks, 10);
    const parsedDifficulty =
      difficulty === "" ? Number.NaN : Number.parseInt(difficulty, 10);

    // Merge chapter selections from both question banks
    const chapterIds = [pastPaperChapterId, typicalChapterId].filter(
      (id): id is number => id !== null,
    );

    if (chapterIds.length === 0) {
      setFeedback({
        type: "error",
        message: "Please select at least one chapter.",
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
        message: "Please select a valid difficulty (1 to 4).",
      });
      return;
    }

    if (!Number.isFinite(parsedMarks) || parsedMarks <= 0) {
      setFeedback({
        type: "error",
        message: "Please enter a score greater than 0.",
      });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    let readyImages: FormImage[] = [];
    let readyAnswerImages: FormImage[] = [];
    try {
      readyImages = await uploadImagesIfNeeded(images, "question_images");
      readyAnswerImages = await uploadImagesIfNeeded(
        answerImages,
        "answer_images",
      );
    } catch (error) {
      setIsSubmitting(false);
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "There was an issue uploading images.",
      });
      return;
    }

    // Use database function to create question with multiple chapters
    const { data: createdQuestionId, error: insertError } = await supabase.rpc(
      "create_question_with_chapters",
      {
        p_marks: parsedMarks,
        p_difficulty: parsedDifficulty,
        p_calculator: calculatorAllowed,
        p_chapter_ids: chapterIds,
      },
    );

    if (insertError || !createdQuestionId) {
      setIsSubmitting(false);
      setFeedback({
        type: "error",
        message:
          insertError?.message ?? "There was an issue creating the question.",
      });
      return;
    }
    let _insertedImages: QuestionSummary["images"] | null = null;
    let _insertedAnswerImages: QuestionSummary["answerImages"] | null = null;

    if (readyImages.length > 0) {
      const { data: imageRows, error: imageError } = await supabase
        .from("question_images")
        .insert(
          readyImages.map((image, index) => ({
            question_id: createdQuestionId,
            storage_path: image.storagePath ?? image.url,
            position: index + 1,
          })),
        )
        .select("id, storage_path, position");

      if (imageError) {
        await supabase.from("questions").delete().eq("id", createdQuestionId);
        setIsSubmitting(false);
        setFeedback({
          type: "error",
          message:
            imageError.message ??
            "Failed to save image list, please try again.",
        });
        return;
      }

      _insertedImages = (imageRows ?? []).slice().sort((a, b) => {
        return a.position - b.position;
      });
    }

    if (readyAnswerImages.length > 0) {
      const { data: answerRows, error: answerError } = await supabase
        .from("answer_images")
        .insert(
          readyAnswerImages.map((image, index) => ({
            question_id: createdQuestionId,
            storage_path: image.storagePath ?? image.url,
            position: index + 1,
          })),
        )
        .select("id, storage_path, position");

      if (answerError) {
        await supabase.from("questions").delete().eq("id", createdQuestionId);
        setIsSubmitting(false);
        setFeedback({
          type: "error",
          message:
            answerError.message ??
            "Failed to save answer images, please try again.",
        });
        return;
      }

      _insertedAnswerImages = (answerRows ?? []).slice().sort((a, b) => {
        return a.position - b.position;
      });
    }

    setFeedback({
      type: "success",
      message: "Question created successfully.",
    });
    setIsSubmitting(false);
    resetForm();
    setPage(1);
    void loadQuestionsPage(1);
  };

  const handleDelete = async (questionId: number) => {
    const question = questions.find((item) => item.id === questionId);
    if (!question) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete question #${question.id}? This action cannot be undone.`,
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
        message: error.message ?? "There was an issue deleting the question.",
      });
      return;
    }

    const nextPage = questions.length <= 1 && page > 1 ? page - 1 : page;
    setQuestions((prev) => prev.filter((item) => item.id !== questionId));
    setFeedback({
      type: "success",
      message: "Question deleted.",
    });
    setPage(nextPage);
    void loadQuestionsPage(nextPage);
  };

  const beginEdit = (question: QuestionSummary) => {
    setFeedback(null);
    setEditingQuestionId(question.id);

    // Separate chapterIds into two question banks
    const pastPaperId = question.chapterIds.find((id) => {
      const chapter = allChapters.find((ch) => ch.id === id);
      return (
        chapter?.exam_board_id &&
        pastPaperExamBoardIds.includes(chapter.exam_board_id)
      );
    });
    const typicalId = question.chapterIds.find((id) => {
      const chapter = allChapters.find((ch) => ch.id === id);
      return (
        chapter?.exam_board_id &&
        typicalExamBoardIds.includes(chapter.exam_board_id)
      );
    });

    setEditPastPaperChapterId(pastPaperId ?? null);
    setEditTypicalChapterId(typicalId ?? null);

    setEditMarks(String(question.marks));
    setEditDifficulty(String(question.difficulty));
    setEditCalculatorAllowed(question.calculator);
    editImageIdRef.current = 0;
    editAnswerImageIdRef.current = 0;
    const sortedImages = question.images
      .slice()
      .sort((a, b) => a.position - b.position);
    setEditImages(
      sortedImages.map((image) => ({
        id: `existing-${image.id}`,
        url: image.storage_path,
        storagePath: image.storage_path,
      })),
    );

    const sortedAnswerImages = question.answerImages
      .slice()
      .sort((a, b) => a.position - b.position);
    setEditAnswerImages(
      sortedAnswerImages.map((image) => ({
        id: `existing-answer-${image.id}`,
        url: image.storage_path,
        storagePath: image.storage_path,
      })),
    );
  };

  const cancelEdit = () => {
    setEditingQuestionId(null);
    setEditImages([]);
    setEditAnswerImages([]);
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

  const handleEditAddAnswerImageFiles = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) return;
    const next: FormImage[] = Array.from(files).map((file) => ({
      id: `edit-answer-${editAnswerImageIdRef.current++}`,
      url: URL.createObjectURL(file),
      file,
    }));
    setEditAnswerImages((prev) => [...prev, ...next]);
    event.target.value = "";
  };

  const handleEditRemoveAnswerImage = (index: number) => {
    setEditAnswerImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveEditAnswerImage = (index: number, direction: "up" | "down") => {
    setEditAnswerImages((prev) => {
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

    const trimmedMarks = editMarks.trim();
    const parsedMarks =
      trimmedMarks === "" ? Number.NaN : Number.parseInt(trimmedMarks, 10);
    const parsedDifficulty =
      editDifficulty === "" ? Number.NaN : Number.parseInt(editDifficulty, 10);

    // Merge chapter selections from both question banks
    const editChapterIds = [
      editPastPaperChapterId,
      editTypicalChapterId,
    ].filter((id): id is number => id !== null);

    if (editChapterIds.length === 0) {
      setFeedback({
        type: "error",
        message: "Please select at least one chapter.",
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
        message: "Please select a valid difficulty (1 to 4).",
      });
      return;
    }

    if (!Number.isFinite(parsedMarks) || parsedMarks <= 0) {
      setFeedback({
        type: "error",
        message: "Please enter a score greater than 0.",
      });
      return;
    }

    setFeedback(null);
    setIsUpdating(true);

    let readyImages: FormImage[] = [];
    let readyAnswerImages: FormImage[] = [];
    try {
      readyImages = await uploadImagesIfNeeded(editImages, "question_images");
      readyAnswerImages = await uploadImagesIfNeeded(
        editAnswerImages,
        "answer_images",
      );
    } catch (error) {
      setIsUpdating(false);
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "There was an issue uploading images.",
      });
      return;
    }

    // Use database function to update question with multiple chapters
    const { error: updateError } = await supabase.rpc(
      "update_question_with_chapters",
      {
        p_question_id: editingQuestionId,
        p_marks: parsedMarks,
        p_difficulty: parsedDifficulty,
        p_calculator: editCalculatorAllowed,
        p_chapter_ids: editChapterIds,
      },
    );

    if (updateError) {
      setIsUpdating(false);
      setFeedback({
        type: "error",
        message:
          updateError?.message ?? "There was an issue updating the question.",
      });
      return;
    }

    const { error: deleteImagesError } = await supabase
      .from("question_images")
      .delete()
      .eq("question_id", editingQuestionId);

    const { error: deleteAnswerImagesError } = await supabase
      .from("answer_images")
      .delete()
      .eq("question_id", editingQuestionId);

    if (deleteImagesError || deleteAnswerImagesError) {
      setIsUpdating(false);
      setFeedback({
        type: "error",
        message:
          deleteImagesError?.message ??
          deleteAnswerImagesError?.message ??
          "Failed to update image list.",
      });
      return;
    }

    let _nextImages: QuestionSummary["images"] = [];
    let _nextAnswerImages: QuestionSummary["answerImages"] = [];

    if (readyImages.length > 0) {
      const { data: newImages, error: insertImagesError } = await supabase
        .from("question_images")
        .insert(
          readyImages.map((image, index) => ({
            question_id: editingQuestionId,
            storage_path: image.storagePath ?? image.url,
            position: index + 1,
          })),
        )
        .select("id, storage_path, position");

      if (insertImagesError) {
        setIsUpdating(false);
        setFeedback({
          type: "error",
          message:
            insertImagesError.message ??
            "Failed to save image list, please try again.",
        });
        return;
      }

      _nextImages = (newImages ?? []).slice().sort((a, b) => {
        return a.position - b.position;
      });
    }

    if (readyAnswerImages.length > 0) {
      const { data: newAnswerImages, error: insertAnswerImagesError } =
        await supabase
          .from("answer_images")
          .insert(
            readyAnswerImages.map((image, index) => ({
              question_id: editingQuestionId,
              storage_path: image.storagePath ?? image.url,
              position: index + 1,
            })),
          )
          .select("id, storage_path, position");

      if (insertAnswerImagesError) {
        setIsUpdating(false);
        setFeedback({
          type: "error",
          message:
            insertAnswerImagesError.message ??
            "Failed to save answer images, please try again.",
        });
        return;
      }

      _nextAnswerImages = (newAnswerImages ?? []).slice().sort((a, b) => {
        return a.position - b.position;
      });
    }

    setFeedback({
      type: "success",
      message: "Question updated.",
    });
    setIsUpdating(false);
    cancelEdit();
    void loadQuestionsPage(page);
  };

  const handlePrevPage = () => {
    if (page <= 1 || isLoadingQuestions) return;
    void loadQuestionsPage(page - 1);
  };

  const handleNextPage = () => {
    if (!hasMore || isLoadingQuestions) return;
    void loadQuestionsPage(page + 1);
  };

  const buildQuestionCardData = (question: QuestionSummary) => ({
    id: question.id,
    marks: question.marks,
    difficulty: question.difficulty,
    calculator: question.calculator,
    createdAt: question.createdAt,
    chapterId: question.chapterIds[0] ?? null,
    chapterName: question.chapterName,
    subjectName: question.subjectName,
    images: question.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((image) => ({
        ...image,
        signedUrl: image.signedUrl
          ? image.signedUrl
          : (resolveImageSrc(image.storage_path) ?? null),
      })),
    answerImages: question.answerImages
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((image) => ({
        ...image,
        signedUrl: image.signedUrl
          ? image.signedUrl
          : (resolveImageSrc(image.storage_path) ?? null),
      })),
  });

  const handleTabChange = (value: string) => {
    router.push(`/console/questions?bank=${value}`);
  };

  // Auto-dismiss feedback messages after 3 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  return (
    <>
      {feedback ? (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center p-4">
          <div
            className={cn(
              "pointer-events-auto rounded-lg px-6 py-3 text-sm font-medium shadow-lg",
              feedback.type === "success"
                ? "border border-green-200 bg-green-50 text-green-800"
                : "border border-red-200 bg-red-50 text-red-800",
            )}
          >
            {feedback.message}
          </div>
        </div>
      ) : null}
      <Tabs
        value={getTabValue(questionBank)}
        onValueChange={handleTabChange}
        className="flex flex-1 flex-col gap-6"
      >
        <div className="flex flex-1 flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Question Management
              </h1>
              <p className="text-sm text-slate-500">
                Create questions, upload images, and link chapters to build the
                bank.
              </p>
            </div>
            <Button
              onClick={() =>
                formRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              className="gap-2"
            >
              <Plus className="size-4" />
              New Question
            </Button>
          </header>

          <TabsList>
            <TabsTrigger value="past-paper">Past Paper Questions</TabsTrigger>
            <TabsTrigger value="typical">Topical Questions</TabsTrigger>
          </TabsList>

          <Card>
            <CardHeader>
              <CardTitle>Create New Question</CardTitle>
              <CardDescription>
                Choose one or more chapters and upload images in display order.
                You can add a question to multiple question banks by selecting
                chapters from different banks.
              </CardDescription>
            </CardHeader>

            <form ref={formRef} onSubmit={handleCreate} className="space-y-6">
              <CardContent className="space-y-6">
                {/* Past Paper Questions Chapter Selection */}
                <div className="space-y-2">
                  <Label htmlFor="past-paper-chapter">
                    Past Paper Questions
                    <span className="ml-2 text-xs text-slate-500">(可选)</span>
                  </Label>
                  <TreeSelect
                    data={pastPaperTree}
                    value={pastPaperChapterId}
                    onValueChange={setPastPaperChapterId}
                    placeholder="选择章节..."
                  />
                </div>

                {/* Topical Questions Chapter Selection */}
                <div className="space-y-2">
                  <Label htmlFor="typical-chapter">
                    Topical Questions
                    <span className="ml-2 text-xs text-slate-500">(可选)</span>
                  </Label>
                  <TreeSelect
                    data={typicalTree}
                    value={typicalChapterId}
                    onValueChange={setTypicalChapterId}
                    placeholder="选择章节..."
                  />
                </div>

                {/* Selection summary */}
                {(pastPaperChapterId || typicalChapterId) && (
                  <p className="text-xs text-slate-600">
                    已选择{" "}
                    {
                      [pastPaperChapterId, typicalChapterId].filter(Boolean)
                        .length
                    }{" "}
                    个题库
                  </p>
                )}
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
                      placeholder="Enter marks (positive integer)"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="question-difficulty">Difficulty</Label>
                    <Select
                      value={difficulty}
                      onValueChange={setDifficulty}
                    >
                      <SelectTrigger id="question-difficulty">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Easy (1)</SelectItem>
                        <SelectItem value="2">Medium (2)</SelectItem>
                        <SelectItem value="3">Hard (3)</SelectItem>
                        <SelectItem value="4">Challenge (4)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                    <input
                      type="checkbox"
                      checked={!calculatorAllowed}
                      onChange={(event) =>
                        setCalculatorAllowed(!event.target.checked)
                      }
                      className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                    />
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800">
                        Calculator not allowed
                      </span>
                      <span className="text-xs text-slate-500">
                        Check if a calculator is not allowed for this question.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="question-image">Question Images</Label>
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
                      Select one or more images to upload; they display in list
                      order and can be reordered.
                    </p>
                  </div>

                  {images.length > 0 ? (
                    <ul className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                      {images.map((image, index) => (
                        <li
                          key={image.id}
                          className="flex flex-wrap items-start gap-2 rounded-lg bg-white p-2 shadow-sm sm:gap-3"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500 self-start">
                            {index + 1}
                          </span>
                          <div className="flex min-h-[160px] w-full flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
                            <div className="relative w-full flex-1 overflow-hidden rounded bg-slate-50">
                              <Image
                                src={
                                  resolveImageSrc(
                                    image.storagePath ?? image.url,
                                  ) ?? image.url
                                }
                                alt={`Preview ${index + 1}`}
                                width={1200}
                                height={675}
                                className="h-full w-full object-contain"
                                sizes="(max-width: 768px) 100vw, 640px"
                                unoptimized
                              />
                            </div>
                          </div>
                          <div className="ml-auto flex items-start gap-1 pt-1 sm:ml-0">
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

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="answer-image">Answer Images</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input
                        id="answer-image"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleAddAnswerImageFiles}
                        className="max-w-xl flex-1"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Upload answer images; they display in list order and can
                      be reordered.
                    </p>
                  </div>

                  {answerImages.length > 0 ? (
                    <ul className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                      {answerImages.map((image, index) => (
                        <li
                          key={image.id}
                          className="flex flex-wrap items-start gap-2 rounded-lg bg-white p-2 shadow-sm sm:gap-3"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500 self-start">
                            {index + 1}
                          </span>
                          <div className="flex min-h-[160px] w-full flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
                            <div className="relative w-full flex-1 overflow-hidden rounded bg-slate-50">
                              <Image
                                src={image.storagePath ?? image.url}
                                alt={`Answer preview ${index + 1}`}
                                width={1200}
                                height={675}
                                className="h-full w-full object-contain"
                                sizes="(max-width: 768px) 100vw, 640px"
                                unoptimized
                              />
                            </div>
                          </div>
                          <div className="ml-auto flex items-start gap-1 pt-1 sm:ml-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => moveAnswerImage(index, "up")}
                              disabled={index === 0}
                              aria-label="Move answer image up"
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => moveAnswerImage(index, "down")}
                              disabled={index === answerImages.length - 1}
                              aria-label="Move answer image down"
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveAnswerImage(index)}
                              aria-label="Remove answer image"
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
              <span>Question List</span>
            </div>
            {listError ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {listError}
              </div>
            ) : null}
            {isLoadingQuestions ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                Loading questions...
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No questions yet. Create the first one above.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {questions.map((question) => {
                    const questionCardData = buildQuestionCardData(question);
                    return (
                      <Card
                        key={question.id}
                        id={`question-${question.id}`}
                        className="border-slate-200"
                      >
                        <CardHeader className="border-b border-slate-100">
                          <CardTitle className="text-base font-semibold text-slate-800">
                            Question #{question.id}
                          </CardTitle>
                          <CardDescription className="flex flex-wrap items-center gap-3 text-xs">
                            <span>
                              Created at:{formatDateTime(question.createdAt)}
                            </span>
                          </CardDescription>
                          <CardAction className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              title="Edit question"
                              onClick={() => beginEdit(question)}
                              disabled={
                                isUpdating && editingQuestionId === question.id
                              }
                            >
                              {isUpdating &&
                              editingQuestionId === question.id ? (
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
                        {editingQuestionId !== question.id ? (
                          <div className="border-t border-slate-100 bg-slate-50/60">
                            <div className="px-4 py-4">
                              <QuestionCard question={questionCardData} disableInteractions />
                            </div>
                          </div>
                        ) : null}
                        {editingQuestionId === question.id ? (
                          <form
                            onSubmit={handleUpdate}
                            className="space-y-4 p-4"
                          >
                            {/* Past Paper Questions Chapter Selection */}
                            <div className="space-y-2">
                              <Label htmlFor="edit-past-paper-chapter">
                                Past Paper Questions
                                <span className="ml-2 text-xs text-slate-500">
                                  (可选)
                                </span>
                              </Label>
                              <TreeSelect
                                data={pastPaperTree}
                                value={editPastPaperChapterId}
                                onValueChange={setEditPastPaperChapterId}
                                placeholder="选择章节..."
                              />
                            </div>

                            {/* Topical Questions Chapter Selection */}
                            <div className="space-y-2">
                              <Label htmlFor="edit-typical-chapter">
                                Topical Questions
                                <span className="ml-2 text-xs text-slate-500">
                                  (可选)
                                </span>
                              </Label>
                              <TreeSelect
                                data={typicalTree}
                                value={editTypicalChapterId}
                                onValueChange={setEditTypicalChapterId}
                                placeholder="选择章节..."
                              />
                            </div>

                            {/* Selection summary */}
                            {(editPastPaperChapterId ||
                              editTypicalChapterId) && (
                              <p className="text-xs text-slate-600">
                                已选择{" "}
                                {
                                  [
                                    editPastPaperChapterId,
                                    editTypicalChapterId,
                                  ].filter(Boolean).length
                                }{" "}
                                个题库
                              </p>
                            )}
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="edit-marks">Marks</Label>
                                <Input
                                  id="edit-marks"
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={editMarks}
                                  onChange={(event) =>
                                    setEditMarks(event.target.value)
                                  }
                                  placeholder="Enter marks (positive integer)"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="edit-difficulty">
                                  Difficulty
                                </Label>
                                <Select
                                  value={editDifficulty}
                                  onValueChange={setEditDifficulty}
                                >
                                  <SelectTrigger id="edit-difficulty">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1">Easy (1)</SelectItem>
                                    <SelectItem value="2">Medium (2)</SelectItem>
                                    <SelectItem value="3">Hard (3)</SelectItem>
                                    <SelectItem value="4">Challenge (4)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                                <input
                                  type="checkbox"
                                  checked={!editCalculatorAllowed}
                                  onChange={(event) =>
                                    setEditCalculatorAllowed(
                                      !event.target.checked,
                                    )
                                  }
                                  className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                                />
                                <div className="flex flex-col">
                                  <span className="font-medium text-slate-800">
                                    Calculator not allowed
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    Check if a calculator is not allowed for
                                    this question.
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
                                  Select one or more images to upload; they
                                  display in list order and can be reordered.
                                </p>
                              </div>

                              {editImages.length > 0 ? (
                                <ul className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                                  {editImages.map((image, index) => (
                                    <li
                                      key={image.id}
                                      className="flex flex-wrap items-start gap-2 rounded-lg bg-white p-2 shadow-sm sm:gap-3"
                                    >
                                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500 self-start">
                                        {index + 1}
                                      </span>
                                      <div className="flex min-h-[160px] w-full flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
                                        <div className="relative w-full flex-1 overflow-hidden rounded bg-slate-50">
                                          <Image
                                            src={
                                              resolveImageSrc(
                                                image.storagePath ?? image.url,
                                              ) ?? image.url
                                            }
                                            alt={`Preview ${index + 1}`}
                                            width={1200}
                                            height={675}
                                            className="h-full w-full object-contain"
                                            sizes="(max-width: 768px) 100vw, 640px"
                                            unoptimized
                                          />
                                        </div>
                                      </div>
                                      <div className="ml-auto flex items-start gap-1 pt-1 sm:ml-0">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() =>
                                            moveEditImage(index, "up")
                                          }
                                          disabled={index === 0}
                                          aria-label="Move image up"
                                        >
                                          <ArrowUp className="size-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() =>
                                            moveEditImage(index, "down")
                                          }
                                          disabled={
                                            index === editImages.length - 1
                                          }
                                          aria-label="Move image down"
                                        >
                                          <ArrowDown className="size-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() =>
                                            handleEditRemoveImage(index)
                                          }
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

                            <div className="space-y-3">
                              <div>
                                <Label htmlFor="edit-answer-image">
                                  Answer Images
                                </Label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Input
                                    id="edit-answer-image"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleEditAddAnswerImageFiles}
                                    className="max-w-xl flex-1"
                                  />
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  Upload answer images; they display in list
                                  order and can be reordered.
                                </p>
                              </div>

                              {editAnswerImages.length > 0 ? (
                                <ul className="space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                                  {editAnswerImages.map((image, index) => (
                                    <li
                                      key={image.id}
                                      className="flex flex-wrap items-start gap-2 rounded-lg bg-white p-2 shadow-sm sm:gap-3"
                                    >
                                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500 self-start">
                                        {index + 1}
                                      </span>
                                      <div className="flex min-h-[160px] w-full flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
                                        <div className="relative w-full flex-1 overflow-hidden rounded bg-slate-50">
                                          <Image
                                            src={
                                              resolveImageSrc(
                                                image.storagePath ?? image.url,
                                              ) ?? image.url
                                            }
                                            alt={`Answer preview ${index + 1}`}
                                            width={1200}
                                            height={675}
                                            className="h-full w-full object-contain"
                                            sizes="(max-width: 768px) 100vw, 640px"
                                            unoptimized
                                          />
                                        </div>
                                      </div>
                                      <div className="ml-auto flex items-start gap-1 pt-1 sm:ml-0">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() =>
                                            moveEditAnswerImage(index, "up")
                                          }
                                          disabled={index === 0}
                                          aria-label="Move answer image up"
                                        >
                                          <ArrowUp className="size-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() =>
                                            moveEditAnswerImage(index, "down")
                                          }
                                          disabled={
                                            index ===
                                            editAnswerImages.length - 1
                                          }
                                          aria-label="Move answer image down"
                                        >
                                          <ArrowDown className="size-4" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          onClick={() =>
                                            handleEditRemoveAnswerImage(index)
                                          }
                                          aria-label="Remove answer image"
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
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={page <= 1 || isLoadingQuestions}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600">Page {page}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!hasMore || isLoadingQuestions}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </Tabs>
    </>
  );
}
