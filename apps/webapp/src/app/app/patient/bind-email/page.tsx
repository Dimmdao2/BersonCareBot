import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientAccess } from '@/app-layer/guards/requireRole';
import { loadPatientEmailGateState } from '@/app-layer/platform-access';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEmailGateDecision } from '@/modules/platform-access';
import { getSupportContactUrl } from '@/modules/system-settings/supportContactUrl';
import { EmailAccountPanel } from '@/shared/ui/patient/EmailAccountPanel';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { buttonVariants } from '@/shared/ui/patient/primitives/button-variants';
import {
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientSectionSurfaceClass,
} from '@/shared/ui/patient/patientVisual';

type Props = { searchParams: Promise<{ next?: string }> };

function safePatientNext(next: string | undefined): string {
  const target = next?.trim() ?? '';
  const pathname = target.split(/[?#]/u, 1)[0] ?? '';
  const inPatientCabinet =
    pathname === routePaths.patient || pathname.startsWith(`${routePaths.patient}/`);
  const returnsToThisScreen =
    pathname === routePaths.bindEmail || pathname.startsWith(`${routePaths.bindEmail}/`);
  return inPatientCabinet && !returnsToThisScreen ? target : routePaths.patient;
}

export default async function BindEmailPage({ searchParams }: Props) {
  const session = await requirePatientAccess(routePaths.bindEmail);
  const deps = buildAppDeps();
  const { next } = await searchParams;
  const nextPath = safePatientNext(next);
  const now = new Date();
  let emailGateState = await loadPatientEmailGateState(false);
  const emailFields = await deps.userProjection.getProfileEmailFields(session.user.userId);

  if (emailGateState.emailVerified) redirect(nextPath);
  if (emailGateState.emailFirstRequestedAt === null) {
    emailGateState = await loadPatientEmailGateState(true);
    if (emailGateState.emailVerified) redirect(nextPath);
  }

  const decision = resolvePatientEmailGateDecision({
    ...emailGateState,
    now,
    pathname: nextPath,
  });
  const canContinueWithoutEmail = decision !== 'requirement';
  const supportContactHref = await getSupportContactUrl();

  return (
    <PatientAppShell
      title="Email"
      user={session.user}
      backHref={canContinueWithoutEmail ? nextPath : undefined}
      backLabel="Позже"
    >
      <div className={patientInnerPageStackClass}>
        <section className={patientSectionSurfaceClass}>
          <p className={patientMutedTextClass}>
            {canContinueWithoutEmail
              ? 'Добавьте и подтвердите email.'
              : 'Подтвердите email, чтобы продолжить.'}
          </p>
          <div className="mt-4">
            <EmailAccountPanel
              initialEmail={emailFields.email}
              emailVerified={Boolean(emailFields.emailVerifiedAt)}
              supportContactHref={supportContactHref}
              embeddedInTitledSection
              startInEditMode
            />
          </div>
          {canContinueWithoutEmail ? (
            <Link
              href={nextPath}
              className={buttonVariants({
                variant: 'outline',
                className: 'mt-4 w-full justify-center',
              })}
            >
              Позже
            </Link>
          ) : null}
        </section>
      </div>
    </PatientAppShell>
  );
}
