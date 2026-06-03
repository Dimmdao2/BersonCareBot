import type { TreatmentProgramInstanceStageStatus } from "@/modules/treatment-program/types";

export type PipelineStageForDefaultExpand = {
  id: string;
  sortOrder: number;
  status: TreatmentProgramInstanceStageStatus;
};

function sortPipelineStagesForExpand(stages: PipelineStageForDefaultExpand[]): PipelineStageForDefaultExpand[] {
  return [...stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

function isUnfinishedPipelineStageStatus(status: TreatmentProgramInstanceStageStatus): boolean {
  return status !== "completed" && status !== "skipped";
}

/** Default expanded pipeline stage: in_progress → available → first unfinished (by sortOrder). */
export function pickDefaultExpandedPipelineStageId(
  pipelineStages: PipelineStageForDefaultExpand[],
): string | null {
  if (pipelineStages.length === 0) return null;

  const sorted = sortPipelineStagesForExpand(pipelineStages);

  const inProgress = sorted.find((stage) => stage.status === "in_progress");
  if (inProgress) return inProgress.id;

  const available = sorted.find((stage) => stage.status === "available");
  if (available) return available.id;

  const unfinished = sorted.find((stage) => isUnfinishedPipelineStageStatus(stage.status));
  if (unfinished) return unfinished.id;

  return sorted[0]!.id;
}
