/**
 * E2E (in-process): GET /api/integrator/subscriptions/topics and for-user.
 * Mocks signature and deps so no real webhook secret or DB required in CI.
 */
import { describe, expect, it, vi } from "vitest";

const verifyGetMock = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetMock,
}));

const mockListTopics = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ integratorTopicId: "1", code: "news", title: "News", key: "news", isActive: true }])
);
const mockListSubscriptions = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ integratorTopicId: "1", topicCode: "news", isActive: true }])
);
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    subscriptionMailingProjection: {
      listTopics: mockListTopics,
      listSubscriptionsByIntegratorUserId: mockListSubscriptions,
    },
  }),
}));

describe("API integrator subscriptions in-process", () => {
  it("GET /api/integrator/subscriptions/topics returns 200 and topics", async () => {
    const { GET } = await import("@/app/api/integrator/subscriptions/topics/route");
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/topics", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; topics?: Array<{ id?: string; code?: string; title?: string; key?: string; isActive?: boolean }> };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.topics)).toBe(true);
    expect(data.topics).toHaveLength(1);
    expect(data.topics![0]).toMatchObject({ id: "1", code: "news", title: "News", key: "news", isActive: true });
  });

  it("GET /api/integrator/subscriptions/for-user returns 200 and subscriptions", async () => {
    const { GET } = await import("@/app/api/integrator/subscriptions/for-user/route");
    const res = await GET(
      new Request("http://localhost/api/integrator/subscriptions/for-user?integratorUserId=42", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "sig" },
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      subscriptions?: Array<{ topicId?: string; topicCode?: string; isActive?: boolean }>;
    };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.subscriptions)).toBe(true);
    expect(data.subscriptions).toHaveLength(1);
    expect(data.subscriptions![0]).toMatchObject({ topicId: "1", topicCode: "news", isActive: true });
  });
});
