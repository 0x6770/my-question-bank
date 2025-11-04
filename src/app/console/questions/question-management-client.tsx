"use client";

import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Loader2,
  Plus,
  ScrollText,
  Trash2,
} from "lucide-react";
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

type TagRow = Tables<"tags">;

type QuestionSummary = {
  id: number;
  subjectId: number | null;
  subjectName: string | null;
  createdAt: string;
  images: {
    id: number;
    storage_path: string;
    position: number;
  }[];
  tags: TagRow[];
};

type Feedback =
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type QuestionManagementProps = {
  initialTags: TagRow[];
  initialQuestions: QuestionSummary[];
  loadError: string | null;
};

type TagNode = TagRow & { children: TagNode[] };

type FormImage = {
  id: string;
  url: string;
};

function buildTagTree(tags: TagRow[]): TagNode[] {
  const nodes = new Map<number, TagNode>();
  const roots: TagNode[] = [];

  tags.forEach((tag) => {
    nodes.set(tag.id, { ...tag, children: [] });
  });

  nodes.forEach((node) => {
    if (node.parent_id != null) {
      const parent = nodes.get(node.parent_id);
      if (parent) {
        parent.children.push(node);
        return;
      }
    }
    roots.push(node);
  });

  const sortNodes = (items: TagNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of items) {
      sortNodes(child.children);
    }
  };

  sortNodes(roots);
  return roots;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function QuestionManagement({
  initialTags,
  initialQuestions,
  loadError,
}: QuestionManagementProps) {
  const supabase = useMemo(() => createClient(), []);

  const tagById = useMemo(
    () => new Map(initialTags.map((tag) => [tag.id, tag])),
    [initialTags],
  );

  const subjectOptions = useMemo(
    () =>
      initialTags
        .filter((tag) => tag.parent_id == null)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [initialTags],
  );

  const tagTree = useMemo(() => buildTagTree(initialTags), [initialTags]);

  const [questions, setQuestions] =
    useState<QuestionSummary[]>(initialQuestions);
  const [subjectId, setSubjectId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState("");
  const [images, setImages] = useState<FormImage[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
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

  const formRef = useRef<HTMLFormElement>(null);
  const subjectSelectRef = useRef<HTMLSelectElement>(null);
  const imageIdRef = useRef(0);

  const resetForm = () => {
    setSubjectId("");
    setImageUrl("");
    setImages([]);
    setSelectedTagIds(new Set());
    subjectSelectRef.current?.focus();
  };

  const handleAddImage = () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      setFeedback({
        type: "error",
        message: "请输入图片链接。",
      });
      return;
    }
    setFeedback(null);
    setImages((prev) => [
      ...prev,
      {
        id: `local-${imageIdRef.current++}`,
        url: trimmed,
      },
    ]);
    setImageUrl("");
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

  const toggleTagSelection = (tagId: number) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const chosenSubjectId =
      subjectId === "" ? null : Number.parseInt(subjectId, 10);

    if (!chosenSubjectId) {
      setFeedback({
        type: "error",
        message: "请选择所属学科。",
      });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    const { data: question, error: insertError } = await supabase
      .from("questions")
      .insert({
        subject_id: chosenSubjectId,
      })
      .select("id, subject_id, created_at")
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

    if (images.length > 0) {
      const { data: imageRows, error: imageError } = await supabase
        .from("question_images")
        .insert(
          images.map((image, index) => ({
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

    if (selectedTagIds.size > 0) {
      const payload = Array.from(selectedTagIds, (tagId) => ({
        question_id: createdQuestionId,
        tag_id: tagId,
      }));
      const { error: tagError } = await supabase
        .from("question_tags")
        .insert(payload);
      if (tagError) {
        await supabase.from("questions").delete().eq("id", createdQuestionId);
        setIsSubmitting(false);
        setFeedback({
          type: "error",
          message: tagError.message ?? "保存标签失败，请稍后重试。",
        });
        return;
      }
    }

    const subject = chosenSubjectId
      ? (tagById.get(chosenSubjectId) ?? null)
      : null;
    const resolvedTags: TagRow[] = Array.from(selectedTagIds)
      .map((tagId) => tagById.get(tagId) ?? null)
      .filter((tag): tag is TagRow => tag != null);

    const newQuestion: QuestionSummary = {
      id: createdQuestionId,
      subjectId: question.subject_id,
      subjectName: subject?.name ?? null,
      createdAt: question.created_at,
      images: insertedImages ?? [],
      tags: resolvedTags,
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

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    subjectSelectRef.current?.focus();
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Question Management
          </h1>
          <p className="text-sm text-slate-500">
            创建题目、上传图片以及勾选标签来构建题库。
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
          <CardDescription>
            选择学科，上传按顺序展示的图片，并关联对应标签。
          </CardDescription>
          <CardAction>
            <span className="text-xs uppercase tracking-wide text-slate-400">
              Step 1
            </span>
          </CardAction>
        </CardHeader>

        <form ref={formRef} onSubmit={handleCreate} className="space-y-6">
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="question-subject">Subject</Label>
              <select
                id="question-subject"
                ref={subjectSelectRef}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200"
              >
                <option value="">Select a subject</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="question-image">Images (Vertical Stack)</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    id="question-image"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="Enter image URL"
                    className="max-w-xl flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddImage}
                    className="gap-2"
                  >
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  图片将按顺序从上到下显示，可上下调整顺序。
                </p>
              </div>

              {images.length > 0 ? (
                <ul className="space-y-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm">
                  {images.map((image, index) => (
                    <li
                      key={image.id}
                      className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm"
                    >
                      <span className="flex size-9 items-center justify-center rounded-md bg-slate-100 font-medium text-slate-500">
                        {index + 1}
                      </span>
                      <div className="flex flex-1 flex-col">
                        <span className="truncate font-medium text-slate-700">
                          {image.url}
                        </span>
                        <span className="text-xs text-slate-400">
                          将作为第 {index + 1} 张图片显示
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
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
              <Label>Tags</Label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                {tagTree.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    暂无标签，请先在 Tags 页面创建。
                  </p>
                ) : (
                  <div className="space-y-1">
                    {tagTree.map((node) => (
                      <TagCheckboxTree
                        key={node.id}
                        node={node}
                        depth={0}
                        selectedTagIds={selectedTagIds}
                        onToggle={toggleTagSelection}
                        disabledTagId={
                          subjectId ? Number.parseInt(subjectId, 10) : null
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
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
                    {question.subjectName ? (
                      <Badge variant="outline">{question.subjectName}</Badge>
                    ) : (
                      <Badge variant="secondary">未设置学科</Badge>
                    )}
                    <span className="flex items-center gap-1 text-slate-500">
                      <ImageIcon className="size-4" />
                      {question.images.length} image
                      {question.images.length === 1 ? "" : "s"}
                    </span>
                  </CardDescription>
                  <CardAction className="flex items-center gap-2">
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
                {question.tags.length > 0 ? (
                  <CardContent className="flex flex-wrap gap-2 text-sm">
                    {question.tags.map((tag) => (
                      <Badge key={tag.id} variant="secondary">
                        {tag.name}
                      </Badge>
                    ))}
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type TagCheckboxTreeProps = {
  node: TagNode;
  depth: number;
  selectedTagIds: Set<number>;
  onToggle: (tagId: number) => void;
  disabledTagId: number | null;
};

function TagCheckboxTree({
  node,
  depth,
  selectedTagIds,
  onToggle,
  disabledTagId,
}: TagCheckboxTreeProps) {
  const isDisabled = node.id === disabledTagId;
  const isChecked = selectedTagIds.has(node.id);

  return (
    <div className="space-y-1">
      <label
        htmlFor={`tag-checkbox-${node.id}`}
        className={cn(
          "flex items-center gap-3 rounded-md px-2 py-1 text-sm transition hover:bg-white",
          isDisabled && "cursor-not-allowed text-slate-400",
        )}
        style={{ marginLeft: depth * 16 }}
      >
        <input
          id={`tag-checkbox-${node.id}`}
          type="checkbox"
          className="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          checked={isChecked}
          disabled={isDisabled}
          onChange={() => onToggle(node.id)}
        />
        <span className="truncate text-slate-700">{node.name}</span>
      </label>
      {node.children.length > 0
        ? node.children.map((child) => (
            <TagCheckboxTree
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedTagIds={selectedTagIds}
              onToggle={onToggle}
              disabledTagId={disabledTagId}
            />
          ))
        : null}
    </div>
  );
}
