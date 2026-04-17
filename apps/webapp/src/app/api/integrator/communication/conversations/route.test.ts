import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListOpen = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const supportAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    supportAvailable.current
      ? {
          supportCommunication: {
            listOpenConversationsForAdmin: mockListOpen,
            getConversationByIntegratorId: vi.fn(),
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
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/communication/conversations", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when webhook headers missing", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/communication/conversations"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing webhook headers" });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when support communication not available", async () => {
    supportAvailable.current = false;
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/communication/conversations", {
          headers: integratorGetSignedHeadersOk,
        })
      );
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        ok: false,
        error: expect.stringContaining("support communication"),
      });
    } finally {
      supportAvailable.current = true;
    }
  });

  it("returns 200 with conversations", async () => {
    mockListOpen.mockResolvedValue([{ id: "c1", source: "telegram" }]);
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/conversations?limit=5", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, conversations: expect.any(Array) });
    expect(json.conversations).toHaveLength(1);
    expect(mockListOpen).toHaveBeenCalledWith({ limit: 5 });
  });
});
