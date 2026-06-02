import {
  countPatientCompletedPipelineStages,
  selectCurrentWorkingStageForPatientDetail,
  splitPatientProgramStagesForDetailUi,
} from "@/modules/treatment-program/stage-semantics";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { DoctorClientOverviewCarePlanModel } from "./types";

function snapshotTitle(snapshot: Record<string, unknown>, itemType: string): string {
  const t = snapshot.title;
  if (typeof t === "string" && t.trim() !== "") return t.trim();
  return itemType;
}

/** Текущий этап и до 6 активных элементов для блока Care Plan на «Обзоре». */
export function buildDoctorClientCarePlanOverview(
  detail: TreatmentProgramInstanceDetail,
): DoctorClientOverviewCarePlanModel | null {
  if (detail.status !== "active") return null;

  const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  let stage = selectCurrentWorkingStageForPatientDetail(pipeline);
  if (!stage && pipeline.length === 0) {
    stage =
      stageZero.find((s) => s.status === "in_progress") ??
      stageZero.find((s) => s.status === "available") ??
      null;
  }
  if (!stage) return null;

  const pipelineStages = detail.stages.filter((s) => s.sortOrder > 0);
  const completedStages = countPatientCompletedPipelineStages(pipelineStages);
  const totalStages = pipelineStages.length;

  const items = [...stage.items]
    .filter((i) => i.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map((i) => ({
      id: i.id,
      title: snapshotTitle(i.snapshot, i.itemType),
      isNew: i.lastViewedAt == null,
      itemType: i.itemType,
      itemRefId: i.itemRefId,
      snapshot: i.snapshot,
    }));

  const stageTitle = stage.title?.trim();
  return {
    instanceId: detail.id,
    instanceTitle: detail.title,
    stageId: stage.id,
    stageTitle: stageTitle !== undefined && stageTitle !== "" ? stageTitle : "Этап",
    goals: stage.goals,
    objectives: stage.objectives,
    expectedDurationText: stage.expectedDurationText,
    completedStages,
    totalStages,
    items,
  };
}
