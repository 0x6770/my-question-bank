"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type TreeNode = {
  id: number | string;
  label: string;
  value?: number; // Actual value for leaf nodes
  children?: TreeNode[];
  level?: number;
  // For validation: associate leaf nodes with subjects
  subjectId?: number;
  subjectName?: string;
};

type MultiTreeSelectProps = {
  data: TreeNode[];
  value: number[];
  onValueChange: (value: number[]) => void;
  placeholder?: string;
  className?: string;
  selectableParents?: boolean;
  disabled?: boolean;
  // Constraint: only allow one selection per subject
  onePerSubject?: boolean;
};

export function MultiTreeSelect({
  data,
  value,
  onValueChange,
  placeholder = "Select...",
  className,
  selectableParents = false,
  disabled = false,
  onePerSubject = true,
}: MultiTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Build a map from value to node for quick lookup
  const valueToNodeMap = new Map<number, TreeNode>();
  const buildValueMap = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.value !== undefined) {
        valueToNodeMap.set(node.value, node);
      }
      if (node.children) {
        buildValueMap(node.children);
      }
    }
  };
  buildValueMap(data);

  // Get selected labels with full path
  const getNodeLabel = (
    nodes: TreeNode[],
    targetValue: number,
    path: string[] = [],
  ): string | null => {
    for (const node of nodes) {
      const currentPath = [...path, node.label];
      if (node.value === targetValue) {
        return currentPath.join(" > ");
      }
      if (node.children) {
        const result = getNodeLabel(node.children, targetValue, currentPath);
        if (result) return result;
      }
    }
    return null;
  };

  // Get subject IDs already selected
  const selectedSubjectIds = new Set<number>();
  for (const v of value) {
    const node = valueToNodeMap.get(v);
    if (node?.subjectId !== undefined) {
      selectedSubjectIds.add(node.subjectId);
    }
  }

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

  const handleToggleSelect = (node: TreeNode) => {
    if (disabled || node.value === undefined) return;

    const isCurrentlySelected = value.includes(node.value);

    if (isCurrentlySelected) {
      // Remove from selection
      onValueChange(value.filter((v) => v !== node.value));
    } else {
      // Add to selection, but check onePerSubject constraint
      if (onePerSubject && node.subjectId !== undefined) {
        // Check if we already have a selection from this subject
        if (selectedSubjectIds.has(node.subjectId)) {
          // Replace the existing selection from this subject
          const newValue = value.filter((v) => {
            const existingNode = valueToNodeMap.get(v);
            return existingNode?.subjectId !== node.subjectId;
          });
          onValueChange([...newValue, node.value]);
          return;
        }
      }
      onValueChange([...value, node.value]);
    }
  };

  const handleRemove = (nodeValue: number) => {
    if (!disabled) {
      onValueChange(value.filter((v) => v !== nodeValue));
    }
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = node.value !== undefined && value.includes(node.value);
    const canSelect =
      !disabled &&
      node.value !== undefined &&
      (selectableParents || !hasChildren);

    // Check if this node's subject is already selected (for showing disabled state)
    const isSubjectAlreadySelected =
      onePerSubject &&
      node.subjectId !== undefined &&
      selectedSubjectIds.has(node.subjectId) &&
      !isSelected;

    const handleLabelClick = () => {
      if (disabled) return;
      if (canSelect) {
        handleToggleSelect(node);
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
            isSelected && "bg-blue-50 font-medium text-blue-900",
            disabled ? "text-slate-400" : "hover:bg-slate-100",
            isSubjectAlreadySelected && "text-slate-400",
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
          {canSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggleSelect(node)}
              disabled={disabled}
              className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
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
            {isSubjectAlreadySelected && (
              <span className="ml-2 text-xs text-slate-400">
                (另一章节已选)
              </span>
            )}
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
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={cn(
          "min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-200 text-left flex items-center justify-between gap-2 cursor-pointer",
          disabled && "cursor-not-allowed bg-slate-50 text-slate-400",
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {value.length === 0 ? (
            <span className="text-slate-500">{placeholder}</span>
          ) : (
            value.map((v) => {
              const label = getNodeLabel(data, v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                >
                  {label || `ID: ${v}`}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(v);
                    }}
                    disabled={disabled}
                    className="hover:text-slate-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-500 transition-transform flex-shrink-0",
            isOpen && "rotate-180",
          )}
        />
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
