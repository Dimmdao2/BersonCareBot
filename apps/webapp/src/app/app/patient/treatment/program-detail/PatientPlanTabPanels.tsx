"use client";

import { lazy, Suspense } from "react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import type { InstanceStageRow } from "@/app/app/patient/treatment/program-detail/PatientProgramStagesTimeline";
import { PatientProgramStagesTimeline } from "@/app/app/patient/treatment/program-detail/PatientProgramStagesTimeline";
import { PatientProgramPassageStatisticsSection } from "@/app/app/patient/treatment/program-detail/PatientProgramPassageStatisticsSection";
import { PatientProgramControlCard } from "@/app/app/patient/treatment/program-detail/PatientProgramControlCard";
import { PatientLoadingPatternBody, patientInnerPageStackClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";

const PatientTreatmentTabProgramLazy = lazy(() =>
  import("@/app/app/patient/treatment/PatientTreatmentTabProgram").then((m) => ({ default: m.PatientTreatmentTabProgram })),
);
const PatientTreatmentTabRecommendationsLazy = lazy(() =>
  import("@/app/app/patient/treatment/PatientTreatmentTabRecommendations").then((m) => ({
    default: m.PatientTreatmentTabRecommendations,
  })),
);

type StageRow = TreatmentProgramInstanceDetail["stages"][number];

export function PatientPlanTabPanels(props: {
  activeTab: PatientPlanTab;
  detail: TreatmentProgramInstanceDetail;
  programTabStage: StageRow | null;
  pipelineLength: number;
  appDisplayTimeZone: string;
  embeddedChecklist: {
    doneItemIds: string[];
    doneTodayCountByItemId: Record<string, number>;
    lastDoneAtIsoByItemId: Record<string, string>;
  };
  onRefreshDetail: () => Promise<void>;
  currentWorkingStage: StageRow | null;
  stageZeroStages: StageRow[];
  stagesTimeline: InstanceStageRow[];
  stageCountNonZero: number;
  showNextControlCard: boolean;
  controlDateLine: string | null;
  controlRemainderDaysForCard: number | null;
  controlFallbackMessage: string;
  progressCardTestsHref: string | null;
  patientCalendarDayIana: string;
  statsRefreshToken: number;
}) {
  const {
    activeTab,
    detail,
    programTabStage,
    pipelineLength,
    appDisplayTimeZone,
    embeddedChecklist,
    onRefreshDetail,
    currentWorkingStage,
    stageZeroStages,
    stagesTimeline,
    stageCountNonZero,
    showNextControlCard,
    controlDateLine,
    controlRemainderDaysForCard,
    controlFallbackMessage,
    progressCardTestsHref,
    patientCalendarDayIana,
    statsRefreshToken,
  } = props;

  return (
    <>
      <div className={cn(activeTab !== "program" && "hidden")} role="tabpanel" aria-label="Программа">
        <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
          <PatientTreatmentTabProgramLazy
            instanceId={detail.id}
            currentWorkingStage={programTabStage}
            pipelineLength={pipelineLength}
            allStages={detail.stages}
            appDisplayTimeZone={appDisplayTimeZone}
            patientCalendarDayIana={patientCalendarDayIana}
            embeddedChecklist={embeddedChecklist}
            onRefreshDetail={onRefreshDetail}
            itemLinksPlanTab="program"
          />
        </Suspense>
      </div>

      <div className={cn(activeTab !== "recommendations" && "hidden")} role="tabpanel" aria-label="Рекомендации">
        <Suspense fallback={<PatientLoadingPatternBody pattern="heroList" />}>
          <PatientTreatmentTabRecommendationsLazy
            instanceId={detail.id}
            currentWorkingStage={currentWorkingStage}
            stageZeroStages={stageZeroStages}
            itemLinksPlanTab="recommendations"
          />
        </Suspense>
      </div>

      <div className={cn(activeTab !== "progress" && "hidden")} role="tabpanel" aria-label="Прогресс">
        <div className={patientInnerPageStackClass}>
          {stagesTimeline.length > 0 ? (
            <div className="min-w-0">
              <PatientProgramStagesTimeline
                stages={stagesTimeline}
                currentWorkingStage={currentWorkingStage}
                stageCountNonZero={stageCountNonZero}
              />
            </div>
          ) : null}
          {showNextControlCard && currentWorkingStage ? (
            <PatientProgramControlCard
              dateLine={controlDateLine}
              remainderDays={controlRemainderDaysForCard}
              fallbackMessage={controlFallbackMessage}
              instanceId={detail.id}
              currentStageId={currentWorkingStage.id}
              testsHref={progressCardTestsHref}
            />
          ) : null}
          <PatientProgramPassageStatisticsSection
            instanceId={detail.id}
            detailCreatedAtIso={detail.createdAt}
            detailStatus={detail.status}
            patientCalendarDayIana={patientCalendarDayIana}
            refreshToken={statsRefreshToken}
          />
        </div>
      </div>
    </>
  );
}
