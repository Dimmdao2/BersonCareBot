import { describe, expect, it, vi } from "vitest";

const verifyGetSignatureMock = vi.hoisted(() => vi.fn());
vi.mock("@/infra/webhooks/verifyIntegratorSignature", () => ({
  verifyIntegratorGetSignature: verifyGetSignatureMock,
}));

import { GET } from "./route";

describe("GET /api/integrator/diary/symptom-trackings", () => {
  it("returns 400 when headers missing", async () => {
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/symptom-trackings?userId=u1"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "missing webhook headers" });
  });

  it("returns 401 when signature invalid", async () => {
    verifyGetSignatureMock.mockReturnValue(false);
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/symptom-trackings?userId=u1", {
        headers: {
          "x-bersoncare-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-bersoncare-signature": "bad",
        },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid signature" });
  });

  it("returns 400 when userId missing", async () => {
    verifyGetSignatureMock.mockReturnValue(true);
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/symptom-trackings", {
        headers: {
          "x-bersoncare-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-bersoncare-signature": "sig",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "userId required" });
  });

  it("returns 200 with trackings array when valid", async () => {
    verifyGetSignatureMock.mockReturnValue(true);
    const res = await GET(
      new Request("https://localhost/api/integrator/diary/symptom-trackings?userId=u1", {
        headers: {
          "x-bersoncare-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-bersoncare-signature": "sig",
        },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ ok: true });
    expect(Array.isArray(data.trackings)).toBe(true);
  });
});
