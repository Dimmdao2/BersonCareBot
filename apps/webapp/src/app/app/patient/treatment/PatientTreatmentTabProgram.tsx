"use client";

import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { patientMutedTextClass, patientInnerPageStackClass } from "@/shared/ui/patientVisual";
import { PatientTreatmentProgramStagePageClient } from "@/app/app/patient/treatment/PatientTreatmentProgramStagePageClient";

type Stage = TreatmentProgramInstanceDetail["stages"][number];

export function PatientTreatmentTabProgram(props: {
  instanceId: string;
  currentWorkingStage: Stage | null;
  pipelineLength: number;
  allStages: Stage[];
  appDisplayTimeZone: string;
}) {
  const { instanceId, currentWorkingStage, pipelineLength, allStages, appDisplayTimeZone } = props;

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
    />
  );
}
