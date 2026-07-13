import { requireClinicManagementDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { ClinicMembersClient } from "./ClinicMembersClient";
import type { ClinicInviteView, ClinicMemberView } from "./types";

export default async function DoctorClinicMembersPage() {
  const workspace = await requireClinicManagementDoctorPage();
  const deps = buildAppDeps();
  const [members, invites] = await Promise.all([
    deps.organizationMembership.listOrganizationMembers(workspace.organizationId),
    deps.organizationInvites.listPending(workspace.organizationId),
  ]);

  const memberRows: ClinicMemberView[] = members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    specialistLinked: member.specialistId !== null,
  }));

  const inviteRows: ClinicInviteView[] = invites.map((invite) => ({
    id: invite.id,
    invitedEmail: invite.invitedEmail,
    invitedRole: invite.invitedRole,
    status: invite.status,
    expiresAt: invite.expiresAt,
  }));

  return (
    <DoctorAppShell title="Врачи">
      <DoctorPageHeader title="Врачи" subtitle="Команда клиники" />
      <ClinicMembersClient initialMembers={memberRows} initialInvites={inviteRows} />
    </DoctorAppShell>
  );
}
