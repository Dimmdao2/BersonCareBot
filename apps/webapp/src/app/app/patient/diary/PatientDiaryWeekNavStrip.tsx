import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PatientDiaryWeekNavModel } from "@/modules/diaries/loadPatientDiaryWeekWellbeing";

const navButtonClass = (enabled: boolean) =>
  cn(
    "flex min-h-[2.75rem] flex-1 max-w-[4.5rem] items-center justify-center gap-1.5 px-2 py-2 text-sm font-semibold outline-none transition-colors duration-150 no-underline sm:max-w-none sm:px-3",
    "bg-[#f8f3fd] text-[#444444]",
    enabled && "cursor-pointer hover:bg-[#ede8f8] active:bg-[#e4e2ff]",
    enabled && "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--patient-color-primary,#284da0)]",
    !enabled && "pointer-events-none opacity-40",
  );

export function PatientDiaryWeekNavStrip({ nav }: { nav: PatientDiaryWeekNavModel }) {
  return (
    <div
      className="mb-4 flex w-full shrink-0 items-stretch gap-px overflow-hidden rounded-lg border border-[var(--patient-border,#ddd6fe)] bg-[var(--patient-border,#ddd6fe)] shadow-sm"
      aria-label="Выбор недели в дневнике"
    >
      {nav.canGoPrev && nav.prevHref ?
        <Link href={nav.prevHref} className={navButtonClass(true)} aria-label="Предыдущая неделя">
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
        </Link>
      : <span className={navButtonClass(false)} aria-hidden>
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
        </span>
      }

      <div className="flex min-h-[2.75rem] min-w-0 flex-[2] items-center justify-center bg-[#f8f3fd] px-2 py-2 text-center text-xs font-medium leading-snug text-[#555555] sm:text-sm">
        {nav.weekRangeLabelRu}
      </div>

      {nav.canGoNext && nav.nextHref ?
        <Link href={nav.nextHref} className={navButtonClass(true)} aria-label="Следующая неделя">
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      : <span className={navButtonClass(false)} aria-hidden>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </span>
      }
    </div>
  );
}
