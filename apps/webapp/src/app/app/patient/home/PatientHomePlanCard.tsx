import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import {
  patientHomePlanCardClass,
  patientHomePlanCardCompactShellClass,
  patientHomePlanCardHeadingCompactClass,
  patientHomePlanCardTitleCompactClass,
  patientIconLeadingClass,
} from './patientHomeCardStyles';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { PatientHomeSafeImage } from './PatientHomeSafeImage';
import { cn } from '@/lib/utils';

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = {
  instance: PatientHomePlanCardInstance;
  /** Цель ссылки «Начать занятие» — пункт программы (exec) или обзор программы. */
  startLessonHref: string;
  /** «День N»; `null` — не показывать. */
  progressDay?: number | null;
  /** Были ли отметки по программе сегодня (чек-лист / активность за день). */
  todayPracticeDone?: boolean;
  blockIconImageUrl?: string | null;
  /** A5: одна строка для Today («План обновлён …»), если есть неснятые изменения. */
  planUpdatedLabel?: string | null;
};

function LeadingPlanIcon({ blockIconImageUrl }: { blockIconImageUrl?: string | null }) {
  return (
    <div className={cn(patientIconLeadingClass, 'size-9 shrink-0 bg-[var(--patient-home-plan-icon-bg)]')} aria-hidden>
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className="size-5 rounded-full object-cover"
        loading="lazy"
        fallback={<ClipboardList className="size-5 patient-text-accent" />}
      />
    </div>
  );
}

const planCtaClass = cn(
  'inline-flex min-h-8 shrink-0 items-center justify-center rounded-md border border-[var(--patient-home-plan-action-border)] bg-[var(--patient-home-plan-action-bg)] px-3 patient-type-home-compact-action patient-text-accent shadow-[var(--patient-home-plan-action-shadow)] transition-colors sm:min-h-9 sm:px-4',
  'hover:bg-[var(--patient-home-plan-action-hover-bg)] active:bg-[var(--patient-home-plan-action-hover-bg)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b4585]/35',
);

/** Карточка «Мой план» на главной — только при назначении врачом или курсе (см. `PatientHomeToday`). */
export function PatientHomePlanCard({
  instance,
  startLessonHref,
  progressDay = null,
  todayPracticeDone = false,
  blockIconImageUrl,
  planUpdatedLabel = null,
}: Props) {
  return (
    <section aria-labelledby="patient-home-plan-heading">
      <article
        id="patient-home-plan-card"
        className={cn(patientHomePlanCardClass, patientHomePlanCardCompactShellClass)}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <h3
                id="patient-home-plan-heading"
                className={cn(patientHomePlanCardHeadingCompactClass, 'flex-1')}
              >
                Мой план реабилитации
              </h3>
              <Link href={startLessonHref} prefetch={false} className={planCtaClass}>
                Начать занятие
              </Link>
            </div>
            <p className={patientHomePlanCardTitleCompactClass}>{instance.title}</p>
            {planUpdatedLabel?.trim() ? (
              <p
                className={cn(
                  patientMutedTextClass,
                  'truncate patient-type-home-caption',
                )}
              >
                {planUpdatedLabel.trim()}
              </p>
            ) : null}
            {progressDay != null ? (
              <div
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 patient-type-home-caption patient-text-home-heading"
                aria-label={
                  todayPracticeDone
                    ? 'Сегодня занятие отмечено'
                    : 'Сегодня занятий по программе не отмечено'
                }
              >
                <span className="tabular-nums">День {progressDay}</span>
                <span className="patient-text-home-caption" aria-hidden>
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <span>Сегодня</span>
                  <span
                    className={cn(
                      'inline-block size-[6px] shrink-0 rounded-full',
                      todayPracticeDone
                        ? 'bg-[var(--patient-color-success)]'
                        : 'bg-[var(--patient-border)]',
                    )}
                    aria-hidden
                  />
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </section>
  );
}
