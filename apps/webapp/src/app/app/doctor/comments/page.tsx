import { permanentRedirect } from 'next/navigation';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../loadDoctorWorkspaceShell';

export default async function DoctorCommentsPage() {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.program_comments);
  permanentRedirect('/app/doctor/communications?tab=comments');
}
