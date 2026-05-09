/**
 * Первый пункт вкладки «Программа» для deeplink «Начать занятие» — та же логика, что `firstPendingProgramItemId`
 * в {@link PatientTreatmentProgramDetailClient} / {@link PatientPlanHero}.
 */
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  patientStageSectionShouldRender,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import { flatExecIds } from "@/app/app/patient/treatment/patientProgramItemNavLists";

export function resolveFirstPendingProgramTabItemId(
  detail: TreatmentProgramInstanceDetail,
  doneItemIds: readonly string[],
): string | null {
  if (detail.status !== "active") return null;

  const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  const currentWorkingStage = selectCurrentWorkingStageForPatientDetail(pipeline);
  const stageZeroStages = stageZero.filter((s) => patientStageSectionShouldRender(s, true));

  const programTabStage =
    currentWorkingStage ??
    (!detail.stages.some((s) => s.sortOrder > 0) && stageZeroStages[0] ? stageZeroStages[0] : null);

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
