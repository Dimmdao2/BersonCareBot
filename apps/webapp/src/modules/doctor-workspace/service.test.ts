import { describe, expect, it, vi } from 'vitest';
import type {
  OrganizationMemberDirectoryRecord,
  OrganizationMembershipPort,
  OrganizationSpecialistDirectoryRecord,
} from '@/modules/organization-membership/ports';
import type { DoctorWorkspaceContext } from './types';
import { createDoctorWorkspaceDirectoryService } from './service';

const baseContext: DoctorWorkspaceContext = {
  organizationId: 'org-1',
  organizationName: null,
  membershipId: 'membership-doctor',
  membershipRole: 'doctor',
  specialistId: 'specialist-doctor',
  canManageOrganization: false,
  canManageAllSpecialists: false,
  selectedSpecialistId: 'specialist-doctor',
};

function createPort(): OrganizationMembershipPort {
  const members: OrganizationMemberDirectoryRecord[] = [
    {
      id: 'membership-doctor',
      organizationId: 'org-1',
      platformUserId: 'doctor-user',
      role: 'doctor',
      specialistId: 'specialist-doctor',
      status: 'active',
      displayName: 'Doctor',
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      id: 'membership-admin',
      organizationId: 'org-1',
      platformUserId: 'admin-user',
      role: 'admin',
      specialistId: null,
      status: 'active',
      displayName: 'Admin',
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
  ];
  const specialists: OrganizationSpecialistDirectoryRecord[] = [
    {
      id: 'specialist-doctor',
      organizationId: 'org-1',
      fullName: 'Doctor Specialist',
      isActive: true,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      id: 'specialist-peer',
      organizationId: 'org-1',
      fullName: 'Peer Specialist',
      isActive: true,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
    {
      id: 'specialist-inactive',
      organizationId: 'org-1',
      fullName: 'Inactive Specialist',
      isActive: false,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
    },
  ];

  return {
    listByPlatformUser: vi.fn(async () => []),
    listActiveByPlatformUser: vi.fn(async () => []),
    listByOrganization: vi.fn(async () => members),
    listPlatformDirectoryByOrganization: vi.fn(async () => members),
    getMemberByOrganization: vi.fn(async ({ organizationId, membershipId }) => {
      return (
        members.find(
          (member) => member.organizationId === organizationId && member.id === membershipId,
        ) ?? null
      );
    }),
    listSpecialistsByOrganization: vi.fn(async () => specialists),
    getSpecialistByOrganization: vi.fn(async ({ organizationId, specialistId }) => {
      return (
        specialists.find(
          (specialist) =>
            specialist.organizationId === organizationId && specialist.id === specialistId,
        ) ?? null
      );
    }),
  };
}

describe('createDoctorWorkspaceDirectoryService', () => {
  it('restricts bound doctor directory to own specialist and own membership', async () => {
    const port = createPort();
    const service = createDoctorWorkspaceDirectoryService({ membershipPort: port });

    const directory = await service.listDirectory(baseContext);

    expect(directory.specialists).toEqual([
      {
        id: 'specialist-doctor',
        fullName: 'Doctor Specialist',
        isActive: true,
        isCurrentUserSpecialist: true,
      },
    ]);
    expect(directory.members.map((member) => member.membershipId)).toEqual(['membership-doctor']);
    expect(port.listByOrganization).not.toHaveBeenCalled();
    expect(port.listSpecialistsByOrganization).not.toHaveBeenCalled();
    expect(port.getMemberByOrganization).toHaveBeenCalledWith({
      organizationId: 'org-1',
      membershipId: 'membership-doctor',
    });
    expect(port.getSpecialistByOrganization).toHaveBeenCalledWith({
      organizationId: 'org-1',
      specialistId: 'specialist-doctor',
    });
  });

  it('allows admin/owner context to see active specialists and all members', async () => {
    const service = createDoctorWorkspaceDirectoryService({ membershipPort: createPort() });

    const directory = await service.listDirectory({
      ...baseContext,
      membershipId: 'membership-admin',
      membershipRole: 'admin',
      specialistId: null,
      canManageOrganization: true,
      canManageAllSpecialists: true,
      selectedSpecialistId: null,
    });

    expect(directory.specialists.map((specialist) => specialist.id)).toEqual([
      'specialist-doctor',
      'specialist-peer',
    ]);
    expect(directory.members.map((member) => member.membershipId)).toEqual([
      'membership-doctor',
      'membership-admin',
    ]);
  });
});
