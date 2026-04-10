import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { patientPathRequiresBoundPhone, resolvePatientLayoutPathname } from "@/modules/platform-access";
import { routePaths } from "@/app-layer/routes/paths";
import { env } from "@/config/env";
import { getCurrentSession } from "@/modules/auth/service";
import { patientClientBusinessGate } from "@/modules/platform-access";
import { PatientClientLayout } from "./PatientClientLayout";

/**
 * Пациент не попадает в разделы вне allowlist без бизнес-доступа (tier **patient** при БД, иначе — телефон в сессии).
 * Путь: `x-bc-pathname` / `x-bc-search` из middleware; при пустом pathname — fallback по `referer` (`resolvePatientLayoutPathname`).
 */
export default async function PatientLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const pathname = resolvePatientLayoutPathname((name) => h.get(name));
  const search = h.get("x-bc-search") ?? "";
  const session = await getCurrentSession();

  if (!session || session.user.role !== "client") {
    return <PatientClientLayout>{children}</PatientClientLayout>;
  }

  const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;

  if (env.DATABASE_URL?.trim()) {
    const gate = await patientClientBusinessGate(session);
    if (gate === "stale_session") {
      redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
    }
    if (gate === "need_activation" && !pathname.trim() && process.env.NODE_ENV !== "test") {
      console.info("[patient_layout] need_activation unresolved_pathname (check middleware x-bc-pathname)");
    }
    if (gate === "need_activation" && patientPathRequiresBoundPhone(pathname)) {
      redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
    }
    return <PatientClientLayout>{children}</PatientClientLayout>;
  }

  if (!session.user.phone?.trim() && patientPathRequiresBoundPhone(pathname)) {
    redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
  }

  return <PatientClientLayout>{children}</PatientClientLayout>;
}
