import { redirect } from 'next/navigation';
import {
  requireOrganizationWorkspaceContext,
  requirePlatformOperationsPage,
} from '@/app-layer/guards/requireRole';

/** Страницы админ-разделов в кабинете специалиста: только role=admin. */
export async function requireAdminDoctorPage() {
  return requirePlatformOperationsPage();
}

/** Глобальные operator pages: только global admin. */
export async function requireGlobalAdminDoctorPage() {
  return requirePlatformOperationsPage();
}

/** Страницы управления клиникой: global admin или управляющий участник клиники. */
export async function requireClinicManagementDoctorPage() {
  const workspace = await requireOrganizationWorkspaceContext();
  const isGlobalAdmin = workspace.session.user.role === 'admin';
  if (!isGlobalAdmin && !workspace.canManageOrganization) {
    redirect('/app/doctor');
  }
  return workspace;
}
