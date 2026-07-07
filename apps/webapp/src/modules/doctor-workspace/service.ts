import type {
  OrganizationMemberDirectoryRecord,
  OrganizationMembershipPort,
  OrganizationSpecialistDirectoryRecord,
} from "@/modules/organization-membership/ports";
import type {
  DoctorWorkspaceContext,
  DoctorWorkspaceDirectory,
  DoctorWorkspaceMember,
  DoctorWorkspaceSpecialist,
} from "./types";

function toWorkspaceSpecialist(
  specialist: OrganizationSpecialistDirectoryRecord,
  context: DoctorWorkspaceContext,
): DoctorWorkspaceSpecialist {
  return {
    id: specialist.id,
    fullName: specialist.fullName,
    isActive: specialist.isActive,
    isCurrentUserSpecialist: specialist.id === context.specialistId,
  };
}

function toWorkspaceMember(member: OrganizationMemberDirectoryRecord): DoctorWorkspaceMember {
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
      const [visibleMembers, visibleSpecialists] = await Promise.all([
        context.canManageOrganization
          ? deps.membershipPort.listByOrganization(context.organizationId)
          : deps.membershipPort
              .getMemberByOrganization({
                organizationId: context.organizationId,
                membershipId: context.membershipId,
              })
              .then((member) => (member ? [member] : [])),
        context.canManageAllSpecialists
          ? deps.membershipPort
              .listSpecialistsByOrganization(context.organizationId)
              .then((specialists) => specialists.filter((specialist) => specialist.isActive))
          : context.specialistId
            ? deps.membershipPort
                .getSpecialistByOrganization({
                  organizationId: context.organizationId,
                  specialistId: context.specialistId,
                })
                .then((specialist) => (specialist?.isActive ? [specialist] : []))
            : Promise.resolve([]),
      ]);

      return {
        specialists: visibleSpecialists.map((specialist) => toWorkspaceSpecialist(specialist, context)),
        members: visibleMembers.map(toWorkspaceMember),
      };
    },
  };
}

export type DoctorWorkspaceDirectoryService = ReturnType<typeof createDoctorWorkspaceDirectoryService>;
