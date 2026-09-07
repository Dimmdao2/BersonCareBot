/**
 * /app/doctor/patients/[userId] — карточка пациента.
 * Pattern: requireDoctorAccess → tab-aware server bootstrap → PatientCardClient.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { PatientCardClient } from './PatientCardClient';
import { sanitizePatientListReturnHref } from '../patientListWorkspaceState';
import {
  loadDoctorPatientCardShellMeta,
  loadDoctorPatientCardTabBootstrap,
  loadDoctorPatientProgramInstances,
  resolvePatientCardTab,
} from '../loadDoctorPatientCardPageBootstrap';
import { loadDoctorWorkspaceShell } from '../../loadDoctorWorkspaceShell';

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

  const shell = await loadDoctorWorkspaceShell();
  const workspace = shell.workspaceAccess;
  const workspaceModules = shell.workspaceModules;
  const requestedTab = typeof sp.tab === 'string' ? sp.tab : undefined;
  const resolvedTab = resolvePatientCardTab(requestedTab, workspaceModules);
  requireWorkspaceModuleForPage(resolvedTab !== null);
  const activeTab = resolvedTab ?? 'overview';
  if (typeof sp.createVisitFrom === 'string') {
    requireWorkspaceModuleForPage(workspaceModules.encounters);
  }
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

  const programInstancesPromise = workspaceModules.rehabilitation
    ? loadDoctorPatientProgramInstances(deps, workspace, identity.userId)
    : Promise.resolve([]);
  // Start tab bootstrap before awaiting card shell metadata so Suspense can overlap the reads.
  const tabPromise = loadDoctorPatientCardTabBootstrap(
    deps,
    workspace,
    identity.userId,
    activeTab,
    programInstancesPromise,
    workspaceModules,
  );
  const loadedShellMeta = await loadDoctorPatientCardShellMeta(
    deps,
    workspace,
    identity.userId,
    activeTab,
    programInstancesPromise,
    workspaceModules,
  );
  const shellMeta = loadedShellMeta.cardHeader
    ? {
        ...loadedShellMeta,
        cardHeader: {
          ...loadedShellMeta.cardHeader,
          identity: {
            ...loadedShellMeta.cardHeader.identity,
            isArchived: identity.isArchived,
          },
        },
      }
    : loadedShellMeta;

  const createVisitFrom = typeof sp.createVisitFrom === 'string' ? sp.createVisitFrom : undefined;
  const visitDate = typeof sp.visitDate === 'string' ? sp.visitDate : undefined;
  const patientListHref = sanitizePatientListReturnHref(sp.returnTo);

  return (
    <PatientCardClient
      shellMeta={shellMeta}
      tabPromise={tabPromise}
      initialTab={activeTab}
      createVisitFrom={createVisitFrom}
      visitDate={visitDate}
      isAdmin={session.user.role === 'admin'}
      patientListHref={patientListHref}
      workspaceModules={workspaceModules}
      appointmentsManageOwn={workspace.appointmentsManageOwn}
    />
  );
}
