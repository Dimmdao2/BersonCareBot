import { permanentRedirect } from 'next/navigation';
import { routePaths } from '@/app-layer/routes/paths';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../../loadDoctorWorkspaceShell';

export default async function DoctorBroadcastDeliveryArchivePage() {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.mailings);
  permanentRedirect(`${routePaths.doctorBroadcasts}?archive=1`);
}
