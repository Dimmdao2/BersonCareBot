import { describe, expect, it } from "vitest";
import { startPhoneAuth, confirmPhoneAuth, normalizePhone } from "./phoneAuth";
import { createStubSmsAdapter } from "@/infra/integrations/sms/stubSmsAdapter";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { inMemoryUserByPhonePort } from "@/infra/repos/inMemoryUserByPhone";

const deps = {
  smsPort: createStubSmsAdapter({ challengeStore: inMemoryPhoneChallengeStore }),
  challengeStore: inMemoryPhoneChallengeStore,
  userByPhonePort: inMemoryUserByPhonePort,
};

const webContext = { channel: "web" as const, chatId: "test-web-1" };

describe("normalizePhone (via phoneAuth re-export)", () => {
  it("delegates to shared helper", () => {
    expect(normalizePhone("+79991234567")).toBe("+79991234567");
  });
});

describe("startPhoneAuth", () => {
  it("returns challengeId and retryAfter for valid phone", async () => {
    const result = await startPhoneAuth("+79991234567", webContext, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.challengeId).toBeDefined();
      expect(result.challengeId.length).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBe(60);
    }
  });

  it("accepts valid non-RU E.164 (US)", async () => {
    const result = await startPhoneAuth("+12025550123", webContext, deps);
    expect(result.ok).toBe(true);
  });

  it("returns invalid_phone for too short input", async () => {
    const result = await startPhoneAuth("123", webContext, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_phone");
  });

  it("returns invalid_phone when normalized length is not 12", async () => {
    const result = await startPhoneAuth("+7999123456789", webContext, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_phone");
  });
});

describe("confirmPhoneAuth", () => {
  it("returns user and redirectTo when code is correct", async () => {
    const start = await startPhoneAuth("+79997654321", webContext, deps);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const challenge = await inMemoryPhoneChallengeStore.get(start.challengeId);
    expect(challenge?.code).toBeDefined();
    const confirm = await confirmPhoneAuth(start.challengeId, challenge!.code!, deps);
    expect(confirm.ok).toBe(true);
    if (confirm.ok) {
      expect(confirm.user.role).toBe("client");
      expect(confirm.user.phone).toBeDefined();
      expect(confirm.redirectTo).toBe("/app/patient");
    }
  });

  it("returns invalid_code for wrong code", async () => {
    const start = await startPhoneAuth("+79991111111", webContext, deps);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const confirm = await confirmPhoneAuth(start.challengeId, "000000", deps); // wrong code
    expect(confirm.ok).toBe(false);
    if (!confirm.ok) expect(confirm.code).toBe("invalid_code");
  });

  it("returns too_many_attempts after 3 wrong codes", async () => {
    const start = await startPhoneAuth("+79990000099", webContext, deps);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const cid = start.challengeId;
    for (let i = 0; i < 2; i++) {
      const r = await confirmPhoneAuth(cid, "000000", deps);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("invalid_code");
    }
    const last = await confirmPhoneAuth(cid, "000000", deps);
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.code).toBe("too_many_attempts");
      expect(last.retryAfterSeconds).toBeDefined();
    }
  });

  it("returns expired_code for unknown challengeId", async () => {
    const confirm = await confirmPhoneAuth("nonexistent-challenge-id", "123456", deps);
    expect(confirm.ok).toBe(false);
    if (!confirm.ok) expect(confirm.code).toBe("expired_code");
  });

  it("binding comes from challenge only, not from request (regression: spoofed chatId)", async () => {
    const telegramContext = { channel: "telegram" as const, chatId: "trusted-telegram-456", displayName: "Test" };
    const start = await startPhoneAuth("+79997777777", telegramContext, deps);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const challenge = await inMemoryPhoneChallengeStore.get(start.challengeId);
    expect(challenge?.channelContext).toEqual(telegramContext);
    const confirm = await confirmPhoneAuth(start.challengeId, challenge!.code!, deps);
    expect(confirm.ok).toBe(true);
    if (confirm.ok) {
      expect(confirm.user.bindings.telegramId).toBe("trusted-telegram-456");
    }
  });

  it("challenge stores server-approved context at start", async () => {
    const ctx = { channel: "web" as const, chatId: "server-web-id", displayName: "Web User" };
    const start = await startPhoneAuth("+79998888888", ctx, deps);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const stored = await inMemoryPhoneChallengeStore.get(start.challengeId);
    expect(stored?.channelContext).toEqual(ctx);
  });
});
