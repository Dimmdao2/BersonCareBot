/**
 * Первый пункт вкладки «Программа» для deeplink «Начать занятие» — та же логика, что `firstPendingProgramItemId`
 * в {@link PatientTreatmentProgramDetailClient} / {@link PatientPlanHero}.
 */
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { resolveProgramTabStageForPatientDetail } from "@/modules/treatment-program/resolveProgramTabStageForPatientDetail";
import { flatExecIds } from "@/app/app/patient/treatment/patientProgramItemNavLists";

export function resolveFirstPendingProgramTabItemId(
  detail: TreatmentProgramInstanceDetail,
  doneItemIds: readonly string[],
): string | null {
  if (detail.status !== "active") return null;

  const programTabStage = resolveProgramTabStageForPatientDetail(detail);
  if (!programTabStage) return null;

  const itemInteraction =
    programTabStage.status === "completed" || programTabStage.status === "skipped" ? "readOnly" : "full";
  let ordered = flatExecIds(programTabStage, itemInteraction);
  if (ordered.length === 0 && itemInteraction === "full") {
    ordered = flatExecIds(programTabStage, "readOnly");
  }
  const pending = ordered.find((id) => !doneItemIds.includes(id));
  return pending ?? ordered[0] ?? null;
}
