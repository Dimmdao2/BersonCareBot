"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { PatientTreatmentProgramsPanel } from "./PatientTreatmentProgramsPanel";
import { groupPendingProgramTestEvaluations } from "./groupPendingProgramTestEvaluations";
import type { PendingProgramTestEvaluationRow, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  profileListScope?: string;
  publishedTreatmentProgramTemplates: { id: string; title: string }[];
  assignTreatmentProgramEnabled: boolean;
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  pendingProgramTestEvaluations: PendingProgramTestEvaluationRow[];
};

export function DoctorClientProgramTab({
  userId,
  profileListScope,
  publishedTreatmentProgramTemplates,
  assignTreatmentProgramEnabled,
  treatmentProgramInstancesInitial,
  pendingProgramTestEvaluations,
}: Props) {
  const scopeQs = profileListScope ? `?scope=${encodeURIComponent(profileListScope)}` : "";
  const pendingGroups = groupPendingProgramTestEvaluations(pendingProgramTestEvaluations);

  return (
    <div className="flex flex-col gap-0">
      <section id="doctor-client-section-treatment-programs" className="border-b border-border px-4 py-4">
        <PatientTreatmentProgramsPanel
          patientUserId={userId}
          templates={publishedTreatmentProgramTemplates}
          disabled={!assignTreatmentProgramEnabled}
          profileListScope={profileListScope}
          initialInstances={treatmentProgramInstancesInitial}
        />
      </section>
      <section id="doctor-client-section-pending-program-tests" className="px-4 py-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Тесты, ожидающие оценки</h3>
          {pendingProgramTestEvaluations.length > 0 ? (
            <Badge variant="secondary" className="text-xs">
              К проверке · {pendingProgramTestEvaluations.length}
            </Badge>
          ) : null}
        </div>
        {pendingProgramTestEvaluations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет тестов, ожидающих оценки.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {pendingGroups.map((g) => (
              <li key={g.attemptId} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium">
                  {g.instanceTitle} · {g.stageTitle}
                </p>
                <p className="text-xs text-muted-foreground">Без оценки: {g.results.length}</p>
                <Link
                  href={`/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(g.instanceId)}${scopeQs}#doctor-program-instance-test-results`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 inline-flex")}
                >
                  Открыть
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
