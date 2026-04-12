/**
 * Тот же каркас, что у `/app/doctor`: полноширинная шапка, под ней левое меню разделов (md+) и контент.
 * Доступ как на странице: не клиент (клиент → профиль).
 */
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { DoctorWorkspaceShell } from "@/shared/ui/DoctorWorkspaceShell";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role === "client") redirect("/app/patient/profile");

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
