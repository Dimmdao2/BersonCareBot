import { describe, expect, it } from "vitest";
import type { PhoneChallengePayload, PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import { createStubSmsAdapter } from "./stubSmsAdapter";

function createTestStore(): PhoneChallengeStore & { getLastCode: () => string | null } {
  const map = new Map<string, PhoneChallengePayload>();
  let lastCode: string | null = null;
  return {
    async set(challengeId: string, payload: PhoneChallengePayload): Promise<void> {
      lastCode = payload.code ?? null;
      map.set(challengeId, payload);
    },
    async get(challengeId: string): Promise<PhoneChallengePayload | null> {
      return map.get(challengeId) ?? null;
    },
    async delete(challengeId: string): Promise<void> {
      map.delete(challengeId);
    },
    getLastCode: () => lastCode,
  };
}

describe("stubSmsAdapter", () => {
  it("sendCode returns ok with challengeId and retryAfterSeconds", async () => {
    const store = createTestStore();
    const adapter = createStubSmsAdapter({ challengeStore: store });
    const result = await adapter.sendCode("+79991234567", 600);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.challengeId).toBeDefined();
      expect(typeof result.challengeId).toBe("string");
      expect(result.retryAfterSeconds).toBe(60);
    }
  });

  it("verifyCode returns ok for the code that was stored", async () => {
    const store = createTestStore();
    const adapter = createStubSmsAdapter({ challengeStore: store });
    const send = await adapter.sendCode("+79997654321", 600);
    expect(send.ok).toBe(true);
    if (!send.ok) return;
    const code = store.getLastCode();
    expect(code).toBeDefined();
    const verify = await adapter.verifyCode(send.challengeId, code!);
    expect(verify.ok).toBe(true);
  });

  it("verifyCode returns invalid_code for wrong code", async () => {
    const store = createTestStore();
    const adapter = createStubSmsAdapter({ challengeStore: store });
    const send = await adapter.sendCode("+79990000001", 600);
    expect(send.ok).toBe(true);
    if (!send.ok) return;
    const verify = await adapter.verifyCode(send.challengeId, "999999");
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.code).toBe("invalid_code");
  });

  it("verifyCode returns expired_code for unknown challengeId", async () => {
    const store = createTestStore();
    const adapter = createStubSmsAdapter({ challengeStore: store });
    const verify = await adapter.verifyCode("unknown-id", "123456");
    expect(verify.ok).toBe(false);
    if (!verify.ok) expect(verify.code).toBe("expired_code");
  });
});
