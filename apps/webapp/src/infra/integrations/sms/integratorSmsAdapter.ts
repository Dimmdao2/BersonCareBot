/**
 * Адаптер SmsPort: отправка кода через интегратор (POST /api/bersoncare/send-sms).
 * Код генерируется в вебапп, сохраняется в challengeStore; проверка кода — только в вебапп.
 */
import { createHmac } from "node:crypto";
import { randomBytes } from "node:crypto";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  assertPhoneCanStartChallenge,
  onPhoneWrongCode,
  registerPhoneSend,
} from "@/modules/auth/phoneOtpLimits";
import { generateSmsCode } from "@/modules/auth/smsCode";
import type { SendCodeResult, SmsPort, VerifyCodeResult } from "@/modules/auth/smsPort";

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

export type IntegratorSmsAdapterDeps = {
  challengeStore: PhoneChallengeStore;
  integratorBaseUrl: string;
  sharedSecret: string;
};

export function createIntegratorSmsAdapter(deps: IntegratorSmsAdapterDeps): SmsPort {
  const { challengeStore, integratorBaseUrl, sharedSecret } = deps;
  const url = `${integratorBaseUrl.replace(/\/$/, "")}/api/bersoncare/send-sms`;

  return {
    async sendCode(phone: string, ttlSec: number): Promise<SendCodeResult> {
      const gate = await assertPhoneCanStartChallenge(phone);
      if (gate.ok !== true) {
        return gate;
      }

      await challengeStore.deleteByPhone?.(phone);

      const challengeId = generateChallengeId();
      const code = generateSmsCode();
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
      await challengeStore.set(challengeId, { phone, expiresAt, code, verifyAttempts: 0 });
      await registerPhoneSend(phone);

      const body = JSON.stringify({ phone, code });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = signPayload(timestamp, body, sharedSecret);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bersoncare-Timestamp": timestamp,
          "X-Bersoncare-Signature": signature,
        },
        body,
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        const rateLimited = res.status === 429;
        return {
          ok: false,
          code: rateLimited ? "rate_limited" : "invalid_phone",
          retryAfterSeconds: rateLimited ? 60 : undefined,
        };
      }
      if (!data.ok) {
        return {
          ok: false,
          code: "invalid_phone",
          retryAfterSeconds: 60,
        };
      }
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
        return onPhoneWrongCode(stored.phone, challengeId, challengeStore);
      }
      await challengeStore.delete(challengeId);
      return { ok: true };
    },
  };
}
