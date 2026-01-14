"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type TreeNode = {
  id: number | string;
  label: string;
  value?: number; // Actual value for leaf nodes
  children?: TreeNode[];
  level?: number;
  // For multi-select constraint validation
  subjectId?: number;
  subjectName?: string;
};

type TreeSelectProps = {
  data: TreeNode[];
  value: number | null;
  onValueChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
  selectableParents?: boolean;
  disabled?: boolean;
};

export function TreeSelect({
  data,
  value,
  onValueChange,
  placeholder = "Select...",
  className,
  selectableParents = false,
  disabled = false,
}: TreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Get selected label with full path
  const getSelectedLabel = (
    nodes: TreeNode[],
    targetValue: number | null,
    path: string[] = [],
  ): string | null => {
    if (targetValue === null) return null;
    for (const node of nodes) {
      const currentPath = [...path, node.label];
      if (node.value === targetValue) {
        return currentPath.join(" > ");
      }
      if (node.children) {
        const result = getSelectedLabel(
          node.children,
          targetValue,
          currentPath,
        );
        if (result) return result;
      }
    }
    return null;
  };

  const selectedLabel = getSelectedLabel(data, value);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [disabled, isOpen]);

  const toggleExpand = (id: string | number) => {
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

  const handleSelect = (nodeValue: number | undefined) => {
    if (!disabled && nodeValue !== undefined) {
      onValueChange(nodeValue);
      setIsOpen(false);
    }
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = node.value !== undefined && node.value === value;
    const canSelect =
      !disabled &&
      node.value !== undefined &&
      (selectableParents || !hasChildren);

    const handleLabelClick = () => {
      if (disabled) return;
      if (canSelect) {
        handleSelect(node.value);
        return;
      }
      if (hasChildren) {
        toggleExpand(node.id);
      }
    };

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 text-sm rounded w-full text-left",
            isSelected && "bg-slate-100 font-medium",
            disabled ? "text-slate-400" : "hover:bg-slate-100",
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggleExpand(node.id)}
              className={cn(
                "flex-shrink-0",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <button
            type="button"
            onClick={handleLabelClick}
            disabled={disabled}
            className={cn(
              "flex-1 truncate text-left",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            {node.label}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children?.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            setIsOpen(!isOpen);
          }}
          disabled={disabled}
          className={cn(
            "h-10 w-full flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200 text-left flex items-center justify-between",
            disabled && "cursor-not-allowed bg-slate-50 text-slate-400",
          )}
        >
          <span className={cn(!selectedLabel && "text-slate-500")}>
            {selectedLabel || placeholder}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-500 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>
        {value !== null && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onValueChange(null)}
            title="Clear selection"
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg max-h-80 overflow-y-auto">
          <div className="p-1">
            {data.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">
                No options available
              </div>
            ) : (
              data.map((node) => renderNode(node, 0))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
