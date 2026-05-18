import { describe, expect, it, vi, beforeEach } from "vitest";

const registerPending = vi.fn();
const deleteUnverified = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      registerPendingVerification: registerPending,
      deleteUnverifiedEmailPasswordRegistration: deleteUnverified,
    },
  }),
}));

vi.mock("@/modules/auth/pinHash", () => ({
  hashPin: async (p: string) => `hashed:${p}`,
}));

const startEmailChallenge = vi.fn();
vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    startEmailChallenge: (...args: unknown[]) => startEmailChallenge(...args),
  };
});

import { POST } from "./route";

describe("POST /api/auth/email-password/register", () => {
  beforeEach(() => {
    registerPending.mockReset();
    deleteUnverified.mockReset();
    startEmailChallenge.mockReset();
  });

  it("deletes unverified user when email challenge fails so retry is possible", async () => {
    registerPending.mockResolvedValueOnce({ ok: true, userId: "11111111-1111-1111-1111-111111111111" });
    startEmailChallenge.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", password: "password12" }),
      }),
    );

    expect(deleteUnverified).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("email_send_failed");
  });
});
