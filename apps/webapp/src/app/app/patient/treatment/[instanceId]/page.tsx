/**
 * Прохождение программы лечения (`/app/patient/treatment/[instanceId]`).
 */
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { PATIENT_PLAN_TAB_UI_LABEL } from "@/app-layer/routes/navigation";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import { parsePatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { PatientTreatmentProgramDetailClient } from "../PatientTreatmentProgramDetailClient";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { formatExercisesTodayTrainingStatus } from "@/modules/reminders/summarizeReminderForCalendarDay";
import { parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes } from "@/modules/patient-home/patientHomeRepeatCooldownSettings";
import { loadPatientProgramInteractionBundle } from "@/app/app/patient/treatment/loadPatientProgramInteractionBundle";

type Props = { params: Promise<{ instanceId: string }>; searchParams: Promise<{ tab?: string | string[] }> };

export const dynamic = "force-dynamic";

export default async function PatientTreatmentProgramDetailPage({ params, searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <PatientAppShell title="Программа" user={null} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы">
        <p className={patientMutedTextClass}>Войдите для доступа.</p>
      </PatientAppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <PatientAppShell title="Программа" user={session.user} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </PatientAppShell>
    );
  }

  const { instanceId } = await params;
  const sp = await searchParams;
  const initialPlanTab = parsePatientPlanTab(sp.tab);
  const deps = buildAppDeps();
  let detail: TreatmentProgramInstanceDetail;
  try {
    const rawDetail = await deps.treatmentProgramInstance.getInstanceForPatient(
      session.user.userId,
      instanceId,
    );
    if (!rawDetail) notFound();
    detail = omitDisabledInstanceStageItemsForPatientApi(rawDetail);
  } catch {
    notFound();
  }

  const appTz = await getAppDisplayTimeZone();

  const [initialTestResults, initialProgramEvents, patientIana, rules, planItemCooldownSetting] =
    await Promise.all([
      deps.treatmentProgramProgress.listTestResultsForInstance(instanceId),
      deps.treatmentProgramInstance.listProgramEvents(instanceId),
      deps.patientCalendarTimezone.getIanaForUser(session.user.userId),
      deps.reminders.listRulesByUser(session.user.userId),
      deps.systemSettings.getSetting("patient_treatment_plan_item_done_repeat_cooldown_minutes", "admin"),
    ]);

  const planItemDoneRepeatCooldownMinutes = parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes(
    planItemCooldownSetting?.valueJson ?? null,
  );
  const programInteraction = await loadPatientProgramInteractionBundle(
    deps,
    session.user.userId,
    detail.assignmentSource,
  );

  let programDescription: string | null = null;
  if (detail.templateId) {
    try {
      const tpl = await deps.treatmentProgram.getTemplate(detail.templateId);
      const d = tpl.description?.trim();
      programDescription = d || null;
    } catch {
      programDescription = null;
    }
  }

  const resolvedIana = resolveCalendarDayIanaForPatient(patientIana, appTz);
  const calendarDateKey = DateTime.now().setZone(resolvedIana).toISODate()!;
  const planReminderNow = new Date();

  const rehabMatches = rules.filter(
    (r) => r.linkedObjectType === "rehab_program" && r.linkedObjectId === instanceId,
  );
  rehabMatches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const rehabRuleForStrip = rehabMatches[0] ?? null;

  const planReminderStrip =
    detail.status === "active" ?
      {
        rehabTodayLine: formatExercisesTodayTrainingStatus(
          rehabRuleForStrip,
          calendarDateKey,
          resolvedIana,
          planReminderNow,
        ),
        warmupTodayLine: null,
        remindersHref: `${routePaths.patientReminders}#patient-reminders-rehab`,
        variant: "trainingsToday" as const,
      }
    : null;

  return (
    <PatientAppShell
      title={PATIENT_PLAN_TAB_UI_LABEL}
      user={session.user}
      backHref={routePaths.patientTreatmentPrograms}
      backLabel={PATIENT_PLAN_TAB_UI_LABEL}
     
    >
      <PatientTreatmentProgramDetailClient
        initial={detail}
        initialTestResults={initialTestResults}
        initialProgramEvents={initialProgramEvents}
        appDisplayTimeZone={appTz}
        programDescription={programDescription}
        patientCalendarDayIana={resolvedIana}
        initialPlanTab={initialPlanTab}
        planReminderStrip={planReminderStrip}
        planItemDoneRepeatCooldownMinutes={planItemDoneRepeatCooldownMinutes}
        programCommentsInteraction={programInteraction.comments}
        programMediaInteraction={programInteraction.media}
      />
    </PatientAppShell>
  );
}
