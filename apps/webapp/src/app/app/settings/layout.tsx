/**
 * Тот же каркас, что у `/app/doctor`: полноширинная шапка, под ней левое меню разделов (md+) и контент.
 * Доступ как на странице: не клиент (клиент → свой hub + toast).
 */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import "../../styles/doctor.css";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { staffPwaLayoutMetadata } from "@/shared/lib/pwa/staffPwaLayoutMetadata";
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
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;

  const deps = buildAppDeps();
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor", {
    organizationId: workspace.organizationId,
  });
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
