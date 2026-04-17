import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/diary/lfk-complexes", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when headers missing", async () => {
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/lfk-complexes?userId=u1")
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing webhook headers" });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/lfk-complexes?userId=u1", {
        headers: {
          "x-bersoncare-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-bersoncare-signature": "bad",
        },
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid signature" });
  });

  it("returns 400 when userId missing", async () => {
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/lfk-complexes", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "userId required" });
  });

  it("returns 200 with complexes array when valid", async () => {
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/lfk-complexes?userId=u1", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true });
    expect(Array.isArray(data.complexes)).toBe(true);
  });
});
