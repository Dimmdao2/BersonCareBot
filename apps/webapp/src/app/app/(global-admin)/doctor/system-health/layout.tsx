import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../../../../styles/doctor.css";
import { requireGlobalAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { staffPwaLayoutMetadata } from "@/shared/lib/pwa/staffPwaLayoutMetadata";
import { DoctorWorkspaceShell } from "@/shared/ui/doctor/shell/DoctorWorkspaceShell";

export const metadata: Metadata = staffPwaLayoutMetadata;

/**
 * Platform System Health is deliberately outside the tenant doctor layout.
 * A global operator does not need an organization membership to inspect global health,
 * while the page and its APIs still require role=admin with explicit admin mode.
 */
export default async function GlobalAdminSystemHealthLayout({ children }: { children: ReactNode }) {
  const session = await requireGlobalAdminDoctorPage();
  return (
    <DoctorWorkspaceShell
      adminMode={true}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
