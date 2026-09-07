import type { ReactNode } from 'react';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../loadDoctorWorkspaceShell';

export default async function DoctorTreatmentProgramTemplatesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const shell = await loadDoctorWorkspaceShell();
  requireWorkspaceModuleForPage(shell.workspaceModules.rehabilitation);
  return children;
}
