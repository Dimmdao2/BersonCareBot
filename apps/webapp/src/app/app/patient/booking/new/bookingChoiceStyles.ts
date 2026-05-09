import { cn } from "@/lib/utils";
import { patientHeroBookingSectionClass } from "@/shared/ui/patientVisual";

/** Обёртка блока выбора (город/онлайн, услуги): см. {@link patientHeroBookingSectionClass}. */
export const bookingChoiceSectionClass = patientHeroBookingSectionClass;

/** Ряд выбора: белый фон, синий hover/active по всей площади; без иконок — только класс строки. */
export const bookingChoiceRowClass = cn(
  "group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-[var(--patient-border)] bg-white px-3 py-3",
  "text-sm font-medium text-[var(--patient-text-primary)] transition-colors",
  "hover:border-[var(--patient-color-primary,#284da0)] hover:bg-[var(--patient-color-primary,#284da0)] hover:text-white",
  "active:border-[var(--patient-color-primary,#284da0)] active:bg-[var(--patient-color-primary,#284da0)] active:text-white",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

/** Иконки слева в рядах «город / онлайн». */
export const bookingChoiceRowIconClass =
  "size-5 shrink-0 text-[var(--patient-text-muted)] transition-colors group-hover:text-white group-active:text-white";
