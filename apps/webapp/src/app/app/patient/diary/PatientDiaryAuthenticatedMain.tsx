import { DateTime } from "luxon";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { cn } from "@/lib/utils";
import {
  patientMutedTextClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
import { DiaryTabsClient } from "./DiaryTabsClient";
import { PatientWarmupWeekImpactBanner } from "@/modules/diaries/components/PatientWarmupWeekImpactBanner";
import { PatientWellbeingWeekChart } from "@/modules/diaries/components/PatientWellbeingWeekChart";
import { loadPatientDiaryWeekWellbeing } from "@/modules/diaries/loadPatientDiaryWeekWellbeing";
import { loadPatientDiaryWeekActivity } from "@/modules/patient-diary/loadPatientDiaryWeekActivity";
import { PatientDiaryWarmupWeekBars } from "@/modules/patient-diary/components/PatientDiaryWarmupWeekBars";
import { PatientDiaryPlanWeekStripes } from "@/modules/patient-diary/components/PatientDiaryPlanWeekStripes";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

const EMPTY_STATS =
  "За эту неделю пока нет отметок общего самочувствия. Отметки можно добавить на главной «Сегодня».";

export async function PatientDiaryAuthenticatedMain({ userId }: { userId: string }) {
  const deps = buildAppDeps();

  const wellbeing = await loadPatientDiaryWeekWellbeing(
    {
      diaries: deps.diaries,
      references: deps.references,
      patientCalendarTimezone: deps.patientCalendarTimezone,
      getAppDisplayTimeZone,
    },
    { userId },
  );

  const activity = await loadPatientDiaryWeekActivity(
    {
      reminders: deps.reminders,
      patientPractice: deps.patientPractice,
      programActionLog: deps.programActionLog,
      treatmentProgramInstance: deps.treatmentProgramInstance,
      diarySnapshots: deps.patientDiarySnapshots,
    },
    {
      userId,
      weekStartMs: wellbeing.chart.weekStartMs,
      weekEndMs: wellbeing.chart.weekEndMs,
      iana: wellbeing.iana,
    },
  );

  const weekDayLabels = Array.from({ length: 7 }, (_, i) =>
    DateTime.fromMillis(wellbeing.chart.weekStartMs, { zone: wellbeing.iana })
      .plus({ days: i })
      .setLocale("ru")
      .toFormat("ccc d"),
  );

  const wellbeingMvpSingle = (
    <section
      id="patient-diary-wellbeing-week-section"
      className={cn(patientSectionSurfaceClass, "overflow-x-visible border-0 shadow-none")}
    >
      {!wellbeing.hasAnyInstant ?
        <>
          <h2 className={patientSectionTitleClass}>Самочувствие за неделю</h2>
          <p className={patientMutedTextClass}>{EMPTY_STATS}</p>
        </>
      : <>
          <PatientWarmupWeekImpactBanner summary={wellbeing.warmupImpactSummary} />
          <h2 className={patientSectionTitleClass}>Самочувствие за неделю</h2>
          <PatientWellbeingWeekChart model={wellbeing.chart} iana={wellbeing.iana} />
        </>}
    </section>
  );

  const diaryMain = (
    <>
      {wellbeingMvpSingle}
      <PatientDiaryWarmupWeekBars weekDayLabels={weekDayLabels} days={activity.warmupDays} />
      <PatientDiaryPlanWeekStripes weekDayLabels={weekDayLabels} days={activity.planDays} />
    </>
  );

  return <DiaryTabsClient symptomsPanel={null} lfkPanel={null} wellbeingMvpSingle={diaryMain} />;
}
