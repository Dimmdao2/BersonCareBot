import { describe, expect, it, vi } from "vitest";

const verifyGetMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetMock,
}));

const mockListHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      listRulesByIntegratorUserId: vi.fn(),
      getRuleByIntegratorUserIdAndCategory: vi.fn(),
      listHistoryByIntegratorUserId: mockListHistory,
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/integrator/reminders/history", () => {
  it("returns 400 when missing headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/reminders/history"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    verifyGetMock.mockReturnValue(false);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/history?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when integratorUserId missing", async () => {
    verifyGetMock.mockReturnValue(true);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/history", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with history array", async () => {
    verifyGetMock.mockReturnValue(true);
    mockListHistory.mockResolvedValue([
      {
        id: "occ-1",
        ruleId: "rule-1",
        status: "sent",
        deliveryChannel: "telegram",
        errorCode: null,
        occurredAt: "2025-01-01T12:00:00.000Z",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/history?integratorUserId=42&limit=50", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, history: expect.any(Array) });
    expect(json.history).toHaveLength(1);
    expect(json.history[0].status).toBe("sent");
  });
});
