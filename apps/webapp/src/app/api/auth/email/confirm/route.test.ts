import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.fn();
const confirmEmailChallengeMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock("@/modules/auth/emailAuth", () => ({
  confirmEmailChallenge: (...args: unknown[]) => confirmEmailChallengeMock(...args),
}));

import { POST } from "./route";

describe("POST /api/auth/email/confirm", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    confirmEmailChallengeMock.mockReset();
  });

  it("returns 401 when session is missing", async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);
    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", code: "123456" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 for email_conflict", async () => {
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "u-1", role: "doctor" },
    });
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: false, code: "email_conflict" });

    const res = await POST(
      new Request("http://localhost/api/auth/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: "00000000-0000-4000-8000-000000000001", code: "123456" }),
      }),
    );

    expect(res.status).toBe(409);
    const data = (await res.json()) as { ok: boolean; error: string; message: string };
    expect(data).toMatchObject({
      ok: false,
      error: "email_conflict",
      message: "Этот email уже используется другим аккаунтом",
    });
  });
});
