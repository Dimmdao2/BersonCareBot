import { permanentRedirect } from 'next/navigation';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../../loadDoctorWorkspaceShell';

export default async function DoctorBroadcastDeliveryArchivePage() {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.mailings);
  permanentRedirect('/app/doctor/communications?tab=broadcasts&archive=1');
}
