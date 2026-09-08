'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/patient/primitives/collapsible';
import { cn } from '@/lib/utils';
import { NAV_STRIP_ICON_STROKE } from '@/shared/ui/patient/navChrome';
import {
  patientCaptionTextClass,
  patientSectionTitleNormalClass,
} from '@/shared/ui/patient/patientVisual';

const scheduleCardChrome = cn(
  'overflow-visible rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]',
  'shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]',
  'border border-[var(--patient-action-warning-hover-bg)] bg-[var(--patient-warning-card-gradient)]',
  'patient-text-primary',
);

/** Продолжение хром подписи карточки при раскрытии (полная ширина колонки страницы). */
const scheduleExpandedPanelClass = cn(
  'border-x border-b border-[var(--patient-action-warning-hover-bg)] bg-[linear-gradient(180deg,#fffbf5_0%,#fff9f0_55%,#fff6ea_100%)]',
  'rounded-b-[var(--patient-card-radius-mobile)] md:rounded-b-[var(--patient-card-radius-desktop)]',
  'shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]',
  'border-t border-[var(--patient-action-warning-border)]/50',
);

export type PatientPlanTodayRemindersCardProps = {
  rehabTodayLine: string;
  warmupTodayLine: string | null;
  remindersHref: string;
  /** Узкая кнопка/ссылка в одну строку с триггером (напр. поддержка); корень блока занимает ширину колонки страницы. */
  trailingAccessory?: ReactNode;
  /** Начальное состояние раскрытия. */
  defaultOpen?: boolean;
  /** «Упражнения»: только блок про тренировки на сегодня. */
  variant?: 'schedule' | 'trainingsToday';
};

/** Без `w-full` / `min-h-10` из `patientButtonWarningOutlineClass` — узкая CTA у правого края. */
const configureScheduleButtonClass = cn(
  'inline-flex shrink-0 items-center justify-center self-start rounded-sm border border-[var(--patient-action-warning-border)] bg-[var(--patient-action-warning-bg)] px-2 py-1 patient-type-caption patient-text-warning transition-colors',
  'hover:bg-[var(--patient-action-warning-hover-bg)]/80 active:bg-[var(--patient-action-warning-hover-bg)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-warning)]',
);

export function PatientPlanTodayRemindersCard({
  rehabTodayLine,
  warmupTodayLine,
  remindersHref,
  trailingAccessory,
  defaultOpen = false,
  variant = 'schedule',
}: PatientPlanTodayRemindersCardProps) {
  const [scheduleOpen, setScheduleOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={scheduleOpen}
      onOpenChange={setScheduleOpen}
      className="flex min-w-0 w-full flex-col gap-0"
    >
      <div
        className={cn('flex min-w-0 w-full', trailingAccessory ? 'flex-row items-start gap-2' : '')}
      >
        <CollapsibleTrigger
          type="button"
          className={cn(
            scheduleCardChrome,
            'flex min-h-0 min-w-0 items-center justify-between gap-2 px-3 py-2 text-left outline-none',
            trailingAccessory ? 'flex-1' : 'w-full',
            'ring-offset-background focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2',
            scheduleOpen && 'rounded-b-none border-b-transparent shadow-none',
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Bell
              className="size-[18px] shrink-0 patient-text-accent"
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
            />
            <h2 className={cn(patientSectionTitleNormalClass, 'm-0 min-w-0 truncate')}>
              Расписание
            </h2>
          </span>
          <ChevronDown
            className="size-3.5 shrink-0 patient-text-accent transition-transform group-data-[open]/collapsible:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        {trailingAccessory ?? null}
      </div>
      <CollapsibleContent className="outline-none">
        <div className={cn(scheduleExpandedPanelClass, 'px-3 py-3 md:px-3.5')}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              {variant === 'trainingsToday' ? (
                <>
                  <p className={cn(patientCaptionTextClass, 'patient-text-home-heading')}>
                    Тренировки на сегодня
                  </p>
                  <p className={cn(patientCaptionTextClass, 'patient-text-accent')}>
                    {rehabTodayLine}
                  </p>
                </>
              ) : (
                <>
                  <p className={cn(patientCaptionTextClass, 'patient-text-accent')}>
                    Тренировки: {rehabTodayLine}
                  </p>
                  {warmupTodayLine != null ? (
                    <p className={cn(patientCaptionTextClass, 'patient-text-accent')}>
                      Разминки: {warmupTodayLine}
                    </p>
                  ) : null}
                </>
              )}
            </div>
            <Link href={remindersHref} prefetch={false} className={configureScheduleButtonClass}>
              Настроить
            </Link>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
