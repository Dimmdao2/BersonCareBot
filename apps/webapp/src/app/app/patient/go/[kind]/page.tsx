import { notFound, redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getOptionalPatientSession,
  patientRscPersonalDataGate,
} from '@/app-layer/guards/requireRole';
import { getMechanicSurfaceVisibility } from '@/app-layer/guards/requireEntitlement';
import { routePaths } from '@/app-layer/routes/paths';
import {
  resolveDailyWarmupStartPathForPatient,
  resolvePlanStartLessonPathForPatient,
} from '../resolvePatientReminderGoTargets';
import {
  getRememberedPatientOrganizationId,
  resolvePatientOrganizationRequestContext,
} from '@/app-layer/patient-organization/requestContext';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  buildPatientReminderContinuation,
  buildPatientReminderOrganizationOpener,
  parsePatientReminderOrganizationTarget,
  patientOrganizationRecoveryPath,
} from '../patientReminderOrganizationTarget';

type Kind = 'daily-warmup' | 'plan-start-lesson';

function isKind(s: string): s is Kind {
  return s === 'daily-warmup' || s === 'plan-start-lesson';
}

export default async function PatientGoReminderTargetPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{
    from?: string;
    organizationId?: string;
  }>;
}) {
  const { kind: raw } = await params;
  const sp = await searchParams;
  const kind = typeof raw === 'string' ? raw.trim() : '';
  if (!isKind(kind)) {
    redirect(routePaths.patient);
  }

  const selfPath =
    kind === 'daily-warmup' ? routePaths.patientGoDailyWarmup : routePaths.patientGoPlanStartLesson;
  const fromReminder = sp.from === 'reminder';
  const reminderOrganizationId = fromReminder
    ? parsePatientReminderOrganizationTarget(sp.organizationId)
    : null;
  const session = await getOptionalPatientSession();
  if (!session) {
    const returnTo = fromReminder
      ? reminderOrganizationId
        ? buildPatientReminderContinuation(kind, reminderOrganizationId)
        : patientOrganizationRecoveryPath('reminder_target_missing')
      : selfPath;
    redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
  }

  const deps = buildAppDeps();
  if (fromReminder && !reminderOrganizationId) {
    redirect(patientOrganizationRecoveryPath('reminder_target_missing'));
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
    redirect(
      reminderOrganizationId
        ? patientOrganizationRecoveryPath('organization_unavailable')
        : routePaths.patient,
    );
  }
  if (kind === 'daily-warmup') {
    const warmupsVisibility = await getMechanicSurfaceVisibility(
      { organizationId: patientContext.organizationId },
      'warmups',
    );
    if (!warmupsVisibility.directUrl) notFound();
    const personalTierOk =
      (await patientRscPersonalDataGate(session, routePaths.patient)) === 'allow';
    const target = await withPatientOrganizationPrincipal(
      {
        organizationId: patientContext.organizationId,
        platformUserId: session.user.userId,
        source: 'app.patient.go.daily-warmup',
      },
      () =>
        resolveDailyWarmupStartPathForPatient(
          deps,
          session,
          personalTierOk,
          fromReminder ? 'push_reminder' : 'home',
        ),
    );
    redirect(target);
  }
  const target = await withPatientOrganizationPrincipal(
    {
      organizationId: patientContext.organizationId,
      platformUserId: session.user.userId,
      source: 'app.patient.go.plan-start-lesson',
    },
    () => resolvePlanStartLessonPathForPatient(deps, session.user.userId),
  );
  redirect(target);
}
