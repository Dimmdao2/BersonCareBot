"use client";

import { DoctorNotesPanel } from "./DoctorNotesPanel";
import { DoctorClientOverviewCarePlan } from "./DoctorClientOverviewCarePlan";
import { DoctorClientOverviewWellbeing } from "./DoctorClientOverviewWellbeing";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { DoctorClientProgramCardAggregates } from "@/modules/doctor-client-card/types";

type Props = {
  userId: string;
  profileListScope?: string;
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
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
        aggregates={programAggregates}
        assignEnabled={assignTreatmentProgramEnabled}
        onAssignClick={onNavigateProgram}
      />
      <DoctorClientOverviewWellbeing chartModel={wellbeingModel} displayTimeZone={displayTimeZone} />
      <section
        id="doctor-client-section-notes"
        className="md:col-span-2 rounded-lg border border-border bg-card p-4"
      >
        <h3 className="mb-2 text-sm font-semibold">Заметки</h3>
        <DoctorNotesPanel userId={userId} />
      </section>
    </div>
  );
}
