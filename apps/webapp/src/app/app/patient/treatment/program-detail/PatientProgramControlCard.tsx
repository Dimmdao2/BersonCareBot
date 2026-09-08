'use client';

import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  patientButtonSuccessClass,
  patientButtonWarningOutlineClass,
  patientBodyTextClass,
  patientCaptionTextClass,
  patientMutedTextClass,
  patientSectionTitleClass,
  patientSurfaceWarningClass,
} from '@/shared/ui/patient/patientVisual';
import { routePaths } from '@/app-layer/routes/paths';
import { ruDaysWordN } from '@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters';

export function PatientProgramControlCard(props: {
  /** Дата контроля; если null — показывается {@link fallbackMessage}. */
  dateLine: string | null;
  /** Остаток календарных дней до контроля — строка «(через N дней)». */
  remainderDays: number | null;
  fallbackMessage: string;
  instanceId: string;
  currentStageId: string | null;
  /** Прямая ссылка на прохождение тестов текущего этапа (пункт `clinical_test`). */
  testsHref?: string | null;
}) {
  const { dateLine, remainderDays, fallbackMessage, currentStageId, testsHref } = props;
  /** Нет пунктов `clinical_test` у текущего этапа — самостоятельное прохождение недоступно. */
  const noSelfServiceTests = Boolean(currentStageId && !testsHref);

  return (
    <section className={patientSurfaceWarningClass} aria-label="Следующий контроль">
      <div className="flex min-w-0 flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarCheck
              className="size-4 shrink-0 text-[var(--patient-color-warning)]"
              aria-hidden
            />
            <h3 className={cn(patientSectionTitleClass, 'mb-0')}>
              Следующий контроль
            </h3>
          </div>
          {dateLine ? (
            <p className={cn(patientBodyTextClass, 'mt-0')}>
              <span>{dateLine}</span>
              {remainderDays != null ? (
                <span className={patientMutedTextClass}>
                  {' '}
                  (через {remainderDays} {ruDaysWordN(remainderDays)})
                </span>
              ) : null}
            </p>
          ) : (
            <p className={cn(patientBodyTextClass, 'mt-0')}>
              {fallbackMessage}
            </p>
          )}
          <p
            className={cn(
              patientCaptionTextClass,
              'mt-0',
              noSelfServiceTests && 'text-[var(--patient-color-warning)]',
            )}
          >
            {noSelfServiceTests
              ? 'В этапе нет самостоятельных тестов, оценка производится специалистом.'
              : 'Консультация со специалистом'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {currentStageId ? (
            testsHref ? (
              <Link
                href={testsHref}
                className={cn(
                  patientButtonWarningOutlineClass,
                  'inline-flex w-auto min-h-8 shrink-0 items-center justify-center px-2.5 py-1.5 no-underline sm:min-h-8',
                )}
              >
                Выполнить тесты
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={cn(
                  patientButtonWarningOutlineClass,
                  'inline-flex w-auto min-h-8 shrink-0 px-2.5 py-1.5 sm:min-h-8',
                )}
              >
                Выполнить тесты
              </button>
            )
          ) : null}
          <Link
            href={routePaths.bookingNew}
            className={cn(
              patientButtonSuccessClass,
              'w-auto min-h-8 shrink-0 px-2.5 py-1.5 sm:min-h-8',
            )}
          >
            Запись на приём
          </Link>
        </div>
      </div>
    </section>
  );
}
