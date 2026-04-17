import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockGetQuestion = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const supportAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    supportAvailable.current
      ? {
          supportCommunication: {
            listOpenConversationsForAdmin: vi.fn(),
            getConversationByIntegratorId: vi.fn(),
            listUnansweredQuestionsForAdmin: vi.fn(),
            getQuestionByIntegratorConversationId: mockGetQuestion,
          },
        }
      : { supportCommunication: undefined },
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../../../testUtils/wireAssertIntegratorGetForRouteTests";

const ctx = (conversationId: string) => ({ params: Promise.resolve({ conversationId }) });

describe("GET /api/integrator/communication/questions/by-conversation/[conversationId]", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when headers missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions/by-conversation/c1"),
      ctx("c1")
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions/by-conversation/c1", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      }),
      ctx("c1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversation id empty", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions/by-conversation/  ", {
        headers: integratorGetSignedHeadersOk,
      }),
      ctx("  ")
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "conversation id required" });
  });

  it("returns 503 when support communication not available", async () => {
    supportAvailable.current = false;
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/communication/questions/by-conversation/c1", {
          headers: integratorGetSignedHeadersOk,
        }),
        ctx("c1")
      );
      expect(res.status).toBe(503);
    } finally {
      supportAvailable.current = true;
    }
  });

  it("returns 200 with question null when absent", async () => {
    mockGetQuestion.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions/by-conversation/c1", {
        headers: integratorGetSignedHeadersOk,
      }),
      ctx("c1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, question: null });
  });

  it("returns 200 with question when present", async () => {
    mockGetQuestion.mockResolvedValue({ id: "q1", body: "?" });
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions/by-conversation/c1", {
        headers: integratorGetSignedHeadersOk,
      }),
      ctx("c1")
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, question: { id: "q1", body: "?" } });
    expect(mockGetQuestion).toHaveBeenCalledWith("c1");
  });
});
