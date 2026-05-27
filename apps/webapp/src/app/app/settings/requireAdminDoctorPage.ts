import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

/** Страницы админ-разделов в кабинете специалиста: только role=admin. */
export async function requireAdminDoctorPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }
  return session;
}
