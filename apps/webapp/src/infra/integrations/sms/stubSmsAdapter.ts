import { randomBytes } from "node:crypto";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import { generateSmsCode } from "@/modules/auth/smsCode";
import type { SendCodeResult, SmsPort, VerifyCodeResult } from "@/modules/auth/smsPort";

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

export type StubSmsAdapterDeps = {
  challengeStore: PhoneChallengeStore;
};

export function createStubSmsAdapter(deps: StubSmsAdapterDeps): SmsPort {
  const { challengeStore } = deps;
  return {
    async sendCode(phone: string, ttlSec: number): Promise<SendCodeResult> {
      const challengeId = generateChallengeId();
      const code = generateSmsCode();
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
      await challengeStore.set(challengeId, { phone, expiresAt, code });
      return {
        ok: true,
        challengeId,
        retryAfterSeconds: 60,
      };
    },

    async verifyCode(challengeId: string, code: string): Promise<VerifyCodeResult> {
      const stored = await challengeStore.get(challengeId);
      if (!stored) {
        return { ok: false, code: "expired_code" };
      }
      if (stored.expiresAt <= Math.floor(Date.now() / 1000)) {
        await challengeStore.delete(challengeId);
        return { ok: false, code: "expired_code" };
      }
      if (stored.code !== code) {
        return { ok: false, code: "invalid_code" };
      }
      await challengeStore.delete(challengeId);
      return { ok: true };
    },
  };
}
