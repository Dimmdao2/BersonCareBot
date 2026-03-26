import { randomBytes } from "node:crypto";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  assertPhoneCanStartChallenge,
  onPhoneWrongCode,
  registerPhoneSend,
} from "@/modules/auth/phoneOtpLimits";
import { generateSmsCode } from "@/modules/auth/smsCode";
import type { PhoneOtpDelivery, SendCodeResult, SmsPort, VerifyCodeResult } from "@/modules/auth/smsPort";

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

export type StubSmsAdapterDeps = {
  challengeStore: PhoneChallengeStore;
};

function deliveryChannelFromOpts(delivery?: PhoneOtpDelivery): "sms" | "telegram" | "max" | "email" {
  if (!delivery || delivery.channel === "sms") return "sms";
  if (delivery.channel === "telegram") return "telegram";
  if (delivery.channel === "max") return "max";
  return "email";
}

export function createStubSmsAdapter(deps: StubSmsAdapterDeps): SmsPort {
  const { challengeStore } = deps;
  return {
    async sendCode(phone: string, ttlSec: number, delivery?: PhoneOtpDelivery): Promise<SendCodeResult> {
      const gate = await assertPhoneCanStartChallenge(phone);
      if (gate.ok !== true) {
        return gate;
      }
      await challengeStore.deleteByPhone?.(phone);
      const challengeId = generateChallengeId();
      const code = generateSmsCode();
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSec;
      await challengeStore.set(challengeId, {
        phone,
        expiresAt,
        code,
        verifyAttempts: 0,
        deliveryChannel: deliveryChannelFromOpts(delivery),
      });
      await registerPhoneSend(phone);
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
