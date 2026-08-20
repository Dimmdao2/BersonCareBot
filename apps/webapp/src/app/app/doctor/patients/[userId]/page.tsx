/**
 * /app/doctor/patients/[userId] — карточка пациента.
 * Pattern: requireDoctorAccess → tab-aware server bootstrap → PatientCardClient.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { PatientCardClient } from './PatientCardClient';
import { sanitizePatientListReturnHref } from '../patientListWorkspaceState';
import {
  loadDoctorPatientCardShellMeta,
  loadDoctorPatientCardTabBootstrap,
  resolvePatientCardTab,
} from '../loadDoctorPatientCardPageBootstrap';

type PageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DoctorPatientCardPage({ params, searchParams }: PageProps) {
  const { userId } = await params;
  const sp = await searchParams;

  if (!z.string().uuid().safeParse(userId).success) {
    notFound();
  }

  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    workspace.organizationId,
    workspace,
  );
  if (!identity) {
    notFound();
  }

  const activeTab = resolvePatientCardTab(typeof sp.tab === 'string' ? sp.tab : undefined);
  // Start tab bootstrap before awaiting shell so Suspense can overlap progressive stream.
  const tabPromise = loadDoctorPatientCardTabBootstrap(
    deps,
    workspace,
    identity.userId,
    activeTab,
  );
  const shellMeta = await loadDoctorPatientCardShellMeta(
    deps,
    workspace,
    identity.userId,
    activeTab,
  );

  const createVisitFrom = typeof sp.createVisitFrom === 'string' ? sp.createVisitFrom : undefined;
  const visitDate = typeof sp.visitDate === 'string' ? sp.visitDate : undefined;
  const patientListHref = sanitizePatientListReturnHref(sp.returnTo);

  return (
    <DoctorAppShell title="Карточка пациента" user={session.user} backHref={patientListHref}>
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={tabPromise}
        initialTab={activeTab}
        createVisitFrom={createVisitFrom}
        visitDate={visitDate}
        isAdmin={session.user.role === 'admin'}
        patientListHref={patientListHref}
      />
    </DoctorAppShell>
  );
}
