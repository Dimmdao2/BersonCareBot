"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  patientButtonSuccessClass,
  patientButtonWarningOutlineClass,
  patientMutedTextClass,
  patientSectionTitleClass,
  patientSurfaceWarningClass,
} from "@/shared/ui/patientVisual";
import { routePaths } from "@/app-layer/routes/paths";
import { ruDaysWordN } from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";

export function PatientProgramControlCard(props: {
  /** Дата контроля; если null — показывается {@link fallbackMessage}. */
  dateLine: string | null;
  /** Остаток календарных дней до контроля — строка «(через N дней)». */
  remainderDays: number | null;
  fallbackMessage: string;
  instanceId: string;
  currentStageId: string | null;
  /** Прямая ссылка на прохождение тестов текущего этапа (пункт `test_set`). */
  testsHref?: string | null;
  /** Если `testsHref` нет — переключить вкладку «Программа». */
  onProgramTests?: () => void;
}) {
  const { dateLine, remainderDays, fallbackMessage, currentStageId, testsHref, onProgramTests } = props;
  return (
    <section className={patientSurfaceWarningClass} aria-label="Следующий контроль">
      <div className="flex min-w-0 flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarCheck
              className="size-4 shrink-0 text-[var(--patient-color-warning)]"
              aria-hidden
            />
            <h3 className={cn(patientSectionTitleClass, "mb-0 leading-tight")}>Следующий контроль</h3>
          </div>
          {dateLine ? (
            <p className="mt-0 text-sm font-semibold leading-snug text-foreground">
              <span>{dateLine}</span>
              {remainderDays != null ? (
                <span className="text-[11px] font-normal leading-snug text-neutral-700 dark:text-neutral-400">
                  {" "}
                  (через {remainderDays} {ruDaysWordN(remainderDays)})
                </span>
              ) : null}
            </p>
          ) : (
            <p className={cn(patientMutedTextClass, "mt-0 text-base font-semibold leading-snug")}>
              {fallbackMessage}
            </p>
          )}
          <p className={cn(patientMutedTextClass, "mt-0 text-xs leading-[1.15]")}>
            Консультация со специалистом
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {currentStageId ? (
            testsHref ? (
              <Link
                href={testsHref}
                className={cn(
                  patientButtonWarningOutlineClass,
                  "inline-flex w-auto min-h-8 shrink-0 items-center justify-center px-2.5 py-1.5 text-xs font-semibold leading-tight no-underline sm:min-h-8",
                )}
              >
                Выполнить тесты
              </Link>
            ) : onProgramTests ? (
              <button
                type="button"
                onClick={onProgramTests}
                className={cn(
                  patientButtonWarningOutlineClass,
                  "w-auto min-h-8 shrink-0 px-2.5 py-1.5 text-xs font-semibold leading-tight sm:min-h-8",
                )}
              >
                Выполнить тесты
              </button>
            ) : null
          ) : null}
          <Link
            href={routePaths.bookingNew}
            className={cn(
              patientButtonSuccessClass,
              "w-auto min-h-8 shrink-0 px-2.5 py-1.5 text-xs font-semibold leading-tight sm:min-h-8",
            )}
          >
            Запись на приём
          </Link>
        </div>
      </div>
    </section>
  );
}
