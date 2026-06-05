import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindEmailSendPort } from "./emailSendPort";

const sendEmailCodeMock = vi.fn();

import {
  confirmEmailChallenge,
  normalizeEmail,
  resetEmailAuthMemStateForTests,
  startEmailChallenge,
  consumeLatestEmailChallengeCodeForUser,
} from "./emailAuth";

describe("normalizeEmail", () => {
  it("trim и нижний регистр", () => {
    expect(normalizeEmail("  User@MAIL.COM ")).toBe("user@mail.com");
  });
});

describe("startEmailChallenge", () => {
  beforeEach(() => {
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
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
    expect(sendEmailCodeMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeMock).toHaveBeenCalledWith("user+tag@example.org", expect.stringMatching(/^\d{6}$/));
  });

  it("возвращает email_send_failed при ошибке отправки через integrator", async () => {
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "http_503" });
    const r = await startEmailChallenge(randomUUID(), "user@example.org");
    expect(r).toEqual({ ok: false, code: "email_send_failed" });
  });
});

describe("confirmEmailChallenge (in-memory)", () => {
  beforeEach(() => {
    resetEmailAuthMemStateForTests();
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
  });

  it("подтверждает код и резервирует email за пользователем", async () => {
    const uid = randomUUID();
    const start = await startEmailChallenge(uid, "mine@example.org");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const code = sendEmailCodeMock.mock.calls[0]?.[1] as string;
    const result = await confirmEmailChallenge(uid, start.challengeId, code);
    expect(result).toEqual({ ok: true });
  });

  it("возвращает email_conflict если email уже занят другим пользователем", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    const startOwner = await startEmailChallenge(ownerId, "taken@example.org");
    expect(startOwner.ok).toBe(true);
    if (!startOwner.ok) return;
    const ownerCode = sendEmailCodeMock.mock.calls[0]?.[1] as string;
    await confirmEmailChallenge(ownerId, startOwner.challengeId, ownerCode);

    const startOther = await startEmailChallenge(otherId, "taken@example.org");
    expect(startOther.ok).toBe(true);
    if (!startOther.ok) return;
    const otherCode = sendEmailCodeMock.mock.calls[1]?.[1] as string;
    const conflict = await confirmEmailChallenge(otherId, startOther.challengeId, otherCode);
    expect(conflict).toEqual({ ok: false, code: "email_conflict" });
  });
});

describe("consumeLatestEmailChallengeCodeForUser", () => {
  beforeEach(() => {
    resetEmailAuthMemStateForTests();
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
  });

  it("принимает код без challengeId (in-memory челлендж)", async () => {
    const uid = randomUUID();
    const start = await startEmailChallenge(uid, "who@example.org");
    expect(start.ok).toBe(true);
    const sentCode = sendEmailCodeMock.mock.calls[0]?.[1];
    expect(typeof sentCode).toBe("string");
    const consumed = await consumeLatestEmailChallengeCodeForUser(uid, sentCode as string);
    expect(consumed).toEqual({ ok: true });
  });
});
