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

/** Маска номера для operational-логов (без полного E.164). */
function maskPhoneForOpsLog(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.length >= 4 ? digits.slice(-4) : "****";
  return phone.trim().startsWith("+") ? `+***${last4}` : `***${last4}`;
}

type OtpDeliveryOutcome = "success" | "delivery_failed" | "rate_limited";

function logPhoneOtpDeliveryEvent(payload: {
  channel: "sms" | "telegram" | "max" | "email";
  outcome: OtpDeliveryOutcome;
  phoneMask: string;
  httpStatus?: number;
}): void {
  console.info(
    JSON.stringify({
      event: "phone_otp_delivery",
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
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
        try {
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
          const phoneMask = maskPhoneForOpsLog(phone);
          if (!res.ok) {
            const rateLimited = res.status === 429;
            logPhoneOtpDeliveryEvent({
              channel: "sms",
              outcome: rateLimited ? "rate_limited" : "delivery_failed",
              phoneMask,
              httpStatus: res.status,
            });
            return {
              ok: false,
              code: rateLimited ? "rate_limited" : "delivery_failed",
              retryAfterSeconds: rateLimited ? 60 : undefined,
            };
          }
          if (!data.ok) {
            logPhoneOtpDeliveryEvent({
              channel: "sms",
              outcome: "delivery_failed",
              phoneMask,
              httpStatus: res.status,
            });
            return {
              ok: false,
              code: "delivery_failed",
              retryAfterSeconds: 60,
            };
          }
          await writeChallenge();
          await registerPhoneSend(phone);
          logPhoneOtpDeliveryEvent({ channel: "sms", outcome: "success", phoneMask, httpStatus: res.status });
          return {
            ok: true,
            challengeId,
            retryAfterSeconds: 60,
          };
        } catch {
          logPhoneOtpDeliveryEvent({
            channel: "sms",
            outcome: "delivery_failed",
            phoneMask: maskPhoneForOpsLog(phone),
          });
          return { ok: false, code: "delivery_failed" };
        }
      }

      if (deliveryChannel === "email") {
        const to = delivery?.channel === "email" ? delivery.email : "";
        if (!to) {
          return { ok: false, code: "invalid_phone" };
        }
        const sent = await sendEmailCodeViaIntegrator(to, code);
        const phoneMask = maskPhoneForOpsLog(phone);
        if (!sent.ok) {
          logPhoneOtpDeliveryEvent({ channel: "email", outcome: "delivery_failed", phoneMask });
          return { ok: false, code: "delivery_failed" };
        }
        await writeChallenge();
        await registerPhoneSend(phone);
        logPhoneOtpDeliveryEvent({ channel: "email", outcome: "success", phoneMask });
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
        try {
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
          const phoneMask = maskPhoneForOpsLog(phone);
          if (!res.ok) {
            const rateLimited = res.status === 429;
            logPhoneOtpDeliveryEvent({
              channel: deliveryChannel,
              outcome: rateLimited ? "rate_limited" : "delivery_failed",
              phoneMask,
              httpStatus: res.status,
            });
            return {
              ok: false,
              code: rateLimited ? "rate_limited" : "delivery_failed",
              retryAfterSeconds: rateLimited ? 60 : undefined,
            };
          }
          if (!data.ok) {
            logPhoneOtpDeliveryEvent({
              channel: deliveryChannel,
              outcome: "delivery_failed",
              phoneMask,
              httpStatus: res.status,
            });
            return {
              ok: false,
              code: "delivery_failed",
              retryAfterSeconds: 60,
            };
          }
          await writeChallenge();
          await registerPhoneSend(phone);
          logPhoneOtpDeliveryEvent({
            channel: deliveryChannel,
            outcome: "success",
            phoneMask,
            httpStatus: res.status,
          });
          return {
            ok: true,
            challengeId,
            retryAfterSeconds: 60,
          };
        } catch {
          logPhoneOtpDeliveryEvent({
            channel: deliveryChannel,
            outcome: "delivery_failed",
            phoneMask: maskPhoneForOpsLog(phone),
          });
          return { ok: false, code: "delivery_failed" };
        }
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
