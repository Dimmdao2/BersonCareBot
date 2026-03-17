import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor, canAccessPatient } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import type { AppSession } from "@/shared/types/session";

export async function requireSession(): Promise<AppSession> {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);
  return session;
}

export async function requirePatientAccess(): Promise<AppSession> {
  const session = await requireSession();
  if (!canAccessPatient(session.user.role)) redirect(routePaths.doctor);
  return session;
}

export async function requireDoctorAccess(): Promise<AppSession> {
  const session = await requireSession();
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.patient);
  return session;
}

/** Если у пациента нет привязанного телефона — редирект на страницу привязки с next=returnTo. Вызывать только на маршрутах из patientPathsRequiringPhone. */
export function requirePatientPhone(session: AppSession, returnTo: string): void {
  if (!session.user.phone?.trim()) {
    const next = encodeURIComponent(returnTo);
    redirect(`${routePaths.bindPhone}?next=${next}`);
  }
}
