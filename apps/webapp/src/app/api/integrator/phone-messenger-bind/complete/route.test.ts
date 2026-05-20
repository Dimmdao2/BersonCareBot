import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

const completeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    phoneMessengerBind: {
      completeFromIntegrator: (...args: unknown[]) => completeMock(...args),
    },
  }),
}));

import { POST } from "./route";

const TEST_SECRET = "test-integrator-webhook-secret";

function sign(timestamp: string, rawBody: string): string {
  return createHmac("sha256", TEST_SECRET).update(`${timestamp}.${rawBody}`).digest("base64url");
}

vi.mock("@/config/env", () => ({
  integratorWebhookSecret: () => TEST_SECRET,
}));

describe("POST /api/integrator/phone-messenger-bind/complete", () => {
  beforeEach(() => {
    completeMock.mockReset();
  });

  it("returns 401 for invalid signature", async () => {
    const body = JSON.stringify({
      setupToken: "auth_abc",
      channelCode: "telegram",
      externalId: "123",
      phoneNormalized: "+79991234567",
    });
    const res = await POST(
      new Request("http://localhost/api/integrator/phone-messenger-bind/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-bersoncare-signature": "bad",
        },
        body,
      }),
    );
    expect(res.status).toBe(401);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("returns 200 with otpCode on success", async () => {
    completeMock.mockResolvedValue({
      ok: true,
      purpose: "login",
      otpCode: "654321",
      accountCreated: true,
      challengeId: "ch-1",
    });
    const body = JSON.stringify({
      setupToken: "auth_abc",
      channelCode: "telegram",
      externalId: "123",
      phoneNormalized: "+79991234567",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      new Request("http://localhost/api/integrator/phone-messenger-bind/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": sign(timestamp, body),
        },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { otpCode?: string; ok?: boolean; purpose?: string };
    expect(data.ok).toBe(true);
    expect(data.purpose).toBe("login");
    expect(data.otpCode).toBe("654321");
  });

  it("returns profile_bind without otpCode", async () => {
    completeMock.mockResolvedValue({
      ok: true,
      purpose: "profile_bind",
    });
    const body = JSON.stringify({
      setupToken: "auth_abc",
      channelCode: "telegram",
      externalId: "123",
      phoneNormalized: "+79991234567",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      new Request("http://localhost/api/integrator/phone-messenger-bind/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": sign(timestamp, body),
        },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; purpose?: string; otpCode?: string };
    expect(data.ok).toBe(true);
    expect(data.purpose).toBe("profile_bind");
    expect(data.otpCode).toBeUndefined();
  });

  it("returns 409 for phone_mismatch", async () => {
    completeMock.mockResolvedValue({ ok: false, code: "phone_mismatch" });
    const body = JSON.stringify({
      setupToken: "auth_abc",
      channelCode: "telegram",
      externalId: "123",
      phoneNormalized: "+79991234567",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      new Request("http://localhost/api/integrator/phone-messenger-bind/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": sign(timestamp, body),
        },
        body,
      }),
    );
    expect(res.status).toBe(409);
  });

  it("returns replay otp on otp_ready replay", async () => {
    completeMock.mockResolvedValue({
      ok: true,
      purpose: "login",
      otpCode: "111222",
      accountCreated: false,
      challengeId: "ch-replay",
      replay: true,
    });
    const body = JSON.stringify({
      setupToken: "auth_abc",
      channelCode: "telegram",
      externalId: "123",
      phoneNormalized: "+79991234567",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      new Request("http://localhost/api/integrator/phone-messenger-bind/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": sign(timestamp, body),
        },
        body,
      }),
    );
    const data = (await res.json()) as { replay?: boolean; otpCode?: string };
    expect(data.replay).toBe(true);
    expect(data.otpCode).toBe("111222");
  });

  it("returns already_used for used_token", async () => {
    completeMock.mockResolvedValue({ ok: false, code: "used_token" });
    const body = JSON.stringify({
      setupToken: "auth_abc",
      channelCode: "telegram",
      externalId: "123",
      phoneNormalized: "+79991234567",
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      new Request("http://localhost/api/integrator/phone-messenger-bind/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bersoncare-timestamp": timestamp,
          "x-bersoncare-signature": sign(timestamp, body),
        },
        body,
      }),
    );
    const data = (await res.json()) as { status?: string };
    expect(data.status).toBe("already_used");
  });
});
