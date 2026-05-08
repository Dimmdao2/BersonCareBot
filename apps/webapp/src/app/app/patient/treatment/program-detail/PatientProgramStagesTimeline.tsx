"use client";

import type { ReactNode } from "react";
import { CheckCircle2, CornerDownRight, List, Lock, Play } from "lucide-react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";
import {
  patientBadgePrimaryClass,
  patientCardListSectionClass,
} from "@/shared/ui/patientVisual";
import { PatientProgramBlockHeading } from "@/app/app/patient/treatment/program-detail/PatientProgramBlockHeading";
import { patientTreatmentProgramListItemClass } from "@/app/app/patient/treatment/program-detail/patientTreatmentProgramListItemClass";

export type InstanceStageRow = TreatmentProgramInstanceDetail["stages"][number];

export function PatientProgramStagesTimeline(props: {
  stages: InstanceStageRow[];
  currentWorkingStage: InstanceStageRow | null;
  stageCountNonZero: number;
}) {
  const { stages, currentWorkingStage, stageCountNonZero } = props;

  return (
    <section
      id="patient-program-current-stage"
      className={patientCardListSectionClass}
      aria-labelledby="patient-program-stages-heading"
    >
      <PatientProgramBlockHeading
        id="patient-program-stages-heading"
        title="Этапы программы"
        Icon={List}
        iconClassName="text-[var(--patient-color-primary)]"
      />
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {stages.map((stage) => {
          const isActive = currentWorkingStage?.id === stage.id;
          const isPast = stage.status === "completed" || stage.status === "skipped";
          const isFuture = !isActive && !isPast && stage.status === "locked";
          const isStale =
            !isActive && !isPast && (stage.status === "available" || stage.status === "in_progress");

          let rowClass = patientTreatmentProgramListItemClass;
          let leftIcon: ReactNode;
          if (isActive) {
            rowClass = cn(
              patientTreatmentProgramListItemClass,
              "border-l-4 border-l-[var(--patient-color-primary)] bg-[var(--patient-color-primary-soft)]",
            );
            leftIcon = (
              <Play
                className="size-4 shrink-0 fill-none text-[var(--patient-color-primary)]"
                strokeWidth={2.5}
                aria-hidden
              />
            );
          } else if (isPast) {
            rowClass = cn(patientTreatmentProgramListItemClass, "bg-muted/20 opacity-70");
            leftIcon =
              stage.status === "skipped" ? (
                <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-[var(--patient-color-success)]"
                  aria-hidden
                />
              );
          } else {
            rowClass = patientTreatmentProgramListItemClass;
            leftIcon = (
              <Lock className="mt-0.5 size-4 shrink-0 text-[var(--patient-color-primary)]/45" aria-hidden />
            );
          }

          const titleClass = isActive
            ? "text-sm font-bold text-[var(--patient-color-primary)]"
            : isPast
              ? "text-sm font-medium text-foreground"
              : isFuture
                ? "text-sm font-medium text-[var(--patient-color-primary)]/58"
                : "text-sm font-medium text-[var(--patient-color-primary)]/52";

          const titleBlock = (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {isActive ? (
                <span className="text-[10px] font-semibold uppercase leading-none tracking-wide text-[var(--patient-color-primary)]/75">
                  Активный этап
                </span>
              ) : null}
              <span className={titleClass}>{stage.title}</span>
            </div>
          );

          const rowInnerStatic = (
            <div
              className={cn(
                "flex w-full items-center gap-3",
                (isFuture || isStale) && "pointer-events-none cursor-default",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-1 gap-3",
                  isActive ? "items-center" : "items-start",
                )}
              >
                {leftIcon}
                {titleBlock}
              </div>
              {isActive ? (
                <span
                  className={cn(
                    patientBadgePrimaryClass,
                    "h-6 max-w-full shrink-0 truncate border border-[var(--patient-color-primary)]/18 bg-[color-mix(in_srgb,var(--patient-card-bg)_92%,var(--patient-color-primary-soft)_8%)] px-2 text-[10px]",
                  )}
                >
                  {stage.sortOrder} из {stageCountNonZero}
                </span>
              ) : null}
            </div>
          );

          return (
            <li key={stage.id}>
              <div className={rowClass}>{rowInnerStatic}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
