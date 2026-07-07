import type { OrganizationMembershipPort } from "@/modules/organization-membership/ports";
import type {
  DoctorWorkspaceContext,
  DoctorWorkspaceDirectory,
  DoctorWorkspaceMember,
  DoctorWorkspaceSpecialist,
} from "./types";

function toWorkspaceSpecialist(
  specialist: Awaited<ReturnType<OrganizationMembershipPort["listSpecialistsByOrganization"]>>[number],
  context: DoctorWorkspaceContext,
): DoctorWorkspaceSpecialist {
  return {
    id: specialist.id,
    fullName: specialist.fullName,
    isActive: specialist.isActive,
    isCurrentUserSpecialist: specialist.id === context.specialistId,
  };
}

function toWorkspaceMember(
  member: Awaited<ReturnType<OrganizationMembershipPort["listByOrganization"]>>[number],
): DoctorWorkspaceMember {
  return {
    membershipId: member.id,
    platformUserId: member.platformUserId,
    role: member.role,
    specialistId: member.specialistId,
    status: member.status,
    displayName: member.displayName,
  };
}

export function createDoctorWorkspaceDirectoryService(deps: {
  membershipPort: OrganizationMembershipPort;
}) {
  return {
    async listDirectory(context: DoctorWorkspaceContext): Promise<DoctorWorkspaceDirectory> {
      const [members, specialists] = await Promise.all([
        deps.membershipPort.listByOrganization(context.organizationId),
        deps.membershipPort.listSpecialistsByOrganization(context.organizationId),
      ]);

      const visibleSpecialists = context.canManageAllSpecialists
        ? specialists.filter((specialist) => specialist.isActive)
        : specialists.filter((specialist) => specialist.isActive && specialist.id === context.specialistId);

      const visibleMembers = context.canManageOrganization
        ? members
        : members.filter((member) => member.id === context.membershipId);

      return {
        specialists: visibleSpecialists.map((specialist) => toWorkspaceSpecialist(specialist, context)),
        members: visibleMembers.map(toWorkspaceMember),
      };
    },
  };
}

export type DoctorWorkspaceDirectoryService = ReturnType<typeof createDoctorWorkspaceDirectoryService>;
