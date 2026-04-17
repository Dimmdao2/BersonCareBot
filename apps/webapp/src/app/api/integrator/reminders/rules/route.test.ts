import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListRules = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      listRulesByIntegratorUserId: mockListRules,
      getRuleByIntegratorUserIdAndCategory: vi.fn(),
      listHistoryByIntegratorUserId: vi.fn(),
      getUnseenCount: vi.fn().mockResolvedValue(0),
      getStats: vi.fn().mockResolvedValue({ total: 0, seen: 0, unseen: 0, failed: 0 }),
      markSeen: vi.fn().mockResolvedValue(undefined),
      markAllSeen: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/reminders/rules", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/reminders/rules"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when integratorUserId missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("integratorUserId");
  });

  it("returns 200 with rules on happy path", async () => {
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
        linkedObjectType: null,
        linkedObjectId: null,
        customTitle: null,
        customText: null,
        deepLink: "http://127.0.0.1:5200/app/patient/reminders?from=reminder",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/rules?integratorUserId=42", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, rules: expect.any(Array) });
    expect(json.rules).toHaveLength(1);
    expect(json.rules[0].category).toBe("exercise");
  });
});
