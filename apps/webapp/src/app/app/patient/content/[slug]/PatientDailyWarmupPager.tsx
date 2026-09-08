import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PatientDailyWarmupNav } from '@/modules/patient-home/todayConfig';
import {
  PatientSegmentedPagerLabel,
  PatientSegmentedPagerLink,
  PatientSegmentedStrip,
} from '@/shared/ui/patient/PatientSegmentedStrip';

type Props = {
  nav: PatientDailyWarmupNav;
};

/** Перелистывание разминок дня (список блока `daily_warmup` на главной). */
export function PatientDailyWarmupPager({ nav }: Props) {
  return (
    <PatientSegmentedStrip
      as="nav"
      rounded="card"
      className="sticky top-0 z-[5]"
      aria-label="Навигация по разминкам дня"
    >
      <PatientSegmentedPagerLink href={nav.prevHref} aria-label="Предыдущая разминка">
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        <span className="sr-only sm:not-sr-only text-xs">Пред.</span>
      </PatientSegmentedPagerLink>
      <PatientSegmentedPagerLabel width="compact" className="flex-col">
        <span>Разминка дня</span>
        <span>{`${nav.index + 1} из ${nav.total}`}</span>
      </PatientSegmentedPagerLabel>
      <PatientSegmentedPagerLink href={nav.nextHref} aria-label="Следующая разминка">
        <span className="sr-only sm:not-sr-only text-xs">След.</span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </PatientSegmentedPagerLink>
    </PatientSegmentedStrip>
  );
}
