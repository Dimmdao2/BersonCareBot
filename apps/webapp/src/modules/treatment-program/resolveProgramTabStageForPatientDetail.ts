import {
  patientStageSectionShouldRender,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "./stage-semantics";
import type { TreatmentProgramInstanceDetail } from "./types";

type StageRow = TreatmentProgramInstanceDetail["stages"][number];

/**
 * Этап для вкладки «Программа» и deeplink «Начать занятие».
 * Согласовано с fallback в progress/control (`pipeline.length === 0` → этап 0).
 */
export function resolveProgramTabStageForPatientDetail(
  detail: Pick<TreatmentProgramInstanceDetail, "stages">,
): StageRow | null {
  const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  const stageZeroRenderable = stageZero.filter((s) => patientStageSectionShouldRender(s, true));

  const currentWorking = selectCurrentWorkingStageForPatientDetail(pipeline);
  if (currentWorking) return currentWorking;

  if (pipeline.length === 0) {
    return stageZeroRenderable[0] ?? null;
  }

  const firstLocked = pipeline.find((s) => s.status === "locked");
  if (firstLocked && patientStageSectionShouldRender(firstLocked, false)) {
    return firstLocked;
  }

  return stageZeroRenderable[0] ?? null;
}
