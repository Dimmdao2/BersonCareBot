import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListHistory = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    reminderProjection: {
      listRulesByIntegratorUserId: vi.fn(),
      getRuleByIntegratorUserIdAndCategory: vi.fn(),
      listHistoryByIntegratorUserId: mockListHistory,
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

describe("GET /api/integrator/reminders/history", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when missing headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/reminders/history"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/history?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when integratorUserId missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/reminders/history", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with history array", async () => {
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
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, history: expect.any(Array) });
    expect(json.history).toHaveLength(1);
    expect(json.history[0].status).toBe("sent");
  });
});
