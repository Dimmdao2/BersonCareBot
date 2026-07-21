import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";

const setSessionFromUserMock = vi.fn().mockResolvedValue(undefined);
const trySetInitialIfEmptyMock = vi.fn().mockResolvedValue(undefined);
const getPhoneChallengeMock = vi.fn();
const confirmPhoneAuthMock = vi.fn();
const findByUserIdMock = vi.fn();
const getSecurityStatusMock = vi.fn();
const beginLoginMock = vi.fn();
const issueContinuationMock = vi.fn();
const isAuthChannelEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/authChannelPolicy", () => ({
  isAuthChannelEnabled: (...args: unknown[]) => isAuthChannelEnabledMock(...args),
}));

vi.mock("@/modules/auth/staffLoginContinuation", () => ({
  issueStaffLoginContinuation: (...args: unknown[]) => issueContinuationMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    auth: {
      getPhoneChallenge: (...args: unknown[]) => getPhoneChallengeMock(...args),
      setSessionFromUser: setSessionFromUserMock,
      confirmPhoneAuth: (...args: unknown[]) => confirmPhoneAuthMock(...args),
    },
    userByPhone: { findByUserId: (...args: unknown[]) => findByUserIdMock(...args) },
    staffSecurity: {
      getStatus: (...args: unknown[]) => getSecurityStatusMock(...args),
      beginLogin: (...args: unknown[]) => beginLoginMock(...args),
    },
    patientCalendarTimezone: {
      trySetInitialIfEmpty: trySetInitialIfEmptyMock,
    },
  }),
}));

vi.mock("@/app-layer/product-analytics/recordAuthRegistration", () => ({
  recordAuthRegistrationFailure: vi.fn().mockResolvedValue(undefined),
  recordAuthRegistrationSuccess: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("POST /api/auth/phone/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPhoneChallengeMock.mockReset();
    getPhoneChallengeMock.mockResolvedValue({
      isRegistrationIntent: false,
      phone: "+79991234567",
    });
    isAuthChannelEnabledMock.mockReset();
    isAuthChannelEnabledMock.mockResolvedValue(true);
    const client = {
      userId: "phone:1",
      role: "client" as const,
      displayName: "+79991234567",
      phone: "+79991234567",
      bindings: {},
    };
    confirmPhoneAuthMock.mockImplementation(async (_challengeId: string, code: string) =>
      code === "123456"
        ? { ok: true as const, user: client, redirectTo: "/app/patient" }
        : { ok: false as const, code: "invalid_code" },
    );
    findByUserIdMock.mockResolvedValue(client);
    getSecurityStatusMock.mockResolvedValue(null);
  });

  it("returns 400 when challengeId or code is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/phone/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("returns 200 and sets session when code is correct", async () => {
    setSessionFromUserMock.mockClear();
    trySetInitialIfEmptyMock.mockClear();
    const res = await POST(
      new Request("http://localhost/api/auth/phone/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "test-challenge", code: "123456" }),
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe("/app/patient");
    expect(data.role).toBe("client");
    expect(setSessionFromUserMock).toHaveBeenCalledTimes(1);
    expect(findByUserIdMock).toHaveBeenCalledWith("phone:1");
    expect(trySetInitialIfEmptyMock).not.toHaveBeenCalled();
  });

  it("rejects a disabled stored delivery channel before confirming the challenge", async () => {
    getPhoneChallengeMock.mockResolvedValue({
      isRegistrationIntent: false,
      phone: "+79991234567",
      deliveryChannel: "max",
    });
    isAuthChannelEnabledMock.mockResolvedValue(false);

    const res = await POST(
      new Request("http://localhost/api/auth/phone/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "test-challenge", code: "123456" }),
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
    expect(confirmPhoneAuthMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });

  it("passes browserCalendarIana to trySetInitialIfEmpty when provided", async () => {
    trySetInitialIfEmptyMock.mockClear();
    const res = await POST(
      new Request("http://localhost/api/auth/phone/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "test-challenge",
          code: "123456",
          browserCalendarIana: "Europe/Berlin",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(trySetInitialIfEmptyMock).toHaveBeenCalledWith("phone:1", "Europe/Berlin");
  });

  it("keeps profile bind out of the login-factor/session replacement path", async () => {
    getPhoneChallengeMock.mockResolvedValue({
      isRegistrationIntent: false,
      phone: "+79991234567",
      profileBindUserId: "phone:1",
    });

    const res = await POST(new Request("http://localhost/api/auth/phone/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: "profile-bind", code: "123456" }),
    }));

    expect(res.status).toBe(200);
    expect(findByUserIdMock).toHaveBeenCalledWith("phone:1");
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    expect(getSecurityStatusMock).not.toHaveBeenCalled();
  });

  it("requires the enrolled staff factor after OTP proof without issuing a session", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const doctor = {
      userId,
      role: "doctor" as const,
      displayName: "Owner Doctor",
      phone: "+79991234567",
      bindings: {},
      securityVersion: 3,
      securityFactorRequired: true,
    };
    confirmPhoneAuthMock.mockResolvedValue({
      ok: true,
      user: { ...doctor, securityVersion: undefined, securityFactorRequired: undefined },
      redirectTo: "/app/doctor",
      deliveryChannel: "sms",
    });
    findByUserIdMock.mockImplementationOnce(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({ kind: "patient", platformUserId: userId });
      return doctor;
    });
    getSecurityStatusMock.mockResolvedValue({ enrolled: true });
    beginLoginMock.mockResolvedValue({
      required: true,
      token: "factor-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });

    const res = await POST(new Request("http://localhost/api/auth/phone/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId: "test-challenge", code: "123456" }),
    }));

    await expect(res.json()).resolves.toEqual({ ok: true, factorRequired: true });
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    expect(issueContinuationMock).toHaveBeenCalledWith({
      userId,
      token: "factor-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
      postLoginHints: { phoneOtpChannel: "sms" },
    });
  });
});
