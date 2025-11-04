import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = {
  default: "bg-slate-900 text-white hover:bg-slate-900/90",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-100/80",
  outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
};

type BadgeVariant = keyof typeof badgeVariants;

type BadgeProps = React.ComponentProps<"span"> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
