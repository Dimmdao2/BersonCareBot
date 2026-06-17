/**
 * Unit tests for GET /api/integrator/web-push/vapid (PLAN S13 Model β).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const assertMock = vi.hoisted(() => vi.fn());
vi.mock("@/app-layer/integrator/assertIntegratorGetRequest", () => ({
  assertIntegratorGetRequest: assertMock,
}));

const mockGetWebPushVapidKeyPair = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ publicKey: "stub-pub", privateKey: "stub-priv" }),
);
vi.mock("@/modules/system-settings/webPushVapidRuntime", () => ({
  getWebPushVapidKeyPair: mockGetWebPushVapidKeyPair,
}));

const mockDeriveVapidSubject = vi.hoisted(() =>
  vi.fn().mockResolvedValue("mailto:noreply@example.com"),
);
vi.mock("@/modules/web-push/vapidSubject", () => ({
  deriveVapidSubject: mockDeriveVapidSubject,
}));

const mockBuildAppDeps = vi.hoisted(() =>
  vi.fn(() => ({ systemSettings: { getSetting: vi.fn().mockResolvedValue(null) } })),
);
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: mockBuildAppDeps,
}));

import { GET } from "./route";
import {
  integratorGetSignedHeadersOk,
  wireDefaultAssertIntegratorGetForRouteTests,
} from "../../testUtils/wireAssertIntegratorGetForRouteTests";

describe("GET /api/integrator/web-push/vapid", () => {
  beforeEach(() => {
    wireDefaultAssertIntegratorGetForRouteTests(assertMock);
    mockGetWebPushVapidKeyPair.mockReset().mockResolvedValue({ publicKey: "stub-pub", privateKey: "stub-priv" });
    mockDeriveVapidSubject.mockReset().mockResolvedValue("mailto:noreply@example.com");
  });

  it("returns 400 when missing webhook headers", async () => {
    const res = await GET(new Request("http://localhost/api/integrator/web-push/vapid"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.any(String) });
  });

  it("returns 401 when signature invalid", async () => {
    const res = await GET(
      new Request("http://localhost/api/integrator/web-push/vapid", {
        headers: { "x-bersoncare-timestamp": "1700000000", "x-bersoncare-signature": "bad" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when VAPID not configured", async () => {
    mockGetWebPushVapidKeyPair.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/integrator/web-push/vapid", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: expect.stringContaining("vapid") });
  });

  it("returns 200 with vapid keys and subject on happy path", async () => {
    mockGetWebPushVapidKeyPair.mockResolvedValue({ publicKey: "pub-key-abc", privateKey: "priv-key-xyz" });
    mockDeriveVapidSubject.mockResolvedValue("mailto:admin@bersoncare.com");

    const res = await GET(
      new Request("http://localhost/api/integrator/web-push/vapid", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.vapid).toMatchObject({
      publicKey: "pub-key-abc",
      privateKey: "priv-key-xyz",
      subject: "mailto:admin@bersoncare.com",
    });
  });

  it("uses fallback subject when SMTP not configured", async () => {
    mockDeriveVapidSubject.mockResolvedValue("mailto:noreply@invalid");

    const res = await GET(
      new Request("http://localhost/api/integrator/web-push/vapid", {
        headers: integratorGetSignedHeadersOk,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.vapid.subject).toBe("mailto:noreply@invalid");
  });
});
