import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const listWorkingDaysMock = vi.hoisted(() => vi.fn());
const upsertWorkingDaysMock = vi.hoisted(() => vi.fn());
const closeWorkingDaysMock = vi.hoisted(() => vi.fn());
const clearWorkingDaysMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listWorkingDays: listWorkingDaysMock,
      upsertWorkingDays: upsertWorkingDaysMock,
      closeWorkingDays: closeWorkingDaysMock,
      clearWorkingDays: clearWorkingDaysMock,
    },
  }),
}));

import { GET, PUT } from "./route";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPEC = "11111111-1111-4111-8111-111111111111";

describe("/api/admin/booking-engine/working-days", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when not authenticated", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({
        ok: false,
        response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
      });
      const res = await GET(
        new Request("http://localhost/api/admin/booking-engine/working-days?dateFrom=2026-06-01&dateTo=2026-06-30"),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when dateFrom/dateTo missing", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      const res = await GET(new Request("http://localhost/api/admin/booking-engine/working-days"));
      expect(res.status).toBe(400);
    });

    it("returns rows for valid date range", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      listWorkingDaysMock.mockResolvedValue([{ id: "wd-1", workDate: "2026-06-10" }]);
      const res = await GET(
        new Request(
          `http://localhost/api/admin/booking-engine/working-days?dateFrom=2026-06-01&dateTo=2026-06-30&specialistId=${SPEC}`,
        ),
      );
      const json = (await res.json()) as { ok: boolean; rows: unknown[] };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.rows).toHaveLength(1);
      expect(listWorkingDaysMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG, specialistId: SPEC, dateFrom: "2026-06-01", dateTo: "2026-06-30" }),
      );
    });

    it("resolves __none__ specialistId to null", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      listWorkingDaysMock.mockResolvedValue([]);
      await GET(
        new Request("http://localhost/api/admin/booking-engine/working-days?dateFrom=2026-06-01&dateTo=2026-06-30&specialistId=__none__"),
      );
      expect(listWorkingDaysMock).toHaveBeenCalledWith(
        expect.objectContaining({ specialistId: null }),
      );
    });
  });

  describe("PUT upsert", () => {
    it("returns 401 when not authenticated", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({
        ok: false,
        response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
      });
      const res = await PUT(
        new Request("http://localhost/api/admin/booking-engine/working-days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", dates: ["2026-06-10"], startMinute: 540, endMinute: 1080 }),
        }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 for missing action", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      const res = await PUT(
        new Request("http://localhost/api/admin/booking-engine/working-days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dates: ["2026-06-10"], startMinute: 540, endMinute: 1080 }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("upserts working days", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      upsertWorkingDaysMock.mockResolvedValue([]);
      const res = await PUT(
        new Request("http://localhost/api/admin/booking-engine/working-days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upsert",
            dates: ["2026-06-10", "2026-06-11"],
            startMinute: 540,
            endMinute: 1080,
            specialistId: SPEC,
          }),
        }),
      );
      const json = (await res.json()) as { ok: boolean };
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(upsertWorkingDaysMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          specialistId: SPEC,
          startMinute: 540,
          endMinute: 1080,
          dates: ["2026-06-10", "2026-06-11"],
        }),
      );
    });
  });

  describe("PUT close", () => {
    it("closes working days", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      closeWorkingDaysMock.mockResolvedValue([]);
      const res = await PUT(
        new Request("http://localhost/api/admin/booking-engine/working-days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "close", dates: ["2026-06-10"] }),
        }),
      );
      expect(res.status).toBe(200);
      expect(closeWorkingDaysMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG, dates: ["2026-06-10"] }),
      );
    });
  });

  describe("PUT clear", () => {
    it("clears working days", async () => {
      requireAdminBookingEngineMock.mockResolvedValue({ ok: true, ctx: { organizationId: ORG } });
      clearWorkingDaysMock.mockResolvedValue(undefined);
      const res = await PUT(
        new Request("http://localhost/api/admin/booking-engine/working-days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clear", dates: ["2026-06-10"] }),
        }),
      );
      expect(res.status).toBe(200);
      expect(clearWorkingDaysMock).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG, dates: ["2026-06-10"] }),
      );
    });
  });
});
