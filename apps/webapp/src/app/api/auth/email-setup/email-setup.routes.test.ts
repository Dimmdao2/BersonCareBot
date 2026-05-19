import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  validateTokenForForm,
  completeEmailSetup,
  resendFromExpiredToken,
  findByUserId,
  updateRole,
  setSessionFromUser,
} = vi.hoisted(() => ({
  validateTokenForForm: vi.fn(),
  completeEmailSetup: vi.fn(),
  resendFromExpiredToken: vi.fn(),
  findByUserId: vi.fn(),
  updateRole: vi.fn(),
  setSessionFromUser: vi.fn(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    emailSetupFlow: { validateTokenForForm, completeEmailSetup, resendFromExpiredToken },
    userByPhone: { findByUserId },
    userProjection: { updateRole },
  }),
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser,
}));

import { POST as validatePost } from "./validate/route";
import { POST as completePost } from "./complete/route";
import { POST as resendPost } from "./resend/route";

describe("email-setup API routes", () => {
  beforeEach(() => {
    validateTokenForForm.mockReset();
    completeEmailSetup.mockReset();
    resendFromExpiredToken.mockReset();
    findByUserId.mockReset();
    updateRole.mockReset();
    setSessionFromUser.mockReset();
  });

  it("validate returns email for active token", async () => {
    validateTokenForForm.mockResolvedValueOnce({
      ok: true,
      email: "user@example.com",
      status: "ready",
    });

    const res = await validatePost(
      new Request("http://localhost/api/auth/email-setup/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "est_abc" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; email: string };
    expect(body).toEqual({ ok: true, email: "user@example.com", status: "ready" });
  });

  it("validate returns 410 expired with email", async () => {
    validateTokenForForm.mockResolvedValueOnce({
      ok: false,
      error: "expired",
      email: "user@example.com",
    });

    const res = await validatePost(
      new Request("http://localhost/api/auth/email-setup/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "est_old" }),
      }),
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string; email: string };
    expect(body.error).toBe("expired");
    expect(body.email).toBe("user@example.com");
  });

  it("complete sets session and returns redirect", async () => {
    const uid = "550e8400-e29b-41d4-a716-446655440000";
    completeEmailSetup.mockResolvedValueOnce({ ok: true, userId: uid });
    findByUserId.mockResolvedValueOnce({
      userId: uid,
      role: "client",
      phone: null,
      bindings: { telegramId: null, maxId: null },
    });

    const res = await completePost(
      new Request("http://localhost/api/auth/email-setup/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "est_ok", password: "secret1234" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; redirectTo: string };
    expect(body.ok).toBe(true);
    expect(body.redirectTo).toBe("/app/patient");
    expect(setSessionFromUser).toHaveBeenCalledTimes(1);
  });

  it("resend returns ok", async () => {
    resendFromExpiredToken.mockResolvedValueOnce({ ok: true });

    const res = await resendPost(
      new Request("http://localhost/api/auth/email-setup/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "est_expired" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
