import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { DoctorBroadcastsShell } from './DoctorBroadcastsShell';
import { loadDoctorWorkspaceShell } from '../loadDoctorWorkspaceShell';

type Props = { searchParams: Promise<{ archive?: string }> };

export default async function DoctorBroadcastsPage({ searchParams }: Props) {
  const shell = await loadDoctorWorkspaceShell();
  const workspace = shell.workspaceAccess;
  requireWorkspaceModuleForPage(shell.workspaceModules.mailings);

  const [mailings, branding, params] = await Promise.all([
    getMechanicMutationAvailability(workspace, 'mailings'),
    getMechanicMutationAvailability(workspace, 'branding'),
    searchParams,
  ]);

  return (
    <DoctorBroadcastsShell
      initialArchiveOpen={params.archive === '1'}
      mailingsMutationAvailable={mailings.available && branding.available}
    />
  );
}
