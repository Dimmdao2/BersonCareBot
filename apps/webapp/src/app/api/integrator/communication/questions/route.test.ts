import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockListQuestions = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const supportAvailable = vi.hoisted(() => ({ current: true }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () =>
    supportAvailable.current
      ? {
          supportCommunication: {
            listOpenConversationsForAdmin: vi.fn(),
            getConversationByIntegratorId: vi.fn(),
            listUnansweredQuestionsForAdmin: mockListQuestions,
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

describe("GET /api/integrator/communication/questions", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when headers missing", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/communication/questions"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when support communication not available", async () => {
    supportAvailable.current = false;
    try {
      const res = await GET(
        new Request("http://localhost/api/integrator/communication/questions", {
          headers: integratorGetSignedHeadersOk,
        })
      );
      expect(res.status).toBe(503);
    } finally {
      supportAvailable.current = true;
    }
  });

  it("returns 200 with questions", async () => {
    mockListQuestions.mockResolvedValue([{ id: "q1" }]);
    const res = await GET(
      new Request("http://localhost/api/integrator/communication/questions?limit=10", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, questions: [{ id: "q1" }] });
    expect(mockListQuestions).toHaveBeenCalledWith({ limit: 10 });
  });
});
