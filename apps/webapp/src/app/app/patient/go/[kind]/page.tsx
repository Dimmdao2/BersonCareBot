import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import {
  resolveDailyWarmupStartPathForPatient,
  resolvePlanStartLessonPathForPatient,
} from "../resolvePatientReminderGoTargets";
import { resolvePatientOrganizationRequestContext } from "@/app-layer/patient-organization/requestContext";
import { withPatientOrganizationPrincipal } from "@/app-layer/principal/withOrganizationPrincipal";

type Kind = "daily-warmup" | "plan-start-lesson";

function isKind(s: string): s is Kind {
  return s === "daily-warmup" || s === "plan-start-lesson";
}

export default async function PatientGoReminderTargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ from?: string }>;
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
  const patientContext = await resolvePatientOrganizationRequestContext(
    deps.patientOrganization,
    session.user.userId,
  );
  if (!patientContext.ok) redirect(routePaths.patient);
  if (kind === "daily-warmup") {
    const personalTierOk = (await patientRscPersonalDataGate(session, routePaths.patient)) === "allow";
    const fromReminder = sp.from === "reminder";
    redirect(await withPatientOrganizationPrincipal(
      {
        organizationId: patientContext.organizationId,
        platformUserId: session.user.userId,
        source: "app.patient.go.daily-warmup",
      },
      () => resolveDailyWarmupStartPathForPatient(
          deps,
          session,
          personalTierOk,
          fromReminder ? "push_reminder" : "home",
        ),
    ));
  }
  redirect(await withPatientOrganizationPrincipal(
    {
      organizationId: patientContext.organizationId,
      platformUserId: session.user.userId,
      source: "app.patient.go.plan-start-lesson",
    },
    () => resolvePlanStartLessonPathForPatient(deps, session.user.userId),
  ));
}
