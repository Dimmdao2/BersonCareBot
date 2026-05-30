import { describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const listScheduleBlocksMock = vi.hoisted(() => vi.fn());
const createScheduleBlockMock = vi.hoisted(() => vi.fn());

vi.mock("../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      listScheduleBlocks: listScheduleBlocksMock,
      createScheduleBlock: createScheduleBlockMock,
      deleteScheduleBlock: vi.fn(),
    },
  }),
}));

import { GET, POST } from "./route";

describe("/api/admin/booking-engine/schedule-blocks", () => {
  it("GET passes scope filters to listScheduleBlocks", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1" },
    });
    listScheduleBlocksMock.mockResolvedValue([]);

    const res = await GET(
      new Request(
        "http://localhost/api/admin/booking-engine/schedule-blocks?specialistId=11111111-1111-4111-8111-111111111111&branchId=22222222-2222-4222-8222-222222222222",
      ),
    );
    const json = (await res.json()) as { ok?: boolean; blocks?: unknown[] };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(listScheduleBlocksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        specialistId: "11111111-1111-4111-8111-111111111111",
        branchId: "22222222-2222-4222-8222-222222222222",
      }),
    );
  });

  it("POST creates scoped schedule block", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "user-1" } } },
    });
    createScheduleBlockMock.mockResolvedValue({ id: "block-1" });

    const res = await POST(
      new Request("http://localhost/api/admin/booking-engine/schedule-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialistId: "11111111-1111-4111-8111-111111111111",
          startAt: "2026-06-01T09:00:00.000Z",
          endAt: "2026-06-01T10:00:00.000Z",
          blockType: "block",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createScheduleBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        specialistId: "11111111-1111-4111-8111-111111111111",
        blockType: "block",
      }),
    );
  });
});
