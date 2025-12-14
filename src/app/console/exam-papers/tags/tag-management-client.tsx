"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "../../../../../database.types";

type SubjectRow = Tables<"subjects"> & {
  exam_board?: { name?: string | null } | null;
};

type TagValue = {
  id: number;
  value: string;
  position: number | null;
  created_at?: string | null;
};

type TagDefinition = {
  id: number;
  subject_id: number;
  name: string;
  required: boolean;
  position: number | null;
  created_at?: string | null;
  values?: TagValue[] | null;
};

type ExamPaperTagManagementProps = {
  initialSubjects: SubjectRow[];
  initialTags: TagDefinition[];
  loadError: string | null;
};

export function ExamPaperTagManagement({
  initialSubjects,
  initialTags,
  loadError,
}: ExamPaperTagManagementProps) {
  const supabase = useMemo(() => createClient(), []);
  const [subjects] = useState(initialSubjects);
  const [tags, setTags] = useState<TagDefinition[]>(initialTags);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    initialSubjects[0]?.id ? String(initialSubjects[0].id) : "",
  );
  const [creatingTagName, setCreatingTagName] = useState("");
  const [creatingRequired, setCreatingRequired] = useState(false);
  const [creating, setCreating] = useState(false);
  const [valueInputs, setValueInputs] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [editingValueId, setEditingValueId] = useState<number | null>(null);
  const [editingValueText, setEditingValueText] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(loadError ? { type: "error", text: loadError } : null);

  const subjectOptions = useMemo(
    () =>
      subjects
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map((subject) => ({
          id: subject.id,
          label: subject.exam_board?.name
            ? `${subject.exam_board.name} · ${subject.name}`
            : subject.name,
        })),
    [subjects],
  );

  const tagsBySubject = useMemo(() => {
    const map = new Map<number, TagDefinition[]>();
    for (const tag of tags) {
      if (!map.has(tag.subject_id)) map.set(tag.subject_id, []);
      map.get(tag.subject_id)?.push(tag);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const posA = a.position ?? 0;
        const posB = b.position ?? 0;
        if (posA !== posB) return posA - posB;
        return a.name.localeCompare(b.name, "zh-CN");
      });
    }
    return map;
  }, [tags]);

  const currentSubjectTags = selectedSubjectId
    ? tagsBySubject.get(Number.parseInt(selectedSubjectId, 10)) ?? []
    : [];

  const resetMessage = () => setMessage(null);

  const handleCreateTag = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessage();
    const subjectId = Number.parseInt(selectedSubjectId, 10);
    if (!subjectId) {
      setMessage({ type: "error", text: "请选择学科后再创建标签。" });
      return;
    }
    const name = creatingTagName.trim();
    if (!name) {
      setMessage({ type: "error", text: "请输入标签名称。" });
      return;
    }
    setCreating(true);
    const position =
      (currentSubjectTags[currentSubjectTags.length - 1]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("subject_exam_tags")
      .insert({
        subject_id: subjectId,
        name,
        required: creatingRequired,
        position,
      })
      .select("id, subject_id, name, required, position, created_at")
      .single();

    if (error || !data) {
      setMessage({ type: "error", text: error?.message ?? "创建失败。" });
    } else {
      setTags((prev) => [...prev, { ...data, values: [] }]);
      setCreatingTagName("");
      setCreatingRequired(false);
      setMessage({ type: "success", text: "创建成功。" });
    }
    setCreating(false);
  };

  const handleAddValue = async (tagId: number) => {
    resetMessage();
    const valueText = (valueInputs[tagId] ?? "").trim();
    if (!valueText) {
      setMessage({ type: "error", text: "请输入可选值。" });
      return;
    }
    setBusyId(tagId);
    const tag = tags.find((t) => t.id === tagId);
    const nextPosition =
      (tag?.values?.[tag.values.length - 1]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("subject_exam_tag_values")
      .insert({ tag_id: tagId, value: valueText, position: nextPosition })
      .select("id, value, position, created_at")
      .single();

    if (error || !data) {
      setMessage({ type: "error", text: error?.message ?? "新增值失败。" });
    } else {
      setTags((prev) =>
        prev.map((t) =>
          t.id === tagId
            ? { ...t, values: [...(t.values ?? []), data] }
            : t,
        ),
      );
      setValueInputs((prev) => ({ ...prev, [tagId]: "" }));
      setMessage({ type: "success", text: "已添加。" });
    }
    setBusyId(null);
  };

  const handleRenameTag = async (tagId: number, name: string) => {
    resetMessage();
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "标签名称不能为空。" });
      return;
    }
    setBusyId(tagId);
    const { error } = await supabase
      .from("subject_exam_tags")
      .update({ name: trimmed })
      .eq("id", tagId);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, name: trimmed } : t)),
      );
      setMessage({ type: "success", text: "标签名称已更新。" });
    }
    setBusyId(null);
    setEditingTagId(null);
    setEditingTagName("");
  };

  const handleRenameValue = async (
    tagId: number,
    valueId: number,
    nextValue: string,
  ) => {
    resetMessage();
    const trimmed = nextValue.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "可选值不能为空。" });
      return;
    }
    setBusyId(valueId);
    const { error } = await supabase
      .from("subject_exam_tag_values")
      .update({ value: trimmed })
      .eq("id", valueId);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setTags((prev) =>
        prev.map((t) =>
          t.id === tagId
            ? {
                ...t,
                values: (t.values ?? []).map((v) =>
                  v.id === valueId ? { ...v, value: trimmed } : v,
                ),
              }
            : t,
        ),
      );
      setMessage({ type: "success", text: "可选值已更新。" });
    }
    setBusyId(null);
    setEditingValueId(null);
    setEditingValueText("");
  };

  const handleDeleteValue = async (tagId: number, valueId: number) => {
    resetMessage();
    setBusyId(valueId);
    const { error } = await supabase
      .from("subject_exam_tag_values")
      .delete()
      .eq("id", valueId);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setTags((prev) =>
        prev.map((t) =>
          t.id === tagId
            ? { ...t, values: (t.values ?? []).filter((v) => v.id !== valueId) }
            : t,
        ),
      );
      setMessage({ type: "success", text: "已删除。" });
    }
    setBusyId(null);
  };

  const handleDeleteTag = async (tagId: number) => {
    resetMessage();
    if (
      !window.confirm(
        "确认删除该标签？将同时删除其下所有可选值及关联的试卷选择。",
      )
    ) {
      return;
    }
    setBusyId(tagId);
    const { error } = await supabase
      .from("subject_exam_tags")
      .delete()
      .eq("id", tagId);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      setMessage({ type: "success", text: "已删除标签。" });
    }
    setBusyId(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Exam Paper Tags</h1>
        <p className="text-sm text-slate-500">
          为各学科配置标签和值，创建试卷时将按标签要求选择。
        </p>
        {message ? (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700",
            )}
          >
            {message.text}
          </div>
        ) : null}
      </header>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>选择学科</CardTitle>
          <CardDescription>切换学科以管理对应的标签与值。</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="space-y-2 sm:w-80">
              <Label htmlFor="subject-select">学科</Label>
              <select
                id="subject-select"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                value={selectedSubjectId}
                onChange={(event) => {
                  setSelectedSubjectId(event.target.value);
                  resetMessage();
                }}
              >
                <option value="">选择学科</option>
                {subjectOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>新建标签</CardTitle>
          <CardDescription>为当前学科添加标签并设置是否必填。</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={handleCreateTag}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tag-name">标签名称</Label>
              <Input
                id="tag-name"
                placeholder="例如：Paper"
                value={creatingTagName}
                onChange={(event) => setCreatingTagName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="invisible block text-sm">必填</Label>
              <Button
                type="button"
                variant={creatingRequired ? "default" : "outline"}
                className="w-full justify-center"
                onClick={() => setCreatingRequired((prev) => !prev)}
              >
                {creatingRequired ? (
                  <>
                    <BadgeCheck className="mr-2 size-4" />
                    必填
                  </>
                ) : (
                  "设为必填"
                )}
              </Button>
            </div>
            <div className="md:col-span-3 flex items-center gap-3">
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                创建标签
              </Button>
              <p className="text-xs text-slate-500">
                需先选择学科，名称在同一学科下唯一。
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>标签列表</CardTitle>
          <CardDescription>管理当前学科的标签及可选值。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {currentSubjectTags.length === 0 ? (
            <p className="text-sm text-slate-500">该学科暂无标签。</p>
          ) : (
            currentSubjectTags.map((tag) => (
              <div
                key={tag.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {editingTagId === tag.id ? (
                        <>
                          <Input
                            value={editingTagName}
                            onChange={(event) => setEditingTagName(event.target.value)}
                            className="w-52"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleRenameTag(tag.id, editingTagName)}
                            disabled={busyId === tag.id}
                          >
                            {busyId === tag.id ? (
                              <Loader2 className="mr-1 size-4 animate-spin" />
                            ) : null}
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingTagId(null);
                              setEditingTagName("");
                            }}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3 className="text-base font-semibold text-slate-900">
                            {tag.name}
                          </h3>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditingTagId(tag.id);
                              setEditingTagName(tag.name);
                              setEditingValueId(null);
                            }}
                            aria-label="重命名标签"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </>
                      )}
                      {tag.required ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          必填
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      可选值：{tag.values?.length ?? 0}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600"
                    onClick={() => handleDeleteTag(tag.id)}
                    disabled={busyId === tag.id}
                    aria-label="删除标签"
                  >
                    {busyId === tag.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(tag.values ?? []).map((value) => (
                    <div
                      key={value.id}
                      className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
                    >
                      {editingValueId === value.id ? (
                        <>
                          <Input
                            className="h-8 w-32"
                            value={editingValueText}
                            onChange={(event) =>
                              setEditingValueText(event.target.value)
                            }
                          />
                          <Button
                            size="sm"
                            onClick={() =>
                              handleRenameValue(tag.id, value.id, editingValueText)
                            }
                            disabled={busyId === value.id}
                          >
                            {busyId === value.id ? (
                              <Loader2 className="mr-1 size-4 animate-spin" />
                            ) : null}
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingValueId(null);
                              setEditingValueText("");
                            }}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <span>{value.value}</span>
                          <button
                            type="button"
                            className="text-slate-400 transition hover:text-slate-600"
                            onClick={() => {
                              setEditingValueId(value.id);
                              setEditingValueText(value.value);
                              setEditingTagId(null);
                            }}
                            aria-label="编辑可选值"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="text-slate-400 transition hover:text-red-500"
                            onClick={() => handleDeleteValue(tag.id, value.id)}
                            disabled={busyId === value.id}
                            aria-label="删除可选值"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {(tag.values ?? []).length === 0 ? (
                    <span className="text-xs text-slate-500">
                      暂无可选值，请添加。
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="添加可选值，例如 P1 / P2 / P3"
                    value={valueInputs[tag.id] ?? ""}
                    onChange={(event) =>
                      setValueInputs((prev) => ({
                        ...prev,
                        [tag.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    className="sm:w-40"
                    onClick={() => handleAddValue(tag.id)}
                    disabled={busyId === tag.id}
                  >
                    {busyId === tag.id ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    添加值
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
