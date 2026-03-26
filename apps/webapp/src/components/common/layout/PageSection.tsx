import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "rounded-2xl border border-border bg-card p-4 shadow-sm",
  compact: "rounded-xl border border-border bg-card p-3",
  hero: "rounded-2xl border border-border bg-card p-6 shadow-sm",
} as const;

type PageSectionProps = {
  variant?: keyof typeof variants;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
  id?: string;
};

export function PageSection({ variant = "default", className, children, as: Comp = "section", id }: PageSectionProps) {
  return (
    <Comp id={id} className={cn(variants[variant], className)}>
      {children}
    </Comp>
  );
}
