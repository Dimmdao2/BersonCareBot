import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";
import { beOrganizationMembers } from "../../../db/schema/bookingEngine";

const orderByMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn(() => ({ orderBy: orderByMock })));
const fromMock = vi.hoisted(() => vi.fn(() => ({ where: whereMock })));
const selectMock = vi.hoisted(() => vi.fn(() => ({ from: fromMock })));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    select: selectMock,
  })),
}));

import { createPgOrganizationMembershipPort } from "./pgOrganizationMembership";

type OrganizationMembershipRow = typeof beOrganizationMembers.$inferSelect;

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

function whereApproxSql(): string {
  const calls = whereMock.mock.calls as unknown as Array<[unknown]>;
  return drizzleSqlFragmentToApproximateSql(calls[0]?.[0]);
}

describe("createPgOrganizationMembershipPort", () => {
  beforeEach(() => {
    orderByMock.mockReset();
    whereMock.mockClear();
    fromMock.mockClear();
    selectMock.mockClear();
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
});
