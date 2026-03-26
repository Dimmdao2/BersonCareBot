import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const levelClasses = {
  page: "text-xl font-semibold tracking-tight",
  section: "text-lg font-semibold",
  subsection: "text-base font-medium",
  eyebrow: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
} as const;

const defaultTags: Record<keyof typeof levelClasses, ElementType> = {
  page: "h1",
  section: "h2",
  subsection: "h3",
  eyebrow: "span",
};

type SectionHeadingProps = {
  level: keyof typeof levelClasses;
  className?: string;
  children: ReactNode;
  as?: ElementType;
};

export function SectionHeading({ level, className, children, as }: SectionHeadingProps) {
  const Comp = as ?? defaultTags[level];
  return <Comp className={cn(levelClasses[level], className)}>{children}</Comp>;
}
