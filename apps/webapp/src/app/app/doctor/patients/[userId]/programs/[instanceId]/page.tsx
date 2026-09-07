/**
 * /app/doctor/patients/[userId]/programs/[instanceId]
 *
 * Program instance editor embedded inside the patient card layout (PROG-04).
 * Shows the full patient header + tabs, with the Программа tab rendering
 * TreatmentProgramInstanceDetailClient inline instead of navigating away.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  applyClientChannelPolicyToWorkspaceModules,
  requireWorkspaceModuleForPage,
} from '@/app-layer/guards/workspaceModuleAccess';
import { routePaths } from '@/app-layer/routes/paths';
import { TreatmentProgramInstanceDetailClient } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient';
import { PatientCardClient } from '../../PatientCardClient';
import { loadDoctorPatientProgramEditorBootstrap } from '../../../loadDoctorPatientProgramEditorBootstrap';
import {
  loadDoctorPatientCardShellMeta,
  loadDoctorPatientCardTabBootstrap,
  loadDoctorPatientProgramInstances,
} from '../../../loadDoctorPatientCardPageBootstrap';
import { loadDoctorWorkspaceShell } from '../../../../loadDoctorWorkspaceShell';

type Props = {
  params: Promise<{ userId: string; instanceId: string }>;
  searchParams: Promise<{ scope?: string; discussionItem?: string; focusItemId?: string }>;
};

export default async function DoctorPatientProgramEmbeddedPage({ params, searchParams }: Props) {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.rehabilitation);
  const workspace = shell.workspaceAccess;
  const { userId, instanceId } = await params;
  const {
    scope: scopeParam,
    discussionItem: discussionItemParam,
    focusItemId: focusItemIdParam,
  } = await searchParams;

  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(instanceId).success
  ) {
    notFound();
  }

  const deps = buildAppDeps();
  const editorBootstrap = await loadDoctorPatientProgramEditorBootstrap(userId, instanceId);
  if (!editorBootstrap) notFound();
  const workspaceModules = applyClientChannelPolicyToWorkspaceModules(
    shell.workspaceModules,
    await deps.doctorClients.getClientChannelPolicy(userId, {
      organizationId: workspace.organizationId,
    }),
  );

  const discussionItemRaw = discussionItemParam?.trim();
  const initialOpenDiscussionItemId =
    discussionItemRaw && z.string().uuid().safeParse(discussionItemRaw).success
      ? discussionItemRaw
      : undefined;

  const focusItemIdRaw = focusItemIdParam?.trim();
  const initialFocusTestResultId =
    focusItemIdRaw && z.string().uuid().safeParse(focusItemIdRaw).success
      ? focusItemIdRaw
      : undefined;

  const programInstancesPromise = loadDoctorPatientProgramInstances(deps, workspace, userId);
  const tabPromise = loadDoctorPatientCardTabBootstrap(
    deps,
    workspace,
    userId,
    'program',
    programInstancesPromise,
    workspaceModules,
  );
  const shellMeta = await loadDoctorPatientCardShellMeta(
    deps,
    workspace,
    userId,
    'program',
    programInstancesPromise,
    workspaceModules,
  );

  const embeddedEditor = (
    <TreatmentProgramInstanceDetailClient
      {...editorBootstrap}
      patientOnSupport={shellMeta.cardHeader?.support.isOnSupport === true}
      initialOpenDiscussionItemId={initialOpenDiscussionItemId}
      initialFocusTestResultId={initialFocusTestResultId}
      programCommentsEnabled={workspaceModules.program_comments}
    />
  );

  // `PatientCardClient` сам открывает `DoctorAppShell`: второй shell вокруг него давал
  // вложенный `#app-shell-content` — двойные боковые поля и нижний отступ у вкладки ЛФК и
  // у любой вкладки, открытой с этого маршрута (`LFK-LAYOUT-01/02`).
  return (
    <PatientCardClient
      shellMeta={shellMeta}
      tabPromise={tabPromise}
      initialTab="program"
      embeddedProgramContent={embeddedEditor}
      patientListHref={routePaths.doctorPatients}
      workspaceModules={workspaceModules}
      appointmentsManageOwn={workspace.appointmentsManageOwn}
    />
  );
}
