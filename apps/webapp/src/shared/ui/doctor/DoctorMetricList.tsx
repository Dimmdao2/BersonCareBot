import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { doctorStatCardGridClass } from "@/shared/ui/doctor/doctorVisual";

type DoctorMetricListProps = ComponentPropsWithoutRef<"div">;

export function DoctorMetricList({ className, ...props }: DoctorMetricListProps) {
  return <div className={cn(doctorStatCardGridClass, className)} {...props} />;
}
