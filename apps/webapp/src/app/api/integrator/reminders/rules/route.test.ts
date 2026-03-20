import { describe, expect, it, vi } from "vitest";

const verifyGetMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetMock,
}));

const mockListRules = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      listRulesByIntegratorUserId: mockListRules,
      getRuleByIntegratorUserIdAndCategory: vi.fn(),
      listHistoryByIntegratorUserId: vi.fn(),
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/integrator/reminders/rules", () => {
  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/reminders/rules"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("returns 401 when signature invalid", async () => {
    verifyGetMock.mockReturnValue(false);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when integratorUserId missing", async () => {
    verifyGetMock.mockReturnValue(true);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("integratorUserId");
  });

  it("returns 200 with rules on happy path", async () => {
    verifyGetMock.mockReturnValue(true);
    mockListRules.mockResolvedValue([
      {
        id: "rule-1",
        userId: "42",
        category: "exercise",
        isEnabled: true,
        scheduleType: "daily",
        timezone: "Europe/Moscow",
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask: "1111111",
        contentMode: "none",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, rules: expect.any(Array) });
    expect(json.rules).toHaveLength(1);
    expect(json.rules[0].category).toBe("exercise");
  });
});
