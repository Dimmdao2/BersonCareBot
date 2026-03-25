import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailCodeViaIntegratorMock = vi.fn();

vi.mock("@/infra/integrations/email/integratorEmailAdapter", () => ({
  sendEmailCodeViaIntegrator: (...args: unknown[]) => sendEmailCodeViaIntegratorMock(...args),
}));

import { normalizeEmail, startEmailChallenge } from "./emailAuth";

describe("normalizeEmail", () => {
  it("trim и нижний регистр", () => {
    expect(normalizeEmail("  User@MAIL.COM ")).toBe("user@mail.com");
  });
});

describe("startEmailChallenge", () => {
  beforeEach(() => {
    sendEmailCodeViaIntegratorMock.mockReset();
    sendEmailCodeViaIntegratorMock.mockResolvedValue({ ok: true });
  });

  it("отклоняет невалидный email", async () => {
    const r = await startEmailChallenge(randomUUID(), "not-an-email");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_email");
  });

  it("принимает корректный email (без БД — in-memory челлендж)", async () => {
    const r = await startEmailChallenge(randomUUID(), "user+tag@example.org");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.challengeId).toBeDefined();
      expect(r.retryAfterSeconds).toBeDefined();
    }
    expect(sendEmailCodeViaIntegratorMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeViaIntegratorMock).toHaveBeenCalledWith("user+tag@example.org", expect.stringMatching(/^\d{6}$/));
  });

  it("возвращает email_send_failed при ошибке отправки через integrator", async () => {
    sendEmailCodeViaIntegratorMock.mockResolvedValueOnce({ ok: false, error: "http_503" });
    const r = await startEmailChallenge(randomUUID(), "user@example.org");
    expect(r).toEqual({ ok: false, code: "email_send_failed" });
  });
});
