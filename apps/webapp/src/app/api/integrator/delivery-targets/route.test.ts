import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/delivery-targets", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/delivery-targets"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("returns 400 when no phone, telegramId, or maxId", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: "one of phone, telegramId, maxId is required" });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=tg1", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
    expect(assertMock).toHaveBeenCalled();
  });

  it("returns 200 with channelBindings when signature valid and params present", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=tg1", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("ok", true);
    expect(json).toHaveProperty("channelBindings");
    expect(typeof json.channelBindings).toBe("object");
  });
});
