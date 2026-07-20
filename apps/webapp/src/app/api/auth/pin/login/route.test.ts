import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";

const {
  findByPhoneMock,
  findByUserIdMock,
  verifyPinMock,
  updateRoleMock,
  getSecurityStatusMock,
  beginLoginMock,
  setSessionFromUserMock,
  issueContinuationMock,
} = vi.hoisted(() => ({
  findByPhoneMock: vi.fn(),
  findByUserIdMock: vi.fn(),
  verifyPinMock: vi.fn(),
  updateRoleMock: vi.fn(),
  getSecurityStatusMock: vi.fn(),
  beginLoginMock: vi.fn(),
  setSessionFromUserMock: vi.fn(),
  issueContinuationMock: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userByPhone: {
      findByPhone: (...args: unknown[]) => findByPhoneMock(...args),
      findByUserId: (...args: unknown[]) => findByUserIdMock(...args),
    },
    userPins: {},
    userProjection: { updateRole: (...args: unknown[]) => updateRoleMock(...args) },
    staffSecurity: {
      getStatus: (...args: unknown[]) => getSecurityStatusMock(...args),
      beginLogin: (...args: unknown[]) => beginLoginMock(...args),
    },
  }),
}));

vi.mock("@/modules/auth/pinAuth", () => ({
  verifyPinForLogin: (...args: unknown[]) => verifyPinMock(...args),
}));

vi.mock("@/modules/auth/envRole", () => ({
  resolveRoleFromEnv: () => "client",
  reconcileDbRoleWithEnvRole: (currentRole: string, envRole: string) =>
    currentRole === "doctor" || currentRole === "admin" ? currentRole : envRole,
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

vi.mock("@/modules/auth/staffLoginContinuation", () => ({
  issueStaffLoginContinuation: (...args: unknown[]) => issueContinuationMock(...args),
}));

import { POST } from "./route";

const client = {
  userId: "phone:1",
  role: "client" as const,
  displayName: "Patient",
  phone: "+79995554433",
  bindings: {},
};

function loginRequest(phone: string, pin: string) {
  return new Request("http://localhost/api/auth/pin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, pin }),
  });
}

describe("POST /api/auth/pin/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByPhoneMock.mockResolvedValue(client);
    findByUserIdMock.mockResolvedValue(client);
    verifyPinMock.mockResolvedValue({ ok: true });
    getSecurityStatusMock.mockResolvedValue(null);
  });

  it("returns 400 when phone is not valid E.164", async () => {
    const res = await POST(loginRequest("invalid", "1234"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "invalid_phone" });
  });

  it("returns 400 when body or PIN format is invalid", async () => {
    const missing = await POST(new Request("http://localhost/api/auth/pin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));
    const wrongLength = await POST(loginRequest("+79998887766", "123456"));
    expect(missing.status).toBe(400);
    expect(wrongLength.status).toBe(400);
  });

  it("keeps the generic credential error for unknown phone and wrong PIN", async () => {
    findByPhoneMock.mockResolvedValueOnce(null);
    const unknown = await POST(loginRequest("+79990000001", "1234"));
    expect(unknown.status).toBe(401);
    await expect(unknown.json()).resolves.toMatchObject({ error: "invalid_credentials" });

    findByPhoneMock.mockResolvedValueOnce(client);
    verifyPinMock.mockResolvedValueOnce({ ok: false, code: "invalid", attemptsLeft: 2 });
    const wrongPin = await POST(loginRequest(client.phone, "2222"));
    expect(wrongPin.status).toBe(401);
    await expect(wrongPin.json()).resolves.toMatchObject({
      error: "invalid_credentials",
      attemptsLeft: 2,
    });
  });

  it("reloads the exact client and creates the normal session after a correct PIN", async () => {
    const res = await POST(loginRequest(client.phone, "5656"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, redirectTo: "/app/patient" });
    expect(findByUserIdMock).toHaveBeenCalledWith(client.userId);
    expect(setSessionFromUserMock).toHaveBeenCalledWith(client, {});
  });

  it("requires the enrolled staff factor after PIN proof without issuing a session", async () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    const identityOnlyDoctor = {
      userId,
      role: "doctor" as const,
      displayName: "PIN Doctor",
      phone: "+79995554433",
      bindings: {},
    };
    const exactDoctor = {
      ...identityOnlyDoctor,
      securityVersion: 5,
      securityFactorRequired: true,
    };
    findByPhoneMock.mockResolvedValue(identityOnlyDoctor);
    findByUserIdMock.mockImplementationOnce(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({ kind: "patient", platformUserId: userId });
      return exactDoctor;
    });
    getSecurityStatusMock.mockResolvedValue({ enrolled: true });
    beginLoginMock.mockResolvedValue({
      required: true,
      token: "factor-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });

    const res = await POST(loginRequest(identityOnlyDoctor.phone, "5656"));

    await expect(res.json()).resolves.toEqual({ ok: true, factorRequired: true });
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    expect(issueContinuationMock).toHaveBeenCalledWith({
      userId,
      token: "factor-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
  });
});
