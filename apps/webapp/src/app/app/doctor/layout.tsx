/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * Шапка на всю ширину; на md+ под ней слева меню разделов (`DoctorAdminSidebar`), справа контент.
 */
import type { ReactNode } from "react";
import type { Metadata } from "next";
import "../../styles/doctor.css";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { staffPwaLayoutMetadata } from "@/shared/lib/pwa/staffPwaLayoutMetadata";
import { DoctorWorkspaceShell } from "@/shared/ui/doctor/shell/DoctorWorkspaceShell";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { DoctorWorkspaceContext } from "@/modules/doctor-workspace/types";

export const metadata: Metadata = staffPwaLayoutMetadata;

function getValueJson<T>(valueJson: unknown, fallback: T): T {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value as T;
  }
  return fallback;
}

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const workspaceAccess = await requireDoctorWorkspaceContext();
  const session = workspaceAccess.session;
  const workspaceContext: DoctorWorkspaceContext = {
    organizationId: workspaceAccess.organizationId,
    organizationName: null,
    membershipId: workspaceAccess.membershipId,
    membershipRole: workspaceAccess.membershipRole,
    specialistId: workspaceAccess.specialistId,
    canManageOrganization: workspaceAccess.canManageOrganization,
    canManageAllSpecialists: workspaceAccess.canManageAllSpecialists,
    selectedSpecialistId: workspaceAccess.canManageAllSpecialists ? null : workspaceAccess.specialistId,
  };
  const deps = buildAppDeps();
  // P0.11.3: patient_label is PER-ORG (see orgScopedKeys.ts) — org-first, global-fallback.
  const doctorSettings = await deps.systemSettings.listSettingsByScope("doctor", {
    organizationId: workspaceAccess.organizationId,
  });
  const patientLabel = getValueJson(doctorSettings.find((x) => x.key === "patient_label")?.valueJson, "пациент");
  return (
    <DoctorWorkspaceShell
      adminMode={session.adminMode ?? false}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
      patientLabel={String(patientLabel)}
      workspaceContext={workspaceContext}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
