import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import {
  doctorSectionCardClass,
  doctorSectionHeaderStackClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctorVisual";

type DoctorSectionProps = ComponentPropsWithoutRef<"section">;

export function DoctorSection({ className, ...props }: DoctorSectionProps) {
  return <section className={cn(doctorSectionCardClass, className)} {...props} />;
}

type DoctorSectionHeaderProps = ComponentPropsWithoutRef<"div">;

export function DoctorSectionHeader({ className, ...props }: DoctorSectionHeaderProps) {
  return <div className={cn(doctorSectionHeaderStackClass, className)} {...props} />;
}

type DoctorSectionTitleProps = ComponentPropsWithoutRef<"h2">;

export function DoctorSectionTitle({ className, ...props }: DoctorSectionTitleProps) {
  return <h2 className={cn(doctorSectionTitleClass, className)} {...props} />;
}
