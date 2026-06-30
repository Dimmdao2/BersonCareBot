import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import {
  doctorEmptyStateClass,
  doctorEmptyStateCompactClass,
} from "@/shared/ui/doctor/doctorVisual";

type DoctorEmptyStateProps = ComponentPropsWithoutRef<"div"> & {
  /** `"sm"` (default) for page-level lists; `"xs"` for inline hints inside dense panels. */
  size?: "sm" | "xs";
};

export function DoctorEmptyState({ className, size = "sm", ...props }: DoctorEmptyStateProps) {
  const base = size === "xs" ? doctorEmptyStateCompactClass : doctorEmptyStateClass;
  return <div className={cn(base, className)} {...props} />;
}
