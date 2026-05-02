import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  patientLayoutAllowsUnauthenticatedAccess,
  patientPathRequiresBoundPhone,
  patientPathsAllowedDuringPhoneActivation,
  patientClientBusinessGate,
  resolvePatientLayoutPathname,
} from "@/modules/platform-access";
import { logger } from "@/infra/logging/logger";
import { routePaths } from "@/app-layer/routes/paths";
import { env } from "@/config/env";
import { getPostAuthRedirectTarget } from "@/modules/auth/redirectPolicy";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import {
  getPatientMaintenanceConfig,
  patientMaintenanceReplacesPatientShell,
  patientMaintenanceSkipsPath,
} from "@/modules/system-settings/patientMaintenance";
import { PatientMaintenanceScreen } from "./PatientMaintenanceScreen";
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
    if (patientLayoutAllowsUnauthenticatedAccess(pathname)) {
      return <PatientClientLayout>{children}</PatientClientLayout>;
    }
    const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;
    redirect(`${routePaths.root}?next=${encodeURIComponent(returnTo)}`);
  }

  if (!canAccessPatient(session.user.role)) {
    redirect(getPostAuthRedirectTarget(session.user.role, null));
  }

  const returnTo = (pathname.trim() ? pathname : routePaths.patient) + search;

  const gate = await patientClientBusinessGate(session);

  if (env.DATABASE_URL?.trim()) {
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
  } else if (!session.user.phone?.trim() && patientPathRequiresBoundPhone(pathname)) {
    redirect(`${routePaths.bindPhone}?next=${encodeURIComponent(returnTo)}`);
  }

  if (session.user.role === "client") {
    const maintenance = await getPatientMaintenanceConfig();
    const skipMaintenance = patientMaintenanceSkipsPath({
      pathname,
      gate,
      legacyNoDatabase: !env.DATABASE_URL?.trim(),
      sessionPhoneTrimmed: session.user.phone?.trim(),
    });

    let deps: ReturnType<typeof buildAppDeps> | null = null;
    let isTestAccount = false;
    if (maintenance.enabled && !skipMaintenance) {
      deps = buildAppDeps();
      try {
        isTestAccount = await deps.systemSettings.isTestPatientSession({
          phone: session.user.phone,
          telegramId: session.user.bindings?.telegramId,
          maxId: session.user.bindings?.maxId,
        });
      } catch (err) {
        logger.warn({
          scope: "patient_layout",
          event: "patient_test_account_check_failed",
          error: err instanceof Error ? err.message : String(err),
        });
        isTestAccount = false;
      }
    }

    if (patientMaintenanceReplacesPatientShell(maintenance.enabled, skipMaintenance, isTestAccount)) {
      const bookingDeps = deps ?? buildAppDeps();
      let upcoming: Awaited<ReturnType<typeof bookingDeps.patientBooking.listMyBookings>>["upcoming"] = [];
      try {
        const records = await bookingDeps.patientBooking.listMyBookings(session.user.userId);
        upcoming = records.upcoming;
      } catch (err) {
        logger.warn({
          scope: "patient_layout",
          event: "patient_maintenance_bookings_failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const appDisplayTimeZone = await getAppDisplayTimeZone();

      return (
        <PatientClientLayout>
          <PatientMaintenanceScreen
            user={session.user}
            message={maintenance.message}
            bookingUrl={maintenance.bookingUrl}
            bookings={upcoming}
            appDisplayTimeZone={appDisplayTimeZone}
          />
        </PatientClientLayout>
      );
    }
  }

  return <PatientClientLayout>{children}</PatientClientLayout>;
}
