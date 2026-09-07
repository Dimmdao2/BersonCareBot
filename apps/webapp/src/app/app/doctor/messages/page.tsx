import { permanentRedirect } from 'next/navigation';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../loadDoctorWorkspaceShell';

export default async function DoctorMessagesPage() {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.direct_chat);
  permanentRedirect('/app/doctor/communications?tab=chats');
}
