import { describe, expect, it, vi } from "vitest";
import type { OrganizationMembership, OrganizationMembershipPort } from "./ports";
import { createOrganizationMembershipService } from "./service";

function membership(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
  return {
    id: "membership-1",
    organizationId: "org-1",
    platformUserId: "user-1",
    role: "doctor",
    specialistId: "specialist-1",
    status: "active",
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function serviceFor(rows: OrganizationMembership[]) {
  const port: OrganizationMembershipPort = {
    listByPlatformUser: vi.fn(async () => rows),
    listActiveByPlatformUser: vi.fn(async () => rows),
    listByOrganization: vi.fn(async () => rows.map((row) => ({ ...row, displayName: null }))),
    getMemberByOrganization: vi.fn(async ({ organizationId, membershipId }) => {
      const row = rows.find((candidate) => candidate.organizationId === organizationId && candidate.id === membershipId);
      return row ? { ...row, displayName: null } : null;
    }),
    listSpecialistsByOrganization: vi.fn(async () => []),
    getSpecialistByOrganization: vi.fn(async () => null),
  };
  return {
    service: createOrganizationMembershipService({ membershipPort: port }),
    port,
  };
}

describe("createOrganizationMembershipService", () => {
  it("returns no_active_membership when the user has no active memberships", async () => {
    const { service } = serviceFor([]);

    await expect(service.resolveOrganizationForUser({ platformUserId: "user-1" })).resolves.toEqual({
      ok: false,
      reason: "no_active_membership",
    });
  });

  it("resolves the current organization for a single active membership", async () => {
    const { service, port } = serviceFor([membership()]);

    await expect(service.resolveOrganizationForUser({ platformUserId: "user-1" })).resolves.toEqual({
      ok: true,
      context: {
        membershipId: "membership-1",
        organizationId: "org-1",
        platformUserId: "user-1",
        role: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });
    expect(port.listActiveByPlatformUser).toHaveBeenCalledWith("user-1");
  });

  it("throws for multiple active staff memberships", async () => {
    const { service } = serviceFor([
      membership({ id: "membership-1", organizationId: "org-1" }),
      membership({ id: "membership-2", organizationId: "org-2" }),
    ]);

    await expect(service.resolveOrganizationForUser({ platformUserId: "user-1" })).rejects.toThrow(
      "multiple_active_staff_memberships",
    );
  });

  it.each([
    ["owner", true],
    ["admin", true],
    ["doctor", false],
    ["assistant", false],
  ] as const)("sets management flags for %s role", async (role, canManage) => {
    const { service } = serviceFor([membership({ role })]);

    const result = await service.resolveOrganizationForUser({ platformUserId: "user-1" });
    expect(result).toMatchObject({
      ok: true,
      context: {
        role,
        canManageOrganization: canManage,
        canManageAllSpecialists: canManage,
      },
    });
  });

  it("lists organization members through the membership port", async () => {
    const row = membership({ organizationId: "org-1", role: "admin", specialistId: null });
    const { service, port } = serviceFor([row]);

    await expect(service.listOrganizationMembers("org-1")).resolves.toEqual([
      { ...row, displayName: null },
    ]);
    expect(port.listByOrganization).toHaveBeenCalledWith("org-1");
  });
});
