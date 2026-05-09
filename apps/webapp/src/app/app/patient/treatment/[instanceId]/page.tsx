/**
 * Прохождение программы лечения (`/app/patient/treatment/[instanceId]`).
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { omitDisabledInstanceStageItemsForPatientApi } from "@/modules/treatment-program/stage-semantics";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolveCalendarDayIanaForPatient } from "@/modules/system-settings/calendarIana";
import { PatientTreatmentProgramDetailClient } from "../PatientTreatmentProgramDetailClient";
import { parsePatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";
import { DateTime } from "luxon";
import { resolvePatientContentSectionSlug } from "@/infra/repos/resolvePatientContentSectionSlug";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { resolvePatientCanViewAuthOnlyContent } from "@/modules/platform-access";
import { summarizeReminderForCalendarDay } from "@/modules/reminders/summarizeReminderForCalendarDay";

type Props = { params: Promise<{ instanceId: string }>; searchParams: Promise<{ tab?: string | string[] }> };

export default async function PatientTreatmentProgramDetailPage({ params, searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    return (
      <AppShell title="Программа" user={null} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className={patientMutedTextClass}>Войдите для доступа.</p>
      </AppShell>
    );
  }

  const dataGate = await patientRscPersonalDataGate(session, routePaths.patientTreatmentPrograms);
  if (dataGate === "guest") {
    return (
      <AppShell title="Программа" user={session.user} backHref={routePaths.patientTreatmentPrograms} backLabel="Программы" variant="patient">
        <p className={patientMutedTextClass}>Раздел доступен после входа.</p>
      </AppShell>
    );
  }

  const { instanceId } = await params;
  const sp = await searchParams;
  const initialPlanTab = parsePatientPlanTab(sp.tab);
  const deps = buildAppDeps();
  const appTz = await getAppDisplayTimeZone();
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

  const initialTestResults = await deps.treatmentProgramProgress.listTestResultsForInstance(instanceId);
  const initialProgramEvents = await deps.treatmentProgramInstance.listProgramEvents(instanceId);

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

  const patientIana = await deps.patientCalendarTimezone.getIanaForUser(session.user.userId);
  const resolvedIana = resolveCalendarDayIanaForPatient(patientIana, appTz);

  const [rules, canViewAuth, warmRes] = await Promise.all([
    deps.reminders.listRulesByUser(session.user.userId),
    resolvePatientCanViewAuthOnlyContent(session),
    resolvePatientContentSectionSlug(
      {
        getBySlug: (s) => deps.contentSections.getBySlug(s),
        getRedirectNewSlugForOldSlug: (s) => deps.contentSections.getRedirectNewSlugForOldSlug(s),
      },
      DEFAULT_WARMUPS_SECTION_SLUG,
    ),
  ]);
  const warmupsSectionAvailable = Boolean(
    warmRes && (!warmRes.section.requiresAuth || canViewAuth),
  );
  const calendarDateKey = DateTime.now().setZone(resolvedIana).toISODate()!;

  const rehabMatches = rules.filter(
    (r) => r.linkedObjectType === "rehab_program" && r.linkedObjectId === instanceId,
  );
  rehabMatches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const rehabRuleForStrip = rehabMatches[0] ?? null;

  const warmMatches = rules.filter(
    (r) => r.linkedObjectType === "content_section" && r.linkedObjectId === DEFAULT_WARMUPS_SECTION_SLUG,
  );
  warmMatches.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const warmupRuleForStrip = warmMatches[0] ?? null;

  const planReminderStrip =
    detail.status === "active" ?
      {
        rehabTodayLine: rehabRuleForStrip
          ? summarizeReminderForCalendarDay(rehabRuleForStrip, calendarDateKey, resolvedIana)
          : "не настроено",
        warmupTodayLine: warmupsSectionAvailable
          ? warmupRuleForStrip
            ? summarizeReminderForCalendarDay(warmupRuleForStrip, calendarDateKey, resolvedIana)
            : "не настроено"
          : null,
        remindersHref: `${routePaths.patientReminders}#patient-reminders-rehab`,
      }
    : null;

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      backHref={routePaths.patientTreatmentPrograms}
      backLabel="Программы"
      variant="patient"
      patientSuppressShellTitle
    >
      <Suspense fallback={<p className={patientMutedTextClass}>Загрузка…</p>}>
        <PatientTreatmentProgramDetailClient
          initial={detail}
          initialTestResults={initialTestResults}
          initialProgramEvents={initialProgramEvents}
          appDisplayTimeZone={appTz}
          programDescription={programDescription}
          patientCalendarDayIana={resolvedIana}
          initialPlanTab={initialPlanTab}
          planReminderStrip={planReminderStrip}
        />
      </Suspense>
    </AppShell>
  );
}
