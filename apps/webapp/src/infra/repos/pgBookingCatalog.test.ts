import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

import { createPgBookingCatalogPort } from "./pgBookingCatalog";

const NOW = new Date("2026-01-01T00:00:00.000Z");

function cityRow(overrides = {}) {
  return {
    id: "city-uuid-1",
    code: "moscow",
    title: "Москва",
    is_active: true,
    sort_order: 1,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe("createPgBookingCatalogPort", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  describe("listCitiesForPatient", () => {
    it("queries active cities ordered by sort_order", async () => {
      queryMock.mockResolvedValueOnce({ rows: [cityRow()] });
      const port = createPgBookingCatalogPort();
      const cities = await port.listCitiesForPatient();
      expect(cities).toHaveLength(1);
      expect(cities[0]!.code).toBe("moscow");
      const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("is_active = TRUE");
      expect(sql).toContain("sort_order ASC");
    });
  });

  describe("listServicesByCity", () => {
    it("passes city code as parameter and joins required tables", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgBookingCatalogPort();
      await port.listServicesByCity("spb");
      const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("booking_branch_services");
      expect(sql).toContain("booking_cities");
      expect(sql).toContain("booking_branches");
      expect(sql).toContain("booking_specialists");
      expect(queryMock.mock.calls[0]?.[1]).toEqual(["spb"]);
    });
  });

  describe("resolveBranchService", () => {
    it("returns null when no rows returned", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgBookingCatalogPort();
      const result = await port.resolveBranchService("nonexistent-id");
      expect(result).toBeNull();
    });

    it("requires active city (parity with listServicesByCity)", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgBookingCatalogPort();
      await port.resolveBranchService("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb");
      const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("c.is_active = TRUE");
    });
  });

  describe("upsertCity", () => {
    it("uses ON CONFLICT (code) DO UPDATE", async () => {
      queryMock.mockResolvedValueOnce({ rows: [cityRow()] });
      const port = createPgBookingCatalogPort();
      await port.upsertCity({ code: "moscow", title: "Москва", isActive: true, sortOrder: 1 });
      const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("ON CONFLICT (code) DO UPDATE");
    });
  });

  describe("upsertBranch", () => {
    it("sets timezone on conflict and syncs branches.integrator_branch_id row", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "city-uuid-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "branch-uuid-1" }] })
        .mockResolvedValueOnce({ rowCount: 1 });
      const port = createPgBookingCatalogPort();
      await port.upsertBranch({
        cityCode: "moscow",
        title: "T",
        address: null,
        rubitimeBranchId: "17356",
        timezone: "Europe/Samara",
        isActive: true,
        sortOrder: 1,
      });
      const upsertSql = String(queryMock.mock.calls[1]?.[0] ?? "");
      expect(upsertSql).toContain("timezone = EXCLUDED.timezone");
      const syncSql = String(queryMock.mock.calls[2]?.[0] ?? "");
      expect(syncSql).toContain("UPDATE branches");
      expect(syncSql).toContain("integrator_branch_id");
      expect(queryMock.mock.calls[2]?.[1]).toEqual(["Europe/Samara", 17356]);
    });

    it("skips branches sync when rubitime_branch_id is not numeric", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: "city-uuid-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "branch-uuid-1" }] });
      const port = createPgBookingCatalogPort();
      await port.upsertBranch({
        cityCode: "moscow",
        title: "T",
        address: null,
        rubitimeBranchId: "alpha-branch",
        timezone: "Europe/Moscow",
        isActive: true,
        sortOrder: 1,
      });
      expect(queryMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("updateBranchById", () => {
    const branchRow = {
      id: "bb111111-1111-4111-8111-111111111111",
      city_id: "city-uuid-1",
      title: "Clinic",
      address: null,
      rubitime_branch_id: "17356",
      timezone: "Europe/Moscow",
      is_active: true,
      sort_order: 1,
      created_at: NOW,
      updated_at: NOW,
    };

    it("syncs branches after updating booking_branches timezone", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [branchRow] })
        .mockResolvedValueOnce({
          rows: [{ ...branchRow, timezone: "Asia/Yekaterinburg", updated_at: NOW }],
        })
        .mockResolvedValueOnce({ rowCount: 1 });
      const port = createPgBookingCatalogPort();
      await port.updateBranchById("bb111111-1111-4111-8111-111111111111", {
        timezone: "Asia/Yekaterinburg",
      });
      const syncSql = String(queryMock.mock.calls[2]?.[0] ?? "");
      expect(syncSql).toContain("UPDATE branches");
      expect(queryMock.mock.calls[2]?.[1]).toEqual(["Asia/Yekaterinburg", 17356]);
    });
  });

  describe("listCitiesAdmin", () => {
    it("includes inactive cities (no is_active filter)", async () => {
      queryMock.mockResolvedValueOnce({ rows: [cityRow({ is_active: false })] });
      const port = createPgBookingCatalogPort();
      await port.listCitiesAdmin();
      const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
      expect(sql).not.toContain("WHERE is_active");
    });
  });

  describe("upsertBranchServiceAdmin", () => {
    it("throws specialist_branch_mismatch when specialist belongs to another branch", async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ branch_id: "other-branch" }] });
      const port = createPgBookingCatalogPort();
      await expect(
        port.upsertBranchServiceAdmin({
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          specialistId: "550e8400-e29b-41d4-a716-446655440003",
          rubitimeServiceId: "r1",
          isActive: true,
          sortOrder: 0,
        }),
      ).rejects.toThrow("specialist_branch_mismatch");
    });
  });

  describe("deactivateBranchService", () => {
    it("sets is_active false", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1 });
      const port = createPgBookingCatalogPort();
      const ok = await port.deactivateBranchService("550e8400-e29b-41d4-a716-446655440000");
      expect(ok).toBe(true);
      const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("is_active = FALSE");
    });
  });
});
