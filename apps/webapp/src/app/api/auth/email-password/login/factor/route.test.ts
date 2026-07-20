import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readContinuationMock,
  clearContinuationMock,
  completeLoginMock,
  findByUserIdMock,
  setSessionFromUserMock,
} = vi.hoisted(() => ({
  readContinuationMock: vi.fn(),
  clearContinuationMock: vi.fn(),
  completeLoginMock: vi.fn(),
  findByUserIdMock: vi.fn(),
  setSessionFromUserMock: vi.fn(),
}));

vi.mock("@/modules/auth/staffLoginContinuation", () => ({
  readStaffLoginContinuation: readContinuationMock,
  clearStaffLoginContinuation: clearContinuationMock,
}));
vi.mock("@/modules/auth/service", () => ({ setSessionFromUser: setSessionFromUserMock }));
vi.mock("@/modules/auth/redirectPolicy", () => ({ getRedirectPathForRole: () => "/app/doctor" }));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    staffSecurity: { completeLogin: completeLoginMock },
    userByPhone: { findByUserId: findByUserIdMock },
  }),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const user = { userId: USER_ID, role: "doctor" as const, displayName: "Owner", bindings: {} };

function request() {
  return new Request("http://localhost/api/auth/email-password/login/factor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "123456" }),
  });
}

describe("POST /api/auth/email-password/login/factor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readContinuationMock.mockResolvedValue({ userId: USER_ID, token: "signed-continuation-token" });
    findByUserIdMock.mockResolvedValue(user);
  });

  it("keeps logout/relogin before recovery-code acknowledgement in recovery_confirmation", async () => {
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: false,
      recoveryConfirmed: false,
      sessionVersion: 1,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: "recovery_confirmation", verifiedAt: expect.any(Number) },
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      redirectTo: "/app/account?tab=security",
      recoveryMode: false,
    });
  });

  it("issues factor_verified only from confirmed DB profile truth", async () => {
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: false,
      recoveryConfirmed: true,
      sessionVersion: 1,
    });

    const response = await POST(request());

    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: "factor_verified", verifiedAt: expect.any(Number) },
    });
    await expect(response.json()).resolves.toMatchObject({ redirectTo: "/app/doctor" });
  });

  it("keeps a one-time recovery-code login in replacement mode", async () => {
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: true,
      sessionVersion: 2,
    });

    await POST(request());

    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: "recovery", verifiedAt: expect.any(Number) },
    });
  });
});
