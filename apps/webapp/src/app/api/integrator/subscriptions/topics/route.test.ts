import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListTopics = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const subscriptionMailingProjectionAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    subscriptionMailingProjectionAvailable.current
      ? {
          subscriptionMailingProjection: {
            listTopics: mockListTopics,
            listSubscriptionsByIntegratorUserId: vi.fn(),
          },
        }
      : { subscriptionMailingProjection: undefined },
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/subscriptions/topics", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/subscriptions/topics"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "missing webhook headers" });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/topics", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "invalid signature" });
  });

  it("returns 503 when subscription projection not available", async () => {
    subscriptionMailingProjectionAvailable.current = false;
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/subscriptions/topics", {
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

  it("returns 200 with topics on success", async () => {
    mockListTopics.mockResolvedValue([
      {
        integratorTopicId: "1",
        code: "news",
        title: "News",
        key: "news",
        isActive: true,
      },
    ]);
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/topics", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, topics: expect.any(Array) });
    expect(json.topics).toHaveLength(1);
    expect(json.topics[0]).toMatchObject({ id: "1", code: "news", title: "News", key: "news", isActive: true });
    expect(mockListTopics).toHaveBeenCalledTimes(1);
  });
});
