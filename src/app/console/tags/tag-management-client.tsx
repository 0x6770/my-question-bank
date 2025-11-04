"use client";

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

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

type TagNode = TagRow & { children: TagNode[] };

type Feedback = { type: "success" | "error"; message: string };

type TagManagementProps = {
  initialTags: TagRow[];
  loadError: string | null;
};

function buildTagTree(tags: TagRow[]): TagNode[] {
  const map = new Map<number, TagNode>();

  tags.forEach((tag) => {
    map.set(tag.id, { ...tag, children: [] });
  });

  const roots: TagNode[] = [];

  map.forEach((node) => {
    if (node.parent_id != null) {
      const parent = map.get(node.parent_id);
      if (parent) {
        parent.children.push(node);
        return;
      }
    }

    roots.push(node);
  });

  const sortTree = (nodes: TagNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((child) => {
      sortTree(child.children);
    });
  };

  sortTree(roots);

  return roots;
}

type TagOption = { id: number; label: string };

function flattenTree(nodes: TagNode[], depth = 0, acc: TagOption[] = []) {
  nodes.forEach((node) => {
    const prefix = depth === 0 ? "" : `${"--".repeat(depth)} `;
    acc.push({ id: node.id, label: `${prefix}${node.name}`.trim() });
    flattenTree(node.children, depth + 1, acc);
  });
  return acc;
}

export function TagManagement({ initialTags, loadError }: TagManagementProps) {
  const [tags, setTags] = useState<TagRow[]>(initialTags);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
    const defaults = new Set<number>();
    initialTags.forEach((tag) => {
      if (tag.parent_id === null) {
        defaults.add(tag.id);
      }
    });
    return defaults;
  });
  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyTagId, setBusyTagId] = useState<number | null>(null);
  const [formFeedback, setFormFeedback] = useState<Feedback | null>(null);
  const [listFeedback, setListFeedback] = useState<Feedback | null>(
    loadError
      ? {
          type: "error",
          message: loadError,
        }
      : null,
  );

  const tree = useMemo(() => buildTagTree(tags), [tags]);
  const parentOptions = useMemo(() => flattenTree(tree), [tree]);

  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const supabase = useMemo(() => createClient(), []);

  const clearFormFields = () => {
    setFormName("");
    setFormParentId("");
    nameInputRef.current?.focus();
  };

  const resetForm = () => {
    clearFormFields();
    setFormFeedback(null);
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormFeedback(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormFeedback({
        type: "error",
        message: "Tag name is required.",
      });
      return;
    }

    const parentId =
      formParentId === "" ? null : Number.parseInt(formParentId, 10);

    setIsSubmitting(true);

    const { data, error } = await supabase
      .from("tags")
      .insert({ name: trimmedName, parent_id: parentId })
      .select("id, name, parent_id, created_at")
      .single();

    setIsSubmitting(false);

    if (error || !data) {
      setFormFeedback({
        type: "error",
        message: error?.message ?? "Failed to create tag.",
      });
      return;
    }

    setTags((prev) => [...prev, data]);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (data.parent_id) {
        next.add(data.parent_id);
      } else {
        next.add(data.id);
      }
      return next;
    });
    setFormFeedback({
      type: "success",
      message: `Created tag "${data.name}".`,
    });
    clearFormFields();
  };

  const handlePrepareChild = (tagId: number) => {
    setFormParentId(String(tagId));
    setFormFeedback(null);
    setListFeedback(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInputRef.current?.focus();
  };

  const handleRename = async (tag: TagRow) => {
    const nextName = window.prompt("Rename tag", tag.name);
    if (nextName == null) {
      return;
    }

    const trimmed = nextName.trim();
    if (!trimmed || trimmed === tag.name) {
      return;
    }

    setBusyTagId(tag.id);
    const { error } = await supabase
      .from("tags")
      .update({ name: trimmed })
      .eq("id", tag.id);
    setBusyTagId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message: error.message,
      });
      return;
    }

    setTags((prev) =>
      prev.map((item) =>
        item.id === tag.id ? { ...item, name: trimmed } : item,
      ),
    );
    setListFeedback({
      type: "success",
      message: `Renamed tag to "${trimmed}".`,
    });
  };

  const handleDelete = async (tag: TagRow) => {
    const hasChildren = tags.some((item) => item.parent_id === tag.id);
    if (hasChildren) {
      setListFeedback({
        type: "error",
        message: "Please remove child tags before deleting this tag.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete the tag "${tag.name}"?`,
    );
    if (!confirmed) {
      return;
    }

    setBusyTagId(tag.id);
    const { error } = await supabase.from("tags").delete().eq("id", tag.id);
    setBusyTagId(null);

    if (error) {
      setListFeedback({
        type: "error",
        message: error.message,
      });
      return;
    }

    setTags((prev) => prev.filter((item) => item.id !== tag.id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(tag.id);
      return next;
    });
    setListFeedback({
      type: "success",
      message: `Deleted tag "${tag.name}".`,
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Tag Management
          </h1>
          <p className="text-sm text-slate-500">
            创建、分层和维护题目标签，以便后续筛选与分类。
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            formRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
          className="bg-slate-900 text-white hover:bg-slate-900/90"
        >
          <Plus className="size-4" aria-hidden="true" />
          New Tag
        </Button>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Create New Tag</CardTitle>
          <CardDescription>
            输入标签名称并可选地指定上级标签，构建层级结构。
          </CardDescription>
          {formFeedback ? (
            <CardAction>
              <span
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  formFeedback.type === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700",
                )}
              >
                {formFeedback.message}
              </span>
            </CardAction>
          ) : null}
        </CardHeader>
        <form ref={formRef} className="flex flex-col" onSubmit={handleCreate}>
          <CardContent className="space-y-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Tag Name</Label>
              <Input
                id="tag-name"
                ref={nameInputRef}
                placeholder="Enter tag name"
                value={formName}
                onChange={(event) => {
                  setFormName(event.target.value);
                  if (formFeedback) {
                    setFormFeedback(null);
                  }
                }}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent-tag">
                Parent Tag{" "}
                <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <select
                id="parent-tag"
                className="border-input h-9 w-full rounded-md border bg-white px-3 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                value={formParentId}
                onChange={(event) => {
                  setFormParentId(event.target.value);
                  if (formFeedback) {
                    setFormFeedback(null);
                  }
                }}
                disabled={isSubmitting}
              >
                <option value="">None (Root Level)</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
          <CardFooter className="border-t justify-end gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
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

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">Existing Tags</CardTitle>
          <CardDescription>
            查看标签层级，快速添加子标签、重命名或删除。
          </CardDescription>
          {listFeedback ? (
            <CardAction>
              <span
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium",
                  listFeedback.type === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700",
                )}
              >
                {listFeedback.message}
              </span>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="px-0 py-0">
          {tags.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-500">
              暂无标签，请先创建一个新的标签。
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tree.map((node) => (
                <TagTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  expandedIds={expandedIds}
                  onToggle={toggleExpanded}
                  onCreateChild={handlePrepareChild}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  busyTagId={busyTagId}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type TagTreeItemProps = {
  node: TagNode;
  depth: number;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  onCreateChild: (id: number) => void;
  onRename: (tag: TagRow) => void;
  onDelete: (tag: TagRow) => void;
  busyTagId: number | null;
};

function TagTreeItem({
  node,
  depth,
  expandedIds,
  onToggle,
  onCreateChild,
  onRename,
  onDelete,
  busyTagId,
}: TagTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <li className="flex flex-col">
      <div
        className={cn(
          "flex items-center justify-between gap-4 px-6 py-3 text-sm",
          depth === 0 ? "bg-slate-50/80" : "bg-white",
        )}
        style={{ paddingLeft: 24 + depth * 20 }}
      >
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="flex size-6 items-center justify-center rounded-md border border-transparent text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="size-6" />
          )}
          <span className="font-medium text-slate-800">{node.name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onCreateChild(node.id)}
            className="text-slate-600 hover:text-slate-900"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onRename(node)}
            disabled={busyTagId === node.id}
            className="text-slate-600 hover:text-slate-900"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onDelete(node)}
            disabled={busyTagId === node.id}
            className="text-red-500 hover:text-red-600"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <ul>
          {node.children.map((child) => (
            <TagTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
              onRename={onRename}
              onDelete={onDelete}
              busyTagId={busyTagId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
