import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PatientDiaryWeekNavModel } from "@/modules/diaries/loadPatientDiaryWeekWellbeing";

/** Высота полосы под меню ≈ {@link DiaryTabsClient} (`top-14` + PatientHeader). */
const STICKY_UNDER_HEADER_CLASS = "sticky top-14 z-30";

const navButtonLayoutClass =
  "flex min-h-[2.75rem] flex-1 max-w-[4.5rem] items-center justify-center gap-1.5 px-2 py-2 text-sm font-semibold outline-none transition-colors duration-150 no-underline sm:max-w-none sm:px-3";

const navButtonEnabledClass = cn(
  navButtonLayoutClass,
  "bg-[#f8f3fd] text-[#444444]",
  "cursor-pointer hover:bg-[#ede8f8] active:bg-[#e4e2ff]",
  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--patient-color-primary,#284da0)]",
);

/** Неактивные стрелки — явно блеклые, без общей opacity (иначе сливаются с hover активной). */
const navButtonDisabledClass = cn(
  navButtonLayoutClass,
  "pointer-events-none bg-[#faf9fc] text-[#d4d0e0]",
);

export function PatientDiaryWeekNavStrip({ nav }: { nav: PatientDiaryWeekNavModel }) {
  return (
    <div
      className={cn(STICKY_UNDER_HEADER_CLASS, "mb-4 pb-2 pt-1")}
      style={{
        background:
          "linear-gradient(to bottom, var(--patient-bg) 0%, var(--patient-bg) 88%, transparent 100%)",
      }}
    >
      <div
        className="flex w-full shrink-0 items-stretch gap-px overflow-hidden rounded-lg border border-[var(--patient-border,#ddd6fe)] bg-[var(--patient-border,#ddd6fe)] shadow-sm"
        aria-label="Выбор недели в дневнике"
      >
      {nav.canGoPrev && nav.prevHref ?
        <Link href={nav.prevHref} className={navButtonEnabledClass} aria-label="Предыдущая неделя">
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
        </Link>
      : <span className={navButtonDisabledClass} aria-hidden>
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
        </span>
      }

      <div className="flex min-h-[2.75rem] min-w-0 flex-[2] items-center justify-center bg-[#f8f3fd] px-2 py-2 text-center text-xs font-medium leading-snug text-[#555555] sm:text-sm">
        {nav.weekRangeLabelRu}
      </div>

      {nav.canGoNext && nav.nextHref ?
        <Link href={nav.nextHref} className={navButtonEnabledClass} aria-label="Следующая неделя">
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      : <span className={navButtonDisabledClass} aria-hidden>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </span>
      }
      </div>
    </div>
  );
}
