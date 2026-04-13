import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  patientPathRequiresBoundPhone,
  patientPathsAllowedDuringPhoneActivation,
  resolvePatientLayoutPathname,
} from "@/modules/platform-access";
import { logger } from "@/infra/logging/logger";
import { routePaths } from "@/app-layer/routes/paths";
import { env } from "@/config/env";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { getCurrentSession } from "@/modules/auth/service";
import { patientClientBusinessGate } from "@/modules/platform-access";
import { canAccessPatient } from "@/modules/roles/service";
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

  if (!session) {
    const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;
    redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
  }

  if (!canAccessPatient(session.user.role)) {
    redirect(getPostAuthRedirectTarget(session.user.role, null));
  }

  const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;

  if (env.DATABASE_URL?.trim()) {
    const gate = await patientClientBusinessGate(session);
    if (gate === "stale_session") {
      redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
    }
    if (gate === "need_activation" && !patientPathsAllowedDuringPhoneActivation(pathname)) {
      logger.info({
        scope: "patient_layout",
        event: "patient_redirect_bind_phone",
        pathname: pathname.trim() || "(empty)",
        reason: "need_activation",
      });
      redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
    }
    return <PatientClientLayout>{children}</PatientClientLayout>;
  }

  if (!session.user.phone?.trim() && patientPathRequiresBoundPhone(pathname)) {
    redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
  }

  return <PatientClientLayout>{children}</PatientClientLayout>;
}
