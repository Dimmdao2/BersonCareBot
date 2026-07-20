import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import {
  resolveDailyWarmupStartPathForPatient,
  resolvePlanStartLessonPathForPatient,
} from "../resolvePatientReminderGoTargets";
import {
  getRememberedPatientOrganizationId,
  resolvePatientOrganizationRequestContext,
} from "@/app-layer/patient-organization/requestContext";
import { withPatientOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import {
  addPatientOrganizationChangedNotice,
  buildPatientReminderOrganizationOpener,
  parsePatientReminderOrganizationTarget,
  patientOrganizationRecoveryPath,
} from "../patientReminderOrganizationTarget";

type Kind = "daily-warmup" | "plan-start-lesson";

function isKind(s: string): s is Kind {
  return s === "daily-warmup" || s === "plan-start-lesson";
}

export default async function PatientGoReminderTargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{
    from?: string;
    organizationId?: string;
    organizationChanged?: string;
  }>;
}) {
  const { kind: raw } = await params;
  const sp = await searchParams;
  const kind = typeof raw === "string" ? raw.trim() : "";
  if (!isKind(kind)) {
    redirect(routePaths.patient);
  }

  const session = await getOptionalPatientSession();
  const selfPath = kind === "daily-warmup" ? routePaths.patientGoDailyWarmup : routePaths.patientGoPlanStartLesson;
  if (!session) {
    redirect(`${routePaths.root}?next=${encodeURIComponent(selfPath)}`);
  }

  const deps = buildAppDeps();
  const fromReminder = sp.from === "reminder";
  const reminderOrganizationId = fromReminder ? parsePatientReminderOrganizationTarget(sp.organizationId) : null;
  if (fromReminder && !reminderOrganizationId) {
    redirect(patientOrganizationRecoveryPath("reminder_target_missing"));
  }
  if (reminderOrganizationId) {
    const rememberedOrganizationId = await getRememberedPatientOrganizationId();
    if (rememberedOrganizationId !== reminderOrganizationId) {
      redirect(buildPatientReminderOrganizationOpener(kind, reminderOrganizationId));
    }
  }
  const patientContext = await resolvePatientOrganizationRequestContext(
    deps.patientOrganization,
    session.user.userId,
    reminderOrganizationId ? { verifiedTargetOrganizationId: reminderOrganizationId } : {},
  );
  if (!patientContext.ok) {
    redirect(reminderOrganizationId ? patientOrganizationRecoveryPath("organization_unavailable") : routePaths.patient);
  }
  const showContextChangedNotice = sp.organizationChanged === "1";
  if (kind === "daily-warmup") {
    const personalTierOk = (await patientRscPersonalDataGate(session, routePaths.patient)) === "allow";
    const target = await withPatientOrganizationPrincipal(
      {
        organizationId: patientContext.organizationId,
        platformUserId: session.user.userId,
        source: "app.patient.go.daily-warmup",
      },
      () =>
        resolveDailyWarmupStartPathForPatient(deps, session, personalTierOk, fromReminder ? "push_reminder" : "home"),
    );
    redirect(addPatientOrganizationChangedNotice(target, showContextChangedNotice));
  }
  const target = await withPatientOrganizationPrincipal(
    {
      organizationId: patientContext.organizationId,
      platformUserId: session.user.userId,
      source: "app.patient.go.plan-start-lesson",
    },
    () => resolvePlanStartLessonPathForPatient(deps, session.user.userId),
  );
  redirect(addPatientOrganizationChangedNotice(target, showContextChangedNotice));
}
