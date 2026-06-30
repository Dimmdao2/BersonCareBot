"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { PatientTreatmentProgramsPanel } from "./PatientTreatmentProgramsPanel";
import { DoctorClientProgramInbox } from "./DoctorClientProgramInbox";
import { groupPendingProgramTestEvaluations } from "./groupPendingProgramTestEvaluations";
import type {
  DoctorClientActiveProgramTreeModel,
  DoctorClientProgramInboxRow,
} from "@/modules/doctor-client-card/types";
import { DoctorClientActiveProgramPanel } from "./DoctorClientActiveProgramPanel";
import type { PendingProgramTestEvaluationRow, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import {
  doctorClientSectionTitleClass,
  doctorClientStackedCardClass,
  doctorClientTabSectionClass,
  doctorClientUrgentZoneClass,
} from "./doctorClientCardChrome";
import { doctorClientTreatmentProgramInstanceHref } from "./doctorClientInstanceHref";
import { DoctorProgramOverviewPanel } from "./DoctorProgramOverviewPanel";
import { cn } from "@/lib/utils";

type ProgramMode = "overview" | "correction";

type Props = {
  userId: string;
  profileListScope?: string;
  publishedTreatmentProgramTemplates: { id: string; title: string }[];
  assignTreatmentProgramEnabled: boolean;
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  pendingProgramTestEvaluations: PendingProgramTestEvaluationRow[];
  programInbox: DoctorClientProgramInboxRow[];
  activeProgramTree: DoctorClientActiveProgramTreeModel | null;
  focusPendingProgramAttemptId?: string;
  /** ID активного экземпляра программы для режима «Обзор». Опционально. */
  activeInstanceId?: string;
  /** IANA timezone string for displaying dates in clinic's local time. */
  displayIana?: string;
};

export function DoctorClientProgramTab({
  userId,
  profileListScope,
  publishedTreatmentProgramTemplates,
  assignTreatmentProgramEnabled,
  treatmentProgramInstancesInitial,
  pendingProgramTestEvaluations,
  programInbox,
  activeProgramTree,
  focusPendingProgramAttemptId,
  activeInstanceId,
  displayIana,
}: Props) {
  const pendingGroups = groupPendingProgramTestEvaluations(pendingProgramTestEvaluations);
  const inboxCount = programInbox.length;
  const hasUrgent = inboxCount > 0 || pendingProgramTestEvaluations.length > 0;

  // Derive activeInstanceId from activeProgramTree if not explicitly provided
  const resolvedActiveInstanceId: string | undefined =
    activeInstanceId ?? (activeProgramTree?.instanceId ?? undefined);

  const [mode, setMode] = useState<ProgramMode>("overview");

  useEffect(() => {
    if (!focusPendingProgramAttemptId) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`doctor-client-pending-attempt-${focusPendingProgramAttemptId}`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, [focusPendingProgramAttemptId]);

  return (
    <div className="flex flex-col gap-0">
      {/* Mode switcher — shown only when there is an active program instance */}
      {resolvedActiveInstanceId ? (
        <div className="flex items-center gap-1 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setMode("overview")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              mode === "overview"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Обзор
          </button>
          <button
            type="button"
            onClick={() => setMode("correction")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              mode === "correction"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            Коррекция
          </button>
        </div>
      ) : null}

      {/* Overview mode */}
      {resolvedActiveInstanceId && mode === "overview" ? (
        <DoctorProgramOverviewPanel
          userId={userId}
          instanceId={resolvedActiveInstanceId}
          profileListScope={profileListScope}
          displayIana={displayIana}
        />
      ) : (
        /* Correction mode (or no active instance → always show existing content) */
        <>
          {hasUrgent ? (
            <section className={doctorClientTabSectionClass}>
              <div className={`${doctorClientUrgentZoneClass} flex flex-col gap-3`}>
                {inboxCount > 0 ? (
                  <div id="doctor-client-section-program-inbox">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h3 className={doctorClientSectionTitleClass}>Комментарии и медиа</h3>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {inboxCount}
                      </Badge>
                    </div>
                    <DoctorClientProgramInbox userId={userId} profileListScope={profileListScope} rows={programInbox} />
                  </div>
                ) : null}

                {pendingProgramTestEvaluations.length > 0 ? (
                  <div id="doctor-client-section-pending-program-tests">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h3 className={doctorClientSectionTitleClass}>Тесты, ожидающие оценки</h3>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {pendingProgramTestEvaluations.length}
                      </Badge>
                    </div>
                    <ul className="m-0 list-none space-y-2 p-0">
                      {pendingGroups.map((g) => (
                        <li
                          key={g.attemptId}
                          id={`doctor-client-pending-attempt-${g.attemptId}`}
                          className={cn(
                            doctorClientStackedCardClass,
                            focusPendingProgramAttemptId === g.attemptId && "ring-2 ring-primary/50",
                          )}
                        >
                          <p className="text-sm font-medium leading-snug">
                            {g.instanceTitle} · {g.stageTitle}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">Без оценки: {g.results.length}</p>
                          <Link
                            href={doctorClientTreatmentProgramInstanceHref(userId, g.instanceId, {
                              profileListScope,
                              focusItemId: g.results[0]?.resultId,
                            })}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 inline-flex")}
                          >
                            Оценить
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section id="doctor-client-section-treatment-programs" className={doctorClientTabSectionClass}>
            {activeProgramTree ? (
              <DoctorClientActiveProgramPanel
                userId={userId}
                profileListScope={profileListScope}
                tree={activeProgramTree}
              />
            ) : null}
            <PatientTreatmentProgramsPanel
              patientUserId={userId}
              templates={publishedTreatmentProgramTemplates}
              disabled={!assignTreatmentProgramEnabled}
              profileListScope={profileListScope}
              initialInstances={treatmentProgramInstancesInitial}
            />
          </section>
        </>
      )}
    </div>
  );
}
