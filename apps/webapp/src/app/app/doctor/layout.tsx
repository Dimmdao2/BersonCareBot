/**
 * Layout раздела кабинета специалиста (/app/doctor).
 * Шапка на всю ширину; на md+ под ней слева меню разделов (`DoctorAdminSidebar`), справа контент.
 */
import type { ReactNode } from "react";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorWorkspaceShell } from "@/shared/ui/DoctorWorkspaceShell";

export default async function DoctorSectionLayout({ children }: { children: ReactNode }) {
  const session = await requireDoctorAccess();
  return (
    <DoctorWorkspaceShell
      adminMode={session.adminMode ?? false}
      userRole={session.user.role}
      userDisplayName={session.user.displayName}
    >
      {children}
    </DoctorWorkspaceShell>
  );
}
