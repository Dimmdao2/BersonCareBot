import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";
import { beOrganizationMembers, beSpecialists } from "../../../db/schema/bookingEngine";

const orderByMock = vi.hoisted(() => vi.fn());
const leftJoinMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => ({
  leftJoin: leftJoinMock,
  where: whereMock,
}));
const fromMock = vi.hoisted(() => vi.fn(() => queryMock));
const selectMock = vi.hoisted(() => vi.fn(() => ({ from: fromMock })));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    select: selectMock,
  })),
}));

import { createPgOrganizationMembershipPort } from "./pgOrganizationMembership";

type OrganizationMembershipRow = typeof beOrganizationMembers.$inferSelect;
type OrganizationSpecialistRow = typeof beSpecialists.$inferSelect;

function membershipRow(overrides: Partial<OrganizationMembershipRow> = {}): OrganizationMembershipRow {
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

function specialistRow(overrides: Partial<OrganizationSpecialistRow> = {}): OrganizationSpecialistRow {
  return {
    id: "specialist-1",
    organizationId: "org-1",
    fullName: "Doctor Specialist",
    description: null,
    isActive: true,
    sortOrder: 0,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

function whereApproxSql(): string {
  const calls = whereMock.mock.calls as unknown as Array<[unknown]>;
  return drizzleSqlFragmentToApproximateSql(calls[0]?.[0]);
}

describe("createPgOrganizationMembershipPort", () => {
  beforeEach(() => {
    orderByMock.mockReset();
    leftJoinMock.mockClear();
    whereMock.mockClear();
    fromMock.mockClear();
    selectMock.mockClear();
    leftJoinMock.mockReturnValue(queryMock);
    whereMock.mockReturnValue({ orderBy: orderByMock });
  });

  it("lists memberships by platform user and maps typed fields", async () => {
    orderByMock.mockResolvedValueOnce([
      membershipRow({ id: "membership-1", role: "owner", specialistId: null }),
      membershipRow({ id: "membership-2", role: "assistant", status: "invited" }),
    ]);

    const port = createPgOrganizationMembershipPort();
    const rows = await port.listByPlatformUser("user-1");

    expect(rows).toEqual([
      {
        id: "membership-1",
        organizationId: "org-1",
        platformUserId: "user-1",
        role: "owner",
        specialistId: null,
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
      {
        id: "membership-2",
        organizationId: "org-1",
        platformUserId: "user-1",
        role: "assistant",
        specialistId: "specialist-1",
        status: "invited",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    ]);
    expect(whereApproxSql()).toContain("=");
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("filters active memberships for resolver callers", async () => {
    orderByMock.mockResolvedValueOnce([membershipRow()]);

    const port = createPgOrganizationMembershipPort();
    await expect(port.listActiveByPlatformUser("user-1")).resolves.toHaveLength(1);

    const sql = whereApproxSql();
    expect(sql).toContain("and");
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("rejects role/status values outside the database contract", async () => {
    orderByMock.mockResolvedValueOnce([membershipRow({ role: "clinic-owner" })]);

    const port = createPgOrganizationMembershipPort();
    await expect(port.listByPlatformUser("user-1")).rejects.toThrow(
      "Unexpected be_organization_members.role",
    );

    orderByMock.mockResolvedValueOnce([membershipRow({ status: "archived" })]);
    await expect(port.listByPlatformUser("user-1")).rejects.toThrow(
      "Unexpected be_organization_members.status",
    );
  });

  it("lists organization members with display names", async () => {
    orderByMock.mockResolvedValueOnce([
      {
        ...membershipRow({ role: "admin", specialistId: null }),
        displayName: " Admin ",
      },
    ]);

    const port = createPgOrganizationMembershipPort();
    const rows = await port.listByOrganization("org-1");

    expect(rows).toEqual([
      {
        id: "membership-1",
        organizationId: "org-1",
        platformUserId: "user-1",
        role: "admin",
        specialistId: null,
        status: "active",
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
        displayName: "Admin",
      },
    ]);
    expect(leftJoinMock).toHaveBeenCalledTimes(1);
  });

  it("gets one organization member by organization and membership id", async () => {
    orderByMock.mockResolvedValueOnce([
      {
        ...membershipRow({ role: "doctor" }),
        displayName: "Doctor",
      },
    ]);

    const port = createPgOrganizationMembershipPort();
    const row = await port.getMemberByOrganization({
      organizationId: "org-1",
      membershipId: "membership-1",
    });

    expect(row).toMatchObject({
      id: "membership-1",
      organizationId: "org-1",
      displayName: "Doctor",
    });
    expect(whereApproxSql()).toContain("and");
    expect(leftJoinMock).toHaveBeenCalledTimes(1);
  });

  it("lists organization specialists", async () => {
    orderByMock.mockResolvedValueOnce([specialistRow()]);

    const port = createPgOrganizationMembershipPort();
    const rows = await port.listSpecialistsByOrganization("org-1");

    expect(rows).toEqual([
      {
        id: "specialist-1",
        organizationId: "org-1",
        fullName: "Doctor Specialist",
        isActive: true,
        createdAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    ]);
  });

  it("gets one organization specialist by organization and specialist id", async () => {
    orderByMock.mockResolvedValueOnce([specialistRow()]);

    const port = createPgOrganizationMembershipPort();
    const row = await port.getSpecialistByOrganization({
      organizationId: "org-1",
      specialistId: "specialist-1",
    });

    expect(row).toEqual({
      id: "specialist-1",
      organizationId: "org-1",
      fullName: "Doctor Specialist",
      isActive: true,
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
    });
    expect(whereApproxSql()).toContain("and");
  });
});
