import { describe, expect, it, vi } from "vitest";

const verifyPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorSignature: verifyPostMock,
}));

const mockSnooze = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminders: {
      snoozeOccurrence: mockSnooze,
    },
  }),
}));

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { POST } from "./route";

describe("POST /api/integrator/reminders/occurrences/snooze", () => {
  it("returns 400 when missing headers", async () => {
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/occurrences/snooze", {
        method: "POST",
        body: "{}",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    verifyPostMock.mockReturnValue(false);
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/occurrences/snooze", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "bad",
          "content-type": "application/json",
        },
        body: JSON.stringify({ integratorUserId: "1", occurrenceId: "occ-1", minutes: 30 }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when minutes invalid", async () => {
    verifyPostMock.mockReturnValue(true);
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/occurrences/snooze", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "content-type": "application/json",
        },
        body: JSON.stringify({ integratorUserId: "1", occurrenceId: "occ-1", minutes: 99 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 when snooze succeeds", async () => {
    verifyPostMock.mockReturnValue(true);
    mockQuery.mockResolvedValue({ rows: [{ id: "pu-1" }] });
    mockSnooze.mockResolvedValue({
      ok: true,
      data: { occurrenceId: "occ-1", snoozedUntil: "2026-04-02T15:00:00.000Z" },
    });
    const res = await POST(
      new Request("http://localhost/api/integrator/reminders/occurrences/snooze", {
        method: "POST",
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
          "content-type": "application/json",
        },
        body: JSON.stringify({ integratorUserId: "1", occurrenceId: "occ-1", minutes: 30 }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      occurrenceId: "occ-1",
      snoozedUntil: "2026-04-02T15:00:00.000Z",
    });
  });
});
