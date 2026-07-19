import { redirect } from "next/navigation";
import {
  requireOrganizationWorkspaceContext,
  requirePlatformOperationsPage,
} from "@/app-layer/guards/requireRole";

/** Страницы админ-разделов в кабинете специалиста: только role=admin. */
export async function requireAdminDoctorPage() {
  return requirePlatformOperationsPage();
}

/** Глобальные operator pages: global admin и обязательно явно включённый admin mode. */
export async function requireGlobalAdminDoctorPage() {
  return requirePlatformOperationsPage();
}

/** Страницы управления клиникой: global admin in admin mode или управляющий участник клиники. */
export async function requireClinicManagementDoctorPage() {
  const workspace = await requireOrganizationWorkspaceContext();
  const isGlobalAdmin = workspace.session.user.role === "admin" && workspace.session.adminMode === true;
  if (!isGlobalAdmin && !workspace.canManageOrganization) {
    redirect("/app/doctor");
  }
  return workspace;
}
