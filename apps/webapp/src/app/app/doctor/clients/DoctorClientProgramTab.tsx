"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { PatientTreatmentProgramsPanel } from "./PatientTreatmentProgramsPanel";
import { DoctorClientProgramInbox } from "./DoctorClientProgramInbox";
import { groupPendingProgramTestEvaluations } from "./groupPendingProgramTestEvaluations";
import type { DoctorClientProgramInboxRow } from "@/modules/doctor-client-card/types";
import type { PendingProgramTestEvaluationRow, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import {
  doctorClientSectionTitleClass,
  doctorClientStackedCardClass,
  doctorClientTabSectionClass,
} from "./doctorClientCardChrome";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  profileListScope?: string;
  publishedTreatmentProgramTemplates: { id: string; title: string }[];
  assignTreatmentProgramEnabled: boolean;
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  pendingProgramTestEvaluations: PendingProgramTestEvaluationRow[];
  programInbox: DoctorClientProgramInboxRow[];
};

export function DoctorClientProgramTab({
  userId,
  profileListScope,
  publishedTreatmentProgramTemplates,
  assignTreatmentProgramEnabled,
  treatmentProgramInstancesInitial,
  pendingProgramTestEvaluations,
  programInbox,
}: Props) {
  const scopeQs = profileListScope ? `?scope=${encodeURIComponent(profileListScope)}` : "";
  const pendingGroups = groupPendingProgramTestEvaluations(pendingProgramTestEvaluations);
  const inboxCount = programInbox.length;

  return (
    <div className="flex flex-col gap-0">
      {inboxCount > 0 ? (
        <section id="doctor-client-section-program-inbox" className={doctorClientTabSectionClass}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className={doctorClientSectionTitleClass}>Комментарии и медиа</h3>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {inboxCount}
            </Badge>
          </div>
          <DoctorClientProgramInbox userId={userId} profileListScope={profileListScope} rows={programInbox} />
        </section>
      ) : null}

      {pendingProgramTestEvaluations.length > 0 ? (
        <section id="doctor-client-section-pending-program-tests" className={doctorClientTabSectionClass}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className={doctorClientSectionTitleClass}>Тесты, ожидающие оценки</h3>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {pendingProgramTestEvaluations.length}
            </Badge>
          </div>
          <ul className="m-0 list-none space-y-2 p-0">
            {pendingGroups.map((g) => (
              <li key={g.attemptId} className={doctorClientStackedCardClass}>
                <p className="text-sm font-medium leading-snug">
                  {g.instanceTitle} · {g.stageTitle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Без оценки: {g.results.length}</p>
                <Link
                  href={`/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(g.instanceId)}${scopeQs}#doctor-program-instance-test-results`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 inline-flex")}
                >
                  Оценить
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="doctor-client-section-treatment-programs" className={doctorClientTabSectionClass}>
        <PatientTreatmentProgramsPanel
          patientUserId={userId}
          templates={publishedTreatmentProgramTemplates}
          disabled={!assignTreatmentProgramEnabled}
          profileListScope={profileListScope}
          initialInstances={treatmentProgramInstancesInitial}
        />
      </section>
    </div>
  );
}
