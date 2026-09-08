'use client';

import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/patient/primitives/popover';
import { Info } from 'lucide-react';
import type {
  TreatmentProgramEventRow,
  TreatmentProgramInstanceDetail,
} from '@/modules/treatment-program/types';
import { formatTreatmentProgramEventTypeRu } from '@/modules/treatment-program/types';
import { cn } from '@/lib/utils';
import { formatBookingDateTimeShortStyleRu } from '@/shared/lib/formatBusinessDateTime';
import { buildProgramHistoryNarrative } from '@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters';

export function PatientProgramHeroHistoryPopover(props: {
  detail: TreatmentProgramInstanceDetail;
  appDisplayTimeZone: string;
  programEvents: TreatmentProgramEventRow[];
}) {
  const { detail, appDisplayTimeZone, programEvents } = props;
  const narrative = useMemo(
    () => buildProgramHistoryNarrative(detail, appDisplayTimeZone),
    [detail, appDisplayTimeZone],
  );
  /** Сырые `status_changed` дают пачку одинаковых строк; статус уже отражён в «Важные даты». */
  const eventsForPatient = useMemo(
    () => programEvents.filter((e) => e.eventType !== 'status_changed'),
    [programEvents],
  );
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-20 lg:right-3 lg:top-3">
      <Popover>
        <PopoverTrigger
          type="button"
          className={cn(
            'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent patient-text-accent outline-none transition-opacity touch-manipulation',
            'hover:opacity-80 active:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--patient-color-primary)] focus-visible:ring-offset-2',
          )}
          aria-label="История программы"
        >
          <Info className="size-[17px] shrink-0 stroke-[2.25]" aria-hidden />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={6}
          className="w-[min(100%,18.5rem)] max-w-full max-h-[min(70vh,24rem)] overflow-y-auto p-3 patient-type-secondary patient-text-primary"
        >
          <p className="m-0 patient-type-caption uppercase tracking-wide patient-text-secondary">
            Важные даты
          </p>
          <ul className="mt-2 max-w-full list-none space-y-1.5 p-0 [word-break:break-word]">
            {narrative.map((line, i) => (
              <li key={i} className="patient-type-secondary patient-text-primary">
                {line}
              </li>
            ))}
          </ul>
          {eventsForPatient.length > 0 ? (
            <>
              <hr className="my-2.5 border-border/60" />
              <p className="m-0 patient-type-caption uppercase tracking-wide patient-text-secondary">
                События
              </p>
              <ul className="mt-2 max-w-full list-none space-y-1 p-0 [word-break:break-word]">
                {eventsForPatient.map((e) => (
                  <li key={e.id} className="patient-type-caption patient-text-secondary">
                    {formatBookingDateTimeShortStyleRu(e.createdAt, appDisplayTimeZone)} —{' '}
                    {formatTreatmentProgramEventTypeRu(e.eventType)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
