import { describe, expect, it } from "vitest";
import type { OrgEntitlementsPort } from "@/modules/org-entitlements/ports";
import type { OrganizationMemberDirectoryRecord, OrganizationMembershipPort } from "@/modules/organization-membership/ports";
import type { OrganizationInviteRecord, OrganizationInvitesPort } from "@/modules/organization-invites/ports";
import { createClinicSeatsService } from "./service";

function member(overrides: Partial<OrganizationMemberDirectoryRecord> = {}): OrganizationMemberDirectoryRecord {
  return {
    id: "membership-1",
    organizationId: "org-a",
    platformUserId: "user-1",
    role: "owner",
    specialistId: null,
    status: "active",
    displayName: "Owner",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

function invite(overrides: Partial<OrganizationInviteRecord> = {}): OrganizationInviteRecord {
  return {
    id: "invite-1",
    organizationId: "org-a",
    invitedEmail: "doc@example.com",
    invitedRole: "doctor",
    status: "pending",
    expiresAt: "2026-08-01T00:00:00.000Z",
    createdByPlatformUserId: "user-1",
    acceptedByPlatformUserId: null,
    acceptedMembershipId: null,
    createdAt: "2026-07-19T00:00:00.000Z",
    acceptedAt: null,
    organizationTitle: "Clinic",
    ...overrides,
  };
}

function makeService(params: {
  members?: OrganizationMemberDirectoryRecord[];
  pendingInvites?: OrganizationInviteRecord[];
  seatLimit?: number | null;
}) {
  const members = params.members ?? [];
  const pendingInvites = params.pendingInvites ?? [];
  const membershipPort: OrganizationMembershipPort = {
    listByPlatformUser: async () => [],
    listActiveByPlatformUser: async () => [],
    listByOrganization: async () => members,
    getMemberByOrganization: async () => null,
    listSpecialistsByOrganization: async () => [],
    getSpecialistByOrganization: async () => null,
  };
  const invitesPort: OrganizationInvitesPort = {
    createReplacingPending: async () => {
      throw new Error("not used in this test");
    },
    listPendingByOrganization: async () => pendingInvites,
    getByTokenHash: async () => null,
    expireInvite: async () => {},
    revokePendingByOrganization: async () => true,
    acceptPendingByTokenHash: async () => ({ ok: false, code: "invalid_token" }),
  };
  const orgEntitlementsPort: OrgEntitlementsPort = {
    getTariffForOrg: async () => ({ mechanics: {}, includedSeats: params.seatLimit ?? null }),
    listOverrides: async () => [],
  };
  return createClinicSeatsService({ membershipPort, invitesPort, orgEntitlementsPort });
}

describe("getSeatStatus", () => {
  it("counts an active owner/doctor as a seat and leaves admin uncounted", async () => {
    const service = makeService({
      members: [
        member({ id: "m1", role: "owner" }),
        member({ id: "m2", role: "doctor" }),
        member({ id: "m3", role: "admin" }),
      ],
      seatLimit: 3,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 3, used: 2, available: 1 });
  });

  it("counts a pending doctor invite as a reservation but not a pending admin invite", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner" })],
      pendingInvites: [invite({ invitedRole: "doctor" }), invite({ id: "invite-2", invitedRole: "admin" })],
      seatLimit: 2,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 2, used: 2, available: 0 });
  });

  it("does not double-count a disabled/historical membership row", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner" }), member({ id: "m2", role: "doctor", status: "disabled" })],
      seatLimit: 5,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 5, used: 1, available: 4 });
  });

  it("reports unlimited availability when there is no seat limit", async () => {
    const service = makeService({ members: [member()], seatLimit: null });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: null, used: 1, available: null });
  });

  it("never reports negative availability when usage already exceeds a downgraded limit", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner" }), member({ id: "m2", role: "doctor" }), member({ id: "m3", role: "doctor" })],
      seatLimit: 1,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 1, used: 3, available: 0 });
  });
});

describe("assertSeatAvailableForInvite", () => {
  it("always allows an admin invite regardless of seat usage", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner" }), member({ id: "m2", role: "doctor" })],
      seatLimit: 1,
    });
    await expect(service.assertSeatAvailableForInvite("org-a", "admin")).resolves.toEqual({ ok: true });
  });

  it("allows a doctor invite below the limit", async () => {
    const service = makeService({ members: [member({ id: "m1", role: "owner" })], seatLimit: 2 });
    await expect(service.assertSeatAvailableForInvite("org-a", "doctor")).resolves.toEqual({ ok: true });
  });

  it("blocks a doctor invite at the limit", async () => {
    const service = makeService({ members: [member({ id: "m1", role: "owner" })], seatLimit: 1 });
    await expect(service.assertSeatAvailableForInvite("org-a", "doctor")).resolves.toEqual({
      ok: false,
      code: "seat_limit_reached",
    });
  });

  it("blocks a doctor invite over the limit after a downgrade", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner" }), member({ id: "m2", role: "doctor" }), member({ id: "m3", role: "doctor" })],
      seatLimit: 1,
    });
    await expect(service.assertSeatAvailableForInvite("org-a", "doctor")).resolves.toEqual({
      ok: false,
      code: "seat_limit_reached",
    });
  });

  it("allows a doctor invite when the tariff has no seat limit", async () => {
    const service = makeService({
      members: Array.from({ length: 50 }, (_, i) => member({ id: `m${i}`, role: "doctor" })),
      seatLimit: null,
    });
    await expect(service.assertSeatAvailableForInvite("org-a", "doctor")).resolves.toEqual({ ok: true });
  });
});
