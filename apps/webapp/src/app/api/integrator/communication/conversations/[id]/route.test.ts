import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockGetConversation = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const supportAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    supportAvailable.current
      ? {
          supportCommunication: {
            listOpenConversationsForAdmin: vi.fn(),
            getConversationByIntegratorId: mockGetConversation,
            listUnansweredQuestionsForAdmin: vi.fn(),
            getQuestionByIntegratorConversationId: vi.fn(),
          },
        }
      : { supportCommunication: undefined },
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../../testUtils/wireAssertIntegratorGetForRouteTests";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/integrator/communication/conversations/[id]", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when headers missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations/conv-1"),
      ctx("conv-1")
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations/conv-1", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      }),
      ctx("conv-1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when conversation id empty", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations/  ", {
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
        new Request("http://localhost/api/integrator/communication/conversations/conv-1", {
          headers: integratorGetSignedHeadersOk,
        }),
        ctx("conv-1")
      );
      expect(res.status).toBe(503);
    } finally {
      supportAvailable.current = true;
    }
  });

  it("returns 404 when conversation missing", async () => {
    mockGetConversation.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations/conv-x", {
        headers: integratorGetSignedHeadersOk,
      }),
      ctx("conv-x")
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: "not_found" });
  });

  it("returns 200 with conversation", async () => {
    mockGetConversation.mockResolvedValue({ id: "int-1", title: "Hi" });
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations/conv-1", {
        headers: integratorGetSignedHeadersOk,
      }),
      ctx("conv-1")
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, conversation: { id: "int-1", title: "Hi" } });
    expect(mockGetConversation).toHaveBeenCalledWith("conv-1");
  });
});
