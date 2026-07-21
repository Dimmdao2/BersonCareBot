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
  inviteSeatReservations?: number;
  seatLimit?: number | null;
  clinicTeamEnabled?: boolean;
}) {
  const members = params.members ?? [];
  const pendingInvites = params.pendingInvites ?? [];
  const inviteSeatReservations =
    params.inviteSeatReservations ?? pendingInvites.filter((item) => item.invitedRole === "doctor").length;
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
    countSeatReservationsByOrganization: async () => inviteSeatReservations,
    getByTokenHash: async () => null,
    expireInvite: async () => {},
    revokePendingByOrganization: async () => true,
    acceptPendingByTokenHash: async () => ({ ok: false, code: "invalid_token" }),
  };
  const orgEntitlementsPort: OrgEntitlementsPort = {
    getTariffForOrg: async () => ({
      mechanics: { clinic_team: params.clinicTeamEnabled ?? true },
      includedSeats: params.seatLimit ?? null,
    }),
        listOverrides: async () => [],
        getEffectiveCommercialAccess: async () => ({
          lifecycle: "active",
          tariffId: null,
          source: "compatibility",
        }),
        reserveQuotaGrowth: async (_organizationId, mechanic) => ({
          allowed: true,
          warning: false,
          used: 0,
          projected: 0,
          limit: null,
          utilizationPercent: null,
          reason: "allowed",
          mechanic,
          periodKey: null,
          reserved: 0,
        }),
  };
  return createClinicSeatsService({ membershipPort, invitesPort, orgEntitlementsPort });
}

describe("getSeatStatus", () => {
  it("counts an active specialist-bound member as a seat, regardless of role", async () => {
    const service = makeService({
      members: [
        member({ id: "m1", role: "owner", specialistId: null }),
        member({ id: "m2", role: "doctor", specialistId: "spec-2" }),
        member({ id: "m3", role: "admin", specialistId: "spec-3" }),
      ],
      seatLimit: 3,
    });
    const status = await service.getSeatStatus("org-a");
    // m1 (owner, no binding) does not consume; m2 (doctor, bound) and m3 (admin, bound) do.
    expect(status).toEqual({ limit: 3, used: 2, available: 1 });
  });

  it("does not count an active owner without a specialist binding", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner", specialistId: null })],
      seatLimit: 3,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 3, used: 0, available: 3 });
  });

  it("counts a pending doctor invite as a reservation but not a pending admin invite", async () => {
    const service = makeService({
      members: [member({ id: "m1", role: "owner", specialistId: null })],
      pendingInvites: [invite({ invitedRole: "doctor" }), invite({ id: "invite-2", invitedRole: "admin" })],
      seatLimit: 2,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 2, used: 1, available: 1 });
  });

  it("keeps an accepted doctor invite reserved until its membership receives a specialist binding", async () => {
    const service = makeService({
      members: [member({ id: "accepted-membership", role: "doctor", specialistId: null })],
      inviteSeatReservations: 1,
      seatLimit: 2,
    });
    await expect(service.getSeatStatus("org-a")).resolves.toEqual({ limit: 2, used: 1, available: 1 });
  });

  it("does not double-count a disabled/historical membership row even with a specialist binding", async () => {
    const service = makeService({
      members: [
        member({ id: "m1", role: "owner", specialistId: "spec-1" }),
        member({ id: "m2", role: "doctor", status: "disabled", specialistId: "spec-2" }),
      ],
      seatLimit: 5,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 5, used: 1, available: 4 });
  });

  it("reports a 0 limit and 0 availability when clinic_team is not enabled", async () => {
    const service = makeService({ members: [member({ specialistId: "spec-1" })], clinicTeamEnabled: false });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 0, used: 1, available: 0 });
  });

  it("falls back to the fail-closed baseline when clinic_team is enabled without an explicit seat count", async () => {
    const service = makeService({ members: [member({ specialistId: "spec-1" })], seatLimit: null });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 1, used: 1, available: 0 });
  });

  it("never reports negative availability when usage already exceeds a downgraded limit", async () => {
    const service = makeService({
      members: [
        member({ id: "m1", role: "owner", specialistId: "spec-1" }),
        member({ id: "m2", role: "doctor", specialistId: "spec-2" }),
        member({ id: "m3", role: "doctor", specialistId: "spec-3" }),
      ],
      seatLimit: 1,
    });
    const status = await service.getSeatStatus("org-a");
    expect(status).toEqual({ limit: 1, used: 3, available: 0 });
  });
});
