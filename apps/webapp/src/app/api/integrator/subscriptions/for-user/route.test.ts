import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListSubscriptionsByIntegratorUserId = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const subscriptionMailingProjectionAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    subscriptionMailingProjectionAvailable.current
      ? {
          subscriptionMailingProjection: {
            listTopics: vi.fn(),
            listSubscriptionsByIntegratorUserId: mockListSubscriptionsByIntegratorUserId,
          },
        }
      : { subscriptionMailingProjection: undefined },
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/subscriptions/for-user", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/for-user?integratorUserId=42")
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "missing webhook headers" });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/for-user?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "invalid signature" });
  });

  it("returns 400 when integratorUserId missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/for-user", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "integratorUserId required" });
  });

  it("returns 503 when subscription projection not available", async () => {
    subscriptionMailingProjectionAvailable.current = false;
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/subscriptions/for-user?integratorUserId=42", {
          headers: integratorGetSignedHeadersOk,
        })
      );
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toMatchObject({ ok: false, error: expect.stringContaining("subscription") });
    } finally {
      subscriptionMailingProjectionAvailable.current = true;
    }
  });

  it("returns 200 with subscriptions on success", async () => {
    mockListSubscriptionsByIntegratorUserId.mockResolvedValue([
      { integratorTopicId: "1", topicCode: "news", isActive: true },
    ]);
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/for-user?integratorUserId=42", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, subscriptions: expect.any(Array) });
    expect(json.subscriptions).toHaveLength(1);
    expect(json.subscriptions[0]).toMatchObject({
      topicId: "1",
      topicCode: "news",
      isActive: true,
    });
    expect(mockListSubscriptionsByIntegratorUserId).toHaveBeenCalledWith("42");
  });
});
