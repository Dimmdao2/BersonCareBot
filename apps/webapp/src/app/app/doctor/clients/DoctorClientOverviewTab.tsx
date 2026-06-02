"use client";

import { DoctorNotesPanel } from "./DoctorNotesPanel";
import { DoctorClientOverviewCarePlan } from "./DoctorClientOverviewCarePlan";
import { DoctorClientOverviewWellbeing } from "./DoctorClientOverviewWellbeing";
import { doctorClientOverviewCardClass, doctorClientSectionTitleClass } from "./doctorClientCardChrome";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { DoctorClientOverviewCarePlanModel, DoctorClientProgramCardAggregates } from "@/modules/doctor-client-card/types";

type Props = {
  userId: string;
  profileListScope?: string;
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  carePlan: DoctorClientOverviewCarePlanModel | null;
  programAggregates: DoctorClientProgramCardAggregates;
  assignTreatmentProgramEnabled: boolean;
  wellbeingModel: WellbeingWeekChartModel;
  displayTimeZone: string;
  onNavigateProgram: () => void;
};

export function DoctorClientOverviewTab({
  userId,
  profileListScope,
  treatmentProgramInstancesInitial,
  carePlan,
  programAggregates,
  assignTreatmentProgramEnabled,
  wellbeingModel,
  displayTimeZone,
  onNavigateProgram,
}: Props) {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <DoctorClientOverviewCarePlan
        userId={userId}
        profileListScope={profileListScope}
        instances={treatmentProgramInstancesInitial}
        carePlan={carePlan}
        aggregates={programAggregates}
        assignEnabled={assignTreatmentProgramEnabled}
        onAssignClick={onNavigateProgram}
      />
      <DoctorClientOverviewWellbeing chartModel={wellbeingModel} displayTimeZone={displayTimeZone} />
      <section
        id="doctor-client-section-notes"
        className={`md:col-span-2 ${doctorClientOverviewCardClass}`}
      >
        <h3 className={`mb-3 ${doctorClientSectionTitleClass}`}>Заметки</h3>
        <DoctorNotesPanel userId={userId} />
      </section>
    </div>
  );
}
