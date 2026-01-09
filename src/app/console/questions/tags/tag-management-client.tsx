"use client";

// biome-ignore lint/correctness/noUnusedImports: lucide icons used in JSX below
import { BadgeCheck, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

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
import { type TreeNode, TreeSelect } from "@/components/ui/tree-select";
import { createClient } from "@/lib/supabase/client";
import type { SubjectWithBoard } from "@/lib/supabase/relations";
import { cn } from "@/lib/utils";

export type SubjectRow = SubjectWithBoard;

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
  is_system: boolean;
  created_at?: string | null;
  values?: TagValue[] | null;
};

type QuestionTagManagementClientProps = {
  initialSubjects: SubjectRow[];
  initialTags: TagDefinition[];
  loadError: string | null;
};

export function QuestionTagManagementClient({
  initialSubjects,
  initialTags,
  loadError,
}: QuestionTagManagementClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const [subjects] = useState(initialSubjects);
  const [tags, setTags] = useState<TagDefinition[]>(initialTags);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    initialSubjects[0]?.id ?? null,
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

  const subjectTreeData = useMemo(() => {
    const boardMap = new Map<
      number,
      { name: string; subjects: SubjectRow[] }
    >();

    for (const subject of subjects) {
      if (subject.exam_board) {
        const boardId = subject.exam_board.id;
        if (!boardMap.has(boardId)) {
          boardMap.set(boardId, {
            name: subject.exam_board.name,
            subjects: [],
          });
        }
        boardMap.get(boardId)?.subjects.push(subject);
      }
    }

    const treeNodes: TreeNode[] = [];
    for (const [
      boardId,
      { name, subjects: boardSubjects },
    ] of boardMap.entries()) {
      const children: TreeNode[] = boardSubjects
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
        .map((subject) => ({
          id: `subject-${subject.id}`,
          label: subject.name,
          value: subject.id,
        }));

      treeNodes.push({
        id: `board-${boardId}`,
        label: name,
        children,
      });
    }

    return treeNodes.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }, [subjects]);

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
    ? (tagsBySubject.get(selectedSubjectId) ?? [])
    : [];

  const resetMessage = () => setMessage(null);

  const handleCreateTag = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessage();
    if (!selectedSubjectId) {
      setMessage({
        type: "error",
        text: "Please select a subject before creating a tag.",
      });
      return;
    }
    const subjectId = selectedSubjectId;
    const name = creatingTagName.trim();
    if (!name) {
      setMessage({ type: "error", text: "Please enter a tag name." });
      return;
    }
    setCreating(true);
    const position =
      (currentSubjectTags[currentSubjectTags.length - 1]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("subject_question_tags")
      .insert({
        subject_id: subjectId,
        name,
        required: creatingRequired,
        position,
      })
      .select("id, subject_id, name, required, position, created_at, is_system")
      .single();

    if (error || !data) {
      setMessage({ type: "error", text: error?.message ?? "Creation failed." });
    } else {
      setTags((prev) => [
        ...prev,
        { ...data, is_system: data.is_system ?? false, values: [] },
      ]);
      setCreatingTagName("");
      setCreatingRequired(false);
      setMessage({ type: "success", text: "Created successfully." });
    }
    setCreating(false);
  };

  const handleAddValue = async (tagId: number) => {
    resetMessage();
    const valueText = (valueInputs[tagId] ?? "").trim();
    if (!valueText) {
      setMessage({ type: "error", text: "Please enter a value." });
      return;
    }
    setBusyId(tagId);
    const tag = tags.find((t) => t.id === tagId);
    const nextPosition =
      (tag?.values?.[tag.values.length - 1]?.position ?? 0) + 1;
    const { data, error } = await supabase
      .from("subject_question_tag_values")
      .insert({ tag_id: tagId, value: valueText, position: nextPosition })
      .select("id, value, position, created_at")
      .single();

    if (error || !data) {
      setMessage({
        type: "error",
        text: error?.message ?? "Failed to add value.",
      });
    } else {
      setTags((prev) =>
        prev.map((t) =>
          t.id === tagId ? { ...t, values: [...(t.values ?? []), data] } : t,
        ),
      );
      setValueInputs((prev) => ({ ...prev, [tagId]: "" }));
      setMessage({ type: "success", text: "Added successfully." });
    }
    setBusyId(null);
  };

  const handleRenameTag = async (tagId: number, name: string) => {
    resetMessage();
    const tag = tags.find((t) => t.id === tagId);
    if (tag?.is_system) {
      setMessage({
        type: "error",
        text: `Cannot rename system tag "${tag.name}". System tags are protected.`,
      });
      setEditingTagId(null);
      setEditingTagName("");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Tag name cannot be empty." });
      return;
    }
    setBusyId(tagId);
    const { error } = await supabase
      .from("subject_question_tags")
      .update({ name: trimmed })
      .eq("id", tagId);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setTags((prev) =>
        prev.map((t) => (t.id === tagId ? { ...t, name: trimmed } : t)),
      );
      setMessage({ type: "success", text: "Tag name updated." });
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
      setMessage({ type: "error", text: "Value cannot be empty." });
      return;
    }
    setBusyId(valueId);
    const { error } = await supabase
      .from("subject_question_tag_values")
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
      setMessage({ type: "success", text: "Options updated." });
    }
    setBusyId(null);
    setEditingValueId(null);
    setEditingValueText("");
  };

  const handleDeleteValue = async (tagId: number, valueId: number) => {
    resetMessage();
    if (
      !window.confirm(
        "Delete this tag value? This will remove it from all associated exam papers.",
      )
    ) {
      return;
    }
    setBusyId(valueId);
    const { error } = await supabase
      .from("subject_question_tag_values")
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
      setMessage({ type: "success", text: "Deleted successfully." });
    }
    setBusyId(null);
  };

  const handleDeleteTag = async (tagId: number) => {
    resetMessage();
    const tag = tags.find((t) => t.id === tagId);
    if (tag?.is_system) {
      setMessage({
        type: "error",
        text: `Cannot delete system tag "${tag.name}". This tag is required for all questions.`,
      });
      return;
    }
    if (
      !window.confirm(
        "Delete this tag? This will remove all options and related question selections.",
      )
    ) {
      return;
    }
    setBusyId(tagId);
    const { error } = await supabase
      .from("subject_question_tags")
      .delete()
      .eq("id", tagId);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      setMessage({ type: "success", text: "Tag deleted." });
    }
    setBusyId(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Exam Paper Tags
        </h1>
        <p className="text-sm text-slate-500">
          Configure tags and values per subject; creating exam papers will
          require these selections.
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
          <CardTitle>Select Subject</CardTitle>
          <CardDescription>
            Switch subject to manage its tags and values.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-full space-y-2 sm:max-w-xl">
              <Label htmlFor="subject-select">Subject</Label>
              <TreeSelect
                data={subjectTreeData}
                value={selectedSubjectId}
                onValueChange={(value) => {
                  setSelectedSubjectId(value);
                  resetMessage();
                }}
                placeholder="Select Subject"
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Create Tag</CardTitle>
          <CardDescription>
            Add tags for the current subject and set whether they are required.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
            onSubmit={handleCreateTag}
          >
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tag-name">Tag Name</Label>
              <Input
                id="tag-name"
                placeholder="e.g., Paper"
                value={creatingTagName}
                onChange={(event) => setCreatingTagName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="invisible block text-sm">Required</Label>
              <Button
                type="button"
                variant={creatingRequired ? "default" : "outline"}
                className="w-full justify-center"
                onClick={() => setCreatingRequired((prev) => !prev)}
              >
                {creatingRequired ? (
                  <>
                    <BadgeCheck className="mr-2 size-4" />
                    Required
                  </>
                ) : (
                  "Set as required"
                )}
              </Button>
            </div>
            <div className="md:col-span-3 flex items-center gap-3">
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Create Tag
              </Button>
              <p className="text-xs text-slate-500">
                Select a subject first; the name must be unique within the
                subject.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Tag List</CardTitle>
          <CardDescription>
            Manage tags and options for the current subject.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {currentSubjectTags.length === 0 ? (
            <p className="text-sm text-slate-500">No tags for this subject.</p>
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
                            onChange={(event) =>
                              setEditingTagName(event.target.value)
                            }
                            className="w-52"
                          />
                          <Button
                            size="sm"
                            onClick={() =>
                              handleRenameTag(tag.id, editingTagName)
                            }
                            disabled={busyId === tag.id}
                          >
                            {busyId === tag.id ? (
                              <Loader2 className="mr-1 size-4 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingTagId(null);
                              setEditingTagName("");
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3 className="text-base font-semibold text-slate-900">
                            {tag.name}
                          </h3>
                          {!tag.is_system && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setEditingTagId(tag.id);
                                setEditingTagName(tag.name);
                                setEditingValueId(null);
                              }}
                              aria-label="Rename Tag"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                        </>
                      )}
                      {tag.is_system ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          System Tag
                        </span>
                      ) : null}
                      {tag.required ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Required
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      Options: {tag.values?.length ?? 0}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600"
                    onClick={() => handleDeleteTag(tag.id)}
                    disabled={busyId === tag.id || tag.is_system}
                    aria-label="DeleteTag"
                    title={
                      tag.is_system
                        ? "System tags cannot be deleted"
                        : "Delete tag"
                    }
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
                              handleRenameValue(
                                tag.id,
                                value.id,
                                editingValueText,
                              )
                            }
                            disabled={busyId === value.id}
                          >
                            {busyId === value.id ? (
                              <Loader2 className="mr-1 size-4 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingValueId(null);
                              setEditingValueText("");
                            }}
                          >
                            Cancel
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
                            aria-label="Edit option"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="text-slate-400 transition hover:text-red-500"
                            onClick={() => handleDeleteValue(tag.id, value.id)}
                            disabled={busyId === value.id}
                            aria-label="Delete option"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {(tag.values ?? []).length === 0 ? (
                    <span className="text-xs text-slate-500">
                      No options yet, please add.
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Add option values, e.g., P1 / P2 / P3"
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
                    Add value
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
