import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PatientDailyWarmupNav } from "@/modules/patient-home/todayConfig";
import { cn } from "@/lib/utils";

function navButtonClass() {
  return cn(
    "flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold outline-none transition-colors duration-150 no-underline",
    "cursor-pointer bg-[#f8f3fd] text-[#444444] hover:bg-[#ede8f8] active:bg-[#e4e2ff]",
    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--patient-color-primary,#284da0)]",
  );
}

type Props = {
  nav: PatientDailyWarmupNav;
};

/** Перелистывание разминок дня (список блока `daily_warmup` на главной). */
export function PatientDailyWarmupPager({ nav }: Props) {
  return (
    <nav
      className="sticky top-0 z-[5] flex shrink-0 items-stretch gap-px overflow-hidden rounded-[var(--patient-card-radius-mobile)] border border-[var(--patient-border,#ddd6fe)] bg-[var(--patient-border,#ddd6fe)] shadow-sm lg:rounded-[var(--patient-card-radius-desktop)]"
      aria-label="Навигация по разминкам дня"
    >
      <Link href={nav.prevHref} className={navButtonClass()} aria-label="Предыдущая разминка">
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        <span className="sr-only sm:not-sr-only text-xs">Пред.</span>
      </Link>
      <div className="flex min-h-[2.75rem] min-w-0 flex-[1.4] items-center justify-center bg-[#f8f3fd] px-3 py-2 text-center text-xs font-medium text-[#555555]">
        {`Разминка дня ${nav.index + 1} / ${nav.total}`}
      </div>
      <Link href={nav.nextHref} className={navButtonClass()} aria-label="Следующая разминка">
        <span className="sr-only sm:not-sr-only text-xs">След.</span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </Link>
    </nav>
  );
}
