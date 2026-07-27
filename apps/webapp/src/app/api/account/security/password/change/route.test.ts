import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal,
  getCurrentDbPrincipal,
  runWithDbPrincipalSnapshot,
} from "@bersoncare/db-principal";

const {
  isAuthConfirmRateLimitedByKeyMock,
  requireStaffSecurityApiSessionMock,
  changePasswordMock,
  setSessionFromUserMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  isAuthConfirmRateLimitedByKeyMock: vi.fn(),
  requireStaffSecurityApiSessionMock: vi.fn(),
  changePasswordMock: vi.fn(),
  setSessionFromUserMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/modules/auth/authRateLimits", () => ({
  isAuthConfirmRateLimitedByKey: (...args: unknown[]) =>
    isAuthConfirmRateLimitedByKeyMock(...args),
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
vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerErrorMock(...args) },
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
    isAuthConfirmRateLimitedByKeyMock.mockResolvedValue(false);
    requireStaffSecurityApiSessionMock.mockResolvedValue({
      ok: true,
      session: { user: sessionUser, staffSecurity },
    });
  });

  it("does not let an anonymous caller consume the shared confirm budget", async () => {
    requireStaffSecurityApiSessionMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(isAuthConfirmRateLimitedByKeyMock).not.toHaveBeenCalled();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("returns an actionable 429 after authentication when the shared per-IP limiter engages", async () => {
    isAuthConfirmRateLimitedByKeyMock.mockResolvedValueOnce(true);

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 600,
    });
    expect(requireStaffSecurityApiSessionMock).toHaveBeenCalledOnce();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("stamps a locked-mode DB principal before the real confirm limiter reaches persistence", async () => {
    let rateLimitPrincipal: ReturnType<typeof getCurrentDbPrincipal>;
    isAuthConfirmRateLimitedByKeyMock.mockImplementationOnce(async () => {
      rateLimitPrincipal = getCurrentDbPrincipal();
      assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(rateLimitPrincipal, {
        mode: "locked",
      });
      return false;
    });
    changePasswordMock.mockResolvedValue({ ok: true, user: freshUser });

    const response = await runWithDbPrincipalSnapshot(
      undefined,
      () => POST(request()),
    );

    expect(response.status).toBe(200);
    expect(rateLimitPrincipal).toMatchObject({
      kind: "bootstrap",
      source: "api/account/security/password/change:POST",
    });
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

  it("reports a truthful distinct outcome when session reissue fails after the password changed", async () => {
    const sessionError = new Error("cookie write failed");
    changePasswordMock.mockResolvedValue({ ok: true, user: freshUser });
    setSessionFromUserMock.mockRejectedValueOnce(sessionError);

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "password_changed_session_reissue_failed",
      passwordChanged: true,
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: sessionError },
      "[account/security/password/change] session reissue failed after password change",
    );
  });
});
