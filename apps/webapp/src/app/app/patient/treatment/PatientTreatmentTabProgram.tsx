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
  patientCalendarDayIana: string;
  embeddedChecklist: {
    doneItemIds: string[];
    doneTodayCountByItemId: Record<string, number>;
    lastDoneAtIsoByItemId: Record<string, string>;
  };
  onRefreshDetail: () => Promise<void>;
  /** `planTab` в ссылках на пункты (вкладка «Программа»). */
  itemLinksPlanTab?: PatientPlanTab | null;
  planItemDoneRepeatCooldownMinutes: number;
}) {
  const {
    instanceId,
    currentWorkingStage,
    pipelineLength,
    allStages,
    appDisplayTimeZone,
    patientCalendarDayIana,
    embeddedChecklist,
    onRefreshDetail,
    itemLinksPlanTab = "program",
    planItemDoneRepeatCooldownMinutes,
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
      patientCalendarDayIana={patientCalendarDayIana}
      embedded
      embeddedChecklist={embeddedChecklist}
      onRefreshDetail={onRefreshDetail}
      itemLinksPlanTab={itemLinksPlanTab ?? null}
      planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}
    />
  );
}
