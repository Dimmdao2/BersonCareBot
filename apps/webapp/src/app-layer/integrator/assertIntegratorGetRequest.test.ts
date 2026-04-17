import { describe, expect, it, vi } from "vitest";

const verifyGetMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetMock,
}));

import { assertIntegratorGetRequest } from "./assertIntegratorGetRequest";

describe("assertIntegratorGetRequest", () => {
  it("returns 400 JSON when webhook headers missing", async () => {
    const res = assertIntegratorGetRequest(new Request("http://localhost/api/integrator/x"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    expect(await res!.json()).toEqual({ ok: false, error: "missing webhook headers" });
    expect(verifyGetMock).not.toHaveBeenCalled();
  });

  it("returns 401 when verify returns false", async () => {
    verifyGetMock.mockReturnValue(false);
    const res = assertIntegratorGetRequest(
      new Request("http://localhost/api/integrator/x?a=1", {
        headers: {
          "x-bersoncare-timestamp": "1700000000",
          "x-bersoncare-signature": "sig",
        },
      })
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(await res!.json()).toEqual({ ok: false, error: "invalid signature" });
    expect(verifyGetMock).toHaveBeenCalledWith("1700000000", "GET /api/integrator/x?a=1", "sig");
  });

  it("returns null when verify returns true", () => {
    verifyGetMock.mockReturnValue(true);
    const res = assertIntegratorGetRequest(
      new Request("http://localhost/path", {
        headers: {
          "x-bersoncare-timestamp": "1",
          "x-bersoncare-signature": "ok",
        },
      })
    );
    expect(res).toBeNull();
  });
});
