/**
 * Тот же каркас, что у `/app/settings`.
 */
import type { ReactNode } from "react";
import "../../styles/doctor.css";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { buildOwnHubUrlWithAccessDeniedToast } from "@/shared/lib/appAccessDeniedToast";
import { DoctorWorkspaceShell } from "@/shared/ui/doctor/shell/DoctorWorkspaceShell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/app");
  if (session.user.role !== "admin") {
    redirect(buildOwnHubUrlWithAccessDeniedToast(session.user.role));
  }

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
