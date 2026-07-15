import { redirect } from "next/navigation";
import { requireDoctorAccess, requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";

/** Страницы админ-разделов в кабинете специалиста: только role=admin. */
export async function requireAdminDoctorPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }
  return session;
}

/** Глобальные operator pages: global admin и обязательно явно включённый admin mode. */
export async function requireGlobalAdminDoctorPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin" || session.adminMode !== true) {
    redirect("/app/doctor");
  }
  return session;
}

/** Страницы управления клиникой: global admin in admin mode или управляющий участник клиники. */
export async function requireClinicManagementDoctorPage() {
  const workspace = await requireDoctorWorkspaceContext();
  const isGlobalAdmin = workspace.session.user.role === "admin" && workspace.session.adminMode === true;
  if (!isGlobalAdmin && !workspace.canManageOrganization) {
    redirect("/app/doctor");
  }
  return workspace;
}
