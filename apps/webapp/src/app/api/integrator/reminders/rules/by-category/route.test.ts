import { describe, expect, it, vi } from "vitest";

const verifyGetMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetMock,
}));

const mockGetRule = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      listRulesByIntegratorUserId: vi.fn(),
      getRuleByIntegratorUserIdAndCategory: mockGetRule,
      listHistoryByIntegratorUserId: vi.fn(),
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/integrator/reminders/rules/by-category", () => {
  it("returns 400 when missing headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/reminders/rules/by-category"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    verifyGetMock.mockReturnValue(false);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules/by-category?integratorUserId=42&category=exercise", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when integratorUserId or category missing", async () => {
    verifyGetMock.mockReturnValue(true);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules/by-category?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with rule or null", async () => {
    verifyGetMock.mockReturnValue(true);
    mockGetRule.mockResolvedValue({
      id: "rule-1",
      userId: "42",
      category: "exercise",
      isEnabled: true,
      scheduleType: "daily",
      timezone: "UTC",
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: "1111111",
      contentMode: "none",
    });
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules/by-category?integratorUserId=42&category=exercise", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, rule: expect.any(Object) });
    expect(json.rule.category).toBe("exercise");
  });
});
