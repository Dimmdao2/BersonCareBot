"use client";

import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { patientMutedTextClass, patientInnerPageStackClass } from "@/shared/ui/patientVisual";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { PatientTreatmentProgramStagePageClient } from "@/app/app/patient/treatment/PatientTreatmentProgramStagePageClient";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

export function PatientTreatmentTabProgram(props: {
  instanceId: string;
  currentWorkingStage: Stage | null;
  pipelineLength: number;
  allStages: Stage[];
  appDisplayTimeZone: string;
  embeddedChecklist: {
    doneItemIds: string[];
    doneTodayCountByItemId: Record<string, number>;
    lastDoneAtIsoByItemId: Record<string, string>;
  };
  onRefreshDetail: () => Promise<void>;
  /** `planTab` в ссылках на пункты (вкладка «Программа»). */
  itemLinksPlanTab?: PatientPlanTab | null;
}) {
  const {
    instanceId,
    currentWorkingStage,
    pipelineLength,
    allStages,
    appDisplayTimeZone,
    embeddedChecklist,
    onRefreshDetail,
    itemLinksPlanTab = "program",
  } = props;

  if (!currentWorkingStage) {
    return (
      <div className={patientInnerPageStackClass}>
        <p className={patientMutedTextClass}>Нет открытых этапов.</p>
      </div>
    );
  }

  return (
    <PatientTreatmentProgramStagePageClient
      instanceId={instanceId}
      stage={currentWorkingStage}
      pipelineLength={pipelineLength}
      allStages={allStages}
      appDisplayTimeZone={appDisplayTimeZone}
      embedded
      embeddedChecklist={embeddedChecklist}
      onRefreshDetail={onRefreshDetail}
      itemLinksPlanTab={itemLinksPlanTab ?? null}
    />
  );
}
