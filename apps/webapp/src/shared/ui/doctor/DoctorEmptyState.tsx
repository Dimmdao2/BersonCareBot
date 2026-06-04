import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { doctorEmptyStateClass } from "@/shared/ui/doctor/doctorVisual";

type DoctorEmptyStateProps = ComponentPropsWithoutRef<"div">;

export function DoctorEmptyState({ className, ...props }: DoctorEmptyStateProps) {
  return <div className={cn(doctorEmptyStateClass, className)} {...props} />;
}
