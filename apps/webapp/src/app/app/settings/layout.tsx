/**
 * Тот же каркас, что у `/app/doctor`: полноширинная шапка, под ней левое меню разделов (md+) и контент.
 * Доступ как на странице: не клиент (клиент → свой hub + toast).
 */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "../../styles/doctor.css";
import { getCurrentSession } from "@/modules/auth/service";
import { staffPwaLayoutMetadata } from "@/shared/lib/pwa/staffPwaLayoutMetadata";
import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";
import { DoctorWorkspaceShell } from "@/shared/ui/doctor/shell/DoctorWorkspaceShell";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export const metadata: Metadata = staffPwaLayoutMetadata;

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role === "client") redirect(buildOwnHubUrlWithAccessDeniedToast("client"));

  const deps = buildAppDeps();
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor");
  const patientLabel = getValueJson(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");

  return (
    <DoctorWorkspaceShell
      adminMode={session.adminMode ?? false}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
      patientLabel={String(patientLabel)}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
