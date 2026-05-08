"use client";

import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { TreatmentProgramEventRow, TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardHeroClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";
import {
  patientBadgeDangerClass,
  patientBodyTextClass,
  patientHeroPrimaryActionClass,
  patientHeroTitleBaseClass,
  patientInnerHeroTitleTypographyClass,
  patientLineClamp2Class,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { formatBookingDateLongRu } from "@/shared/lib/formatBusinessDateTime";
import { PatientProgramHeroHistoryPopover } from "@/app/app/patient/treatment/program-detail/PatientProgramHeroHistoryPopover";
import { ruPassedStagesWord } from "@/app/app/patient/treatment/program-detail/patientPlanDetailFormatters";

export function PatientPlanHeroCompleted(props: {
  detail: TreatmentProgramInstanceDetail;
  appDisplayTimeZone: string;
  programEvents: TreatmentProgramEventRow[];
  passedStages: number;
}) {
  const { detail, appDisplayTimeZone, programEvents, passedStages } = props;
  return (
    <div
      className={cn(
        patientHomeCardHeroClass,
        "relative isolate overflow-hidden rounded-b-none p-4 pt-3 lg:rounded-b-none lg:p-5",
      )}
    >
      <PatientProgramHeroHistoryPopover
        detail={detail}
        appDisplayTimeZone={appDisplayTimeZone}
        programEvents={programEvents}
      />
      <h2
        className={cn(
          patientLineClamp2Class,
          patientHeroTitleBaseClass,
          patientInnerHeroTitleTypographyClass,
          "mt-0.5 pr-11 lg:pr-12",
        )}
      >
        {detail.title}
      </h2>
      <p className={cn(patientBodyTextClass, "mt-3 text-sm leading-snug")}>Программа реабилитации завершена</p>
      <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>
        Дата завершения: {formatBookingDateLongRu(detail.updatedAt, appDisplayTimeZone)}
      </p>
      <p className={cn(patientMutedTextClass, "mt-1 text-sm")}>
        Пройдено {passedStages} {ruPassedStagesWord(passedStages)}
      </p>
    </div>
  );
}

export function PatientPlanHeroActive(props: {
  detail: TreatmentProgramInstanceDetail;
  appDisplayTimeZone: string;
  programEvents: TreatmentProgramEventRow[];
  programDescription: string | null;
  awaitsStart: boolean;
  programTabStage: TreatmentProgramInstanceDetail["stages"][number] | null;
  firstPendingProgramItemId: string | null;
}) {
  const {
    detail,
    appDisplayTimeZone,
    programEvents,
    programDescription,
    awaitsStart,
    programTabStage,
    firstPendingProgramItemId,
  } = props;
  return (
    <div
      className={cn(
        patientHomeCardHeroClass,
        "relative isolate overflow-hidden rounded-b-none p-4 pt-3 lg:rounded-b-none lg:p-5",
      )}
    >
      <PatientProgramHeroHistoryPopover
        detail={detail}
        appDisplayTimeZone={appDisplayTimeZone}
        programEvents={programEvents}
      />
      <h2
        className={cn(
          patientLineClamp2Class,
          patientHeroTitleBaseClass,
          patientInnerHeroTitleTypographyClass,
          "mt-0.5 pr-11 lg:pr-12",
        )}
      >
        {detail.title}
      </h2>
      {programDescription?.trim() ? (
        <p className={cn(patientMutedTextClass, "mt-2 line-clamp-3 text-sm leading-snug")}>
          {programDescription.trim()}
        </p>
      ) : null}
      {awaitsStart ? (
        <p className="mt-2" role="status">
          <span className={patientBadgeDangerClass}>Ожидает старта</span>
        </p>
      ) : null}
      {programTabStage && firstPendingProgramItemId ? (
        <Link
          href={routePaths.patientTreatmentProgramItem(
            detail.id,
            firstPendingProgramItemId,
            "exec",
            "program",
          )}
          className={cn(
            patientHeroPrimaryActionClass,
            "mt-5 mb-3 flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-sm shadow-[0_6px_14px_rgba(40,77,160,0.24)] no-underline lg:mt-6 lg:mb-4 lg:min-h-12 lg:text-base",
          )}
        >
          <PlayCircle className="size-5 shrink-0 lg:size-6" aria-hidden />
          Начать занятие
        </Link>
      ) : programTabStage ? null : (
        <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>Нет открытых этапов.</p>
      )}
    </div>
  );
}
