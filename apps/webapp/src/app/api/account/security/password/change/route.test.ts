import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkAuthConfirmRateLimitMock,
  requireStaffSecurityApiSessionMock,
  changePasswordMock,
  setSessionFromUserMock,
} = vi.hoisted(() => ({
  checkAuthConfirmRateLimitMock: vi.fn(),
  requireStaffSecurityApiSessionMock: vi.fn(),
  changePasswordMock: vi.fn(),
  setSessionFromUserMock: vi.fn(),
}));

vi.mock("@/modules/auth/authConfirmRateLimit", () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) =>
    checkAuthConfirmRateLimitMock(...args),
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireStaffSecurityApiSession: () => requireStaffSecurityApiSessionMock(),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    passwordChange: { changePassword: changePasswordMock },
  }),
}));
vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

import { POST } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const staffSecurity = {
  assurance: "factor_verified" as const,
  verifiedAt: 1_700_000_000,
};
const sessionUser = {
  userId: USER_ID,
  role: "doctor" as const,
  displayName: "Врач",
  bindings: {},
  sessionEpoch: 4,
};
const freshUser = { ...sessionUser, sessionEpoch: 5 };

function request(body: unknown = {
  currentPassword: "current-password",
  newPassword: "new-password",
}) {
  return new Request(
    "http://localhost/api/account/security/password/change",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/account/security/password/change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
    requireStaffSecurityApiSessionMock.mockResolvedValue({
      ok: true,
      session: { user: sessionUser, staffSecurity },
    });
  });

  it("returns an actionable 429 before authentication or password verification when the shared per-IP limiter engages", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({
      limited: true,
      reason: "rate_limited",
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 600,
    });
    expect(requireStaffSecurityApiSessionMock).not.toHaveBeenCalled();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("uses the reset-flow password policy and rejects a weak new password before mutation", async () => {
    const response = await POST(request({
      currentPassword: "current-password",
      newPassword: "short",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "weak_new_password",
    });
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("mints the replacement current session from the post-revocation user epoch", async () => {
    changePasswordMock.mockResolvedValue({ ok: true, user: freshUser });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(changePasswordMock).toHaveBeenCalledWith({
      userId: USER_ID,
      currentPassword: "current-password",
      newPassword: "new-password",
    });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(freshUser, {
      staffSecurity,
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
