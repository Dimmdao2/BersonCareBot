import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const getTargetsMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({ deliveryTargetsApi: { getTargets: getTargetsMock } }),
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/delivery-targets", () => {
  beforeEach(() => {
    getTargetsMock.mockReset().mockResolvedValue({ channelBindings: { telegramId: "tg1" } });
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
  });

  it("returns 403 when target identity is outside the signed organization", async () => {
    const { DeliveryTargetsTenantDeniedError } = await import("@/modules/integrator/deliveryTargetsApi");
    getTargetsMock.mockRejectedValue(new DeliveryTargetsTenantDeniedError());
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=tg1&integratorUserId=42&organizationId=11111111-1111-4111-8111-111111111111", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 instead of a legacy fallback when target identity is not found", async () => {
    getTargetsMock.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=missing&integratorUserId=42&organizationId=11111111-1111-4111-8111-111111111111", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(404);
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
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=tg1&organizationId=11111111-1111-4111-8111-111111111111", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      })
    );
    expect(res.status).toBe(401);
    expect(assertMock).toHaveBeenCalled();
  });

  it("returns 200 with channelBindings when signature valid and params present", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=tg1&organizationId=11111111-1111-4111-8111-111111111111", {
        headers: integratorGetSignedHeadersOk,
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("ok", true);
    expect(json).toHaveProperty("channelBindings");
    expect(typeof json.channelBindings).toBe("object");
  });

  it("fails closed when the signed request has no organizationId", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/delivery-targets?telegramId=tg1", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "valid organizationId required" });
  });
});
