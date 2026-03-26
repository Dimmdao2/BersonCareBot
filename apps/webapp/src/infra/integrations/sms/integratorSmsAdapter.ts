/**
 * Адаптер SmsPort: отправка кода через интегратор (SMS / send-email / send-otp).
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
import type { PhoneOtpDelivery, SendCodeResult, SmsPort, VerifyCodeResult } from "@/modules/auth/smsPort";
import { sendEmailCodeViaIntegrator } from "@/infra/integrations/email/integratorEmailAdapter";

function generateChallengeId(): string {
  return randomBytes(16).toString("base64url");
}

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

function resolveDeliveryChannel(delivery?: PhoneOtpDelivery): "sms" | "telegram" | "max" | "email" {
  return delivery?.channel ?? "sms";
}

export type IntegratorSmsAdapterDeps = {
  challengeStore: PhoneChallengeStore;
  integratorBaseUrl: string;
  sharedSecret: string;
};

export function createIntegratorSmsAdapter(deps: IntegratorSmsAdapterDeps): SmsPort {
  const { challengeStore, integratorBaseUrl, sharedSecret } = deps;
  const base = integratorBaseUrl.replace(/\/$/, "");
  const sendSmsUrl = `${base}/api/bersoncare/send-sms`;
  const sendOtpUrl = `${base}/api/bersoncare/send-otp`;

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
      const deliveryChannel = resolveDeliveryChannel(delivery);

      const writeChallenge = async () => {
        await challengeStore.set(challengeId, {
          phone,
          expiresAt,
          code,
          verifyAttempts: 0,
          deliveryChannel,
        });
      };

      const timestamp = String(Math.floor(Date.now() / 1000));

      if (deliveryChannel === "sms") {
        const body = JSON.stringify({ phone, code });
        const signature = signPayload(timestamp, body, sharedSecret);
        const res = await fetch(sendSmsUrl, {
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
        await writeChallenge();
        await registerPhoneSend(phone);
        return {
          ok: true,
          challengeId,
          retryAfterSeconds: 60,
        };
      }

      if (deliveryChannel === "email") {
        const to = delivery?.channel === "email" ? delivery.email : "";
        if (!to) {
          return { ok: false, code: "invalid_phone" };
        }
        const sent = await sendEmailCodeViaIntegrator(to, code);
        if (!sent.ok) {
          return { ok: false, code: "invalid_phone" };
        }
        await writeChallenge();
        await registerPhoneSend(phone);
        return {
          ok: true,
          challengeId,
          retryAfterSeconds: 60,
        };
      }

      if (deliveryChannel === "telegram" || deliveryChannel === "max") {
        const recipientId =
          delivery?.channel === "telegram" || delivery?.channel === "max" ? delivery.recipientId : "";
        if (!recipientId) {
          return { ok: false, code: "invalid_phone" };
        }
        const body = JSON.stringify({
          channel: deliveryChannel,
          recipientId,
          code,
        });
        const signature = signPayload(timestamp, body, sharedSecret);
        const res = await fetch(sendOtpUrl, {
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
        await writeChallenge();
        await registerPhoneSend(phone);
        return {
          ok: true,
          challengeId,
          retryAfterSeconds: 60,
        };
      }

      return { ok: false, code: "invalid_phone" };
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
