/**
 * E2E (in-process) Stage 13: product read via webapp, no legacy path.
 * With mocks, no live DB required. Live e2e (backfill → reconcile → gate) run with STAGE13_E2E=1.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListTopics = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    { integratorTopicId: "1", code: "news", title: "News", key: "news", isActive: true },
  ])
);
const mockListSubscriptions = vi.hoisted(() =>
  vi.fn().mockResolvedValue([
    { integratorTopicId: "1", topicCode: "news", isActive: true },
  ])
);
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    subscriptionMailingProjection: {
      listTopics: mockListTopics,
      listSubscriptionsByIntegratorUserId: mockListSubscriptions,
    },
  }),
}));

import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "@/app/api/integrator/testUtils/wireAssertIntegratorGetForRouteTests";

describe("Stage 13 legacy cleanup (in-process)", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("subscriptions product read goes through webapp path (topics)", async () => {
    const { GET } = await import("@/app/api/integrator/subscriptions/topics/route");
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/topics", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      topics?: Array<{ id?: string; code?: string; key?: string; isActive?: boolean }>;
    };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.topics)).toBe(true);
    expect(mockListTopics).toHaveBeenCalled();
  });

  it("subscriptions product read goes through webapp path (for-user)", async () => {
    const { GET } = await import("@/app/api/integrator/subscriptions/for-user/route");
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/for-user?integratorUserId=42", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      subscriptions?: Array<{ topicId?: string; topicCode?: string; isActive?: boolean }>;
    };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.subscriptions)).toBe(true);
    expect(mockListSubscriptions).toHaveBeenCalled();
  });
});
