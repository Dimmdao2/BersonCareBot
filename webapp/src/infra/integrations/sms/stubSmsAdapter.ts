import { randomBytes } from "node:crypto";
import type { SendCodeResult, SmsPort, VerifyCodeResult } from "@/modules/auth/smsPort";

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 min
const STUB_ACCEPT_CODE = "123456";

type StoredChallenge = {
  phone: string;
  code: string;
  expiresAt: number;
};

const challenges = new Map<string, StoredChallenge>();

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, c] of challenges.entries()) {
    if (c.expiresAt <= now) challenges.delete(id);
  }
}

export function createStubSmsAdapter(): SmsPort {
  return {
    async sendCode(phone: string): Promise<SendCodeResult> {
      cleanupExpired();
      const challengeId = generateChallengeId();
      const code = STUB_ACCEPT_CODE;
      challenges.set(challengeId, {
        phone,
        code,
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      });
      return {
        ok: true,
        challengeId,
        retryAfterSeconds: 60,
      };
    },

    async verifyCode(challengeId: string, code: string): Promise<VerifyCodeResult> {
      cleanupExpired();
      const stored = challenges.get(challengeId);
      if (!stored) {
        return { ok: false, code: "expired_code" };
      }
      if (stored.expiresAt <= Date.now()) {
        challenges.delete(challengeId);
        return { ok: false, code: "expired_code" };
      }
      if (stored.code !== code) {
        return { ok: false, code: "invalid_code" };
      }
      challenges.delete(challengeId);
      return { ok: true };
    },
  };
}
