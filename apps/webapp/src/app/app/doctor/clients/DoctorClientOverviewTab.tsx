"use client";

import { DoctorNotesPanel } from "./DoctorNotesPanel";
import { DoctorClientOverviewCarePlan } from "./DoctorClientOverviewCarePlan";
import { DoctorClientOverviewRecentProgramChanges } from "./DoctorClientOverviewRecentProgramChanges";
import { DoctorClientOverviewWellbeing } from "./DoctorClientOverviewWellbeing";
import { DoctorClientOverviewProactiveSignals } from "./DoctorClientOverviewProactiveSignals";
import { PatientSpecialistTasksSection } from "./PatientSpecialistTasksSection";
import {
  doctorClientOverviewGridClass,
  doctorClientOverviewPrimaryCardClass,
  doctorClientSectionTitleClass,
} from "./doctorClientCardChrome";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type {
  DoctorClientOverviewCarePlanModel,
  DoctorClientRecentProgramChangeRow,
} from "@/modules/doctor-client-card/types";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";

type Props = {
  userId: string;
  profileListScope?: string;
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  carePlan: DoctorClientOverviewCarePlanModel | null;
  recentProgramChanges?: DoctorClientRecentProgramChangeRow[];
  assignTreatmentProgramEnabled: boolean;
  wellbeingModel: WellbeingWeekChartModel;
  displayTimeZone: string;
  proactiveInsights?: ProactiveInsightRow[];
  onNavigateProgram: () => void;
};

export function DoctorClientOverviewTab({
  userId,
  profileListScope,
  treatmentProgramInstancesInitial,
  carePlan,
  recentProgramChanges = [],
  assignTreatmentProgramEnabled,
  wellbeingModel,
  displayTimeZone,
  proactiveInsights = [],
  onNavigateProgram,
}: Props) {
  return (
    <div className={doctorClientOverviewGridClass}>
      <DoctorClientOverviewCarePlan
        userId={userId}
        profileListScope={profileListScope}
        instances={treatmentProgramInstancesInitial}
        carePlan={carePlan}
        assignEnabled={assignTreatmentProgramEnabled}
        onAssignClick={onNavigateProgram}
      />
      {carePlan ? (
        <DoctorClientOverviewRecentProgramChanges
          patientUserId={userId}
          instanceId={carePlan.instanceId}
          profileListScope={profileListScope}
          rows={recentProgramChanges}
          displayTimeZone={displayTimeZone}
        />
      ) : null}
      <DoctorClientOverviewProactiveSignals insights={proactiveInsights} />
      <DoctorClientOverviewWellbeing chartModel={wellbeingModel} displayTimeZone={displayTimeZone} />
      <PatientSpecialistTasksSection patientUserId={userId} />
      <details id="doctor-client-section-notes" className={`md:col-span-2 ${doctorClientOverviewPrimaryCardClass}`}>
        <summary className={`mb-0 cursor-pointer list-none ${doctorClientSectionTitleClass} [&::-webkit-details-marker]:hidden`}>
          Заметки
        </summary>
        <div className="mt-3">
          <DoctorNotesPanel userId={userId} embedded />
        </div>
      </details>
    </div>
  );
}
