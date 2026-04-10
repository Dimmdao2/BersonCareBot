import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { patientPathRequiresBoundPhone } from "@/app-layer/guards/patientPhonePolicy";
import { routePaths } from "@/app-layer/routes/paths";
import { getCurrentSession } from "@/modules/auth/service";
import { PatientClientLayout } from "./PatientClientLayout";

/**
 * Пациент без привязанного телефона не попадает в разделы вне allowlist (дневник, напоминания, кабинет…).
 * Путь передаётся из middleware (`x-bc-pathname` / `x-bc-search`).
 */
export default async function PatientLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-bc-pathname") ?? "";
  const search = h.get("x-bc-search") ?? "";
  const session = await getCurrentSession();

  if (
    session &&
    session.user.role === "client" &&
    !session.user.phone?.trim() &&
    patientPathRequiresBoundPhone(pathname)
  ) {
    const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;
    redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
  }

  return <PatientClientLayout>{children}</PatientClientLayout>;
}
