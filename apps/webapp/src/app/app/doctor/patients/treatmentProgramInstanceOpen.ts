/** Clinical / program tabs treat any non-completed instance as the open program. */
export function isOpenTreatmentProgramInstance(status: string): boolean {
  return status !== 'completed';
}

export function pickOpenTreatmentProgramInstance<T extends { status: string }>(
  instances: readonly T[],
): T | undefined {
  return instances.find((i) => isOpenTreatmentProgramInstance(i.status));
}

type OverviewProgramStageLike = {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
};

export function deriveOverviewProgramWidgetFromDetail<T extends OverviewProgramStageLike>(
  detail: { title: string; stages: T[] },
): {
  programStatus: 'ok';
  programTitle: string;
  programStages: T[];
  programCurrentStage: T | null;
  programCurrentStageIndex: number;
} {
  const programStages = detail.stages.filter((s) => s.sortOrder > 0);
  const inProgress = programStages.find((s) => s.status === 'in_progress');
  const available = programStages.find((s) => s.status === 'available');
  const programCurrentStage = inProgress ?? available ?? programStages[0] ?? null;
  const programCurrentStageIndex = programCurrentStage
    ? programStages.findIndex((s) => s.id === programCurrentStage.id)
    : 0;

  return {
    programStatus: 'ok',
    programTitle: detail.title,
    programStages,
    programCurrentStage,
    programCurrentStageIndex: programCurrentStageIndex >= 0 ? programCurrentStageIndex : 0,
  };
}
