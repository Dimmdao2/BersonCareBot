import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { doctorSectionCardClass } from "@/shared/ui/doctor/doctorVisual";

const variants = {
  /** Doctor CMS / content hub — §4.1 page-level section. */
  default: doctorSectionCardClass,
  compact: doctorSectionCardClass,
  /** Slightly roomier content hero block (still page-level, no shadow). */
  hero: "rounded-xl border border-border bg-card p-4 flex flex-col gap-3",
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
