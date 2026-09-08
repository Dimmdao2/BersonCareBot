import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PatientDiaryWeekNavModel } from '@/modules/diaries/loadPatientDiaryWeekWellbeing';
import {
  PatientSegmentedPagerDisabledCell,
  PatientSegmentedPagerLabel,
  PatientSegmentedPagerLink,
  PatientSegmentedStrip,
} from '@/shared/ui/patient/PatientSegmentedStrip';

/** Липнет под реальным fixed patient header, включая fade-spacer. */
const STICKY_UNDER_HEADER_CLASS = 'sticky top-[var(--patient-header-total-offset)] z-30';

const pagerArrowClass = 'max-w-[4.5rem] px-2 sm:max-w-none sm:px-3';

export function PatientDiaryWeekNavStrip({ nav }: { nav: PatientDiaryWeekNavModel }) {
  return (
    <div
      className={cn(STICKY_UNDER_HEADER_CLASS, 'mb-4 pb-2 pt-1')}
      style={{
        background:
          'linear-gradient(to bottom, var(--patient-bg) 0%, var(--patient-bg) 88%, transparent 100%)',
      }}
    >
      <PatientSegmentedStrip
        rounded="lg"
        aria-label="Выбор недели в статистике"
      >
        {nav.canGoPrev && nav.prevHref ? (
          <PatientSegmentedPagerLink
            href={nav.prevHref}
            className={pagerArrowClass}
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
          </PatientSegmentedPagerLink>
        ) : (
          <PatientSegmentedPagerDisabledCell className={pagerArrowClass}>
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
          </PatientSegmentedPagerDisabledCell>
        )}

        <PatientSegmentedPagerLabel
          width="wide"
          className="px-2"
        >
          {nav.weekRangeLabelRu}
        </PatientSegmentedPagerLabel>

        {nav.canGoNext && nav.nextHref ? (
          <PatientSegmentedPagerLink
            href={nav.nextHref}
            className={pagerArrowClass}
            aria-label="Следующая неделя"
          >
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </PatientSegmentedPagerLink>
        ) : (
          <PatientSegmentedPagerDisabledCell className={pagerArrowClass}>
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          </PatientSegmentedPagerDisabledCell>
        )}
      </PatientSegmentedStrip>
    </div>
  );
}
