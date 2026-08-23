/**
 * Delivery-only seam for phone OTP codes over SMS.
 *
 * Extracted from `integratorSmsAdapter` so a caller that owns its own challenge storage can still
 * send through the one signed integrator call, instead of growing a second copy of the HMAC/fetch/
 * ops-log logic. Exactly the shape `sendEmailCodeViaIntegrator` already has on the e-mail side:
 * "send this code to this address", nothing about challenges.
 *
 * `integratorSmsAdapter` (the login/messenger path) and the A-3 anonymous booking path both use it.
 */
import { createHash, createHmac } from 'node:crypto';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';

export type SmsCodeDeliveryResult =
  | { ok: true }
  | { ok: false; code: 'rate_limited' | 'delivery_failed'; retryAfterSeconds?: number };

export type IntegratorSmsDeliveryDeps = {
  integratorBaseUrl: string;
  sharedSecret: string;
};

export type PhoneOtpDeliveryChannel = 'sms' | 'telegram' | 'max' | 'email';
type OtpDeliveryOutcome = 'success' | 'delivery_failed' | 'rate_limited';

export function signIntegratorPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

/** Stable for a transport retry; a new OTP code (including explicit resend) gets a new key. */
export function otpDeliveryIdempotencyKey(
  channel: string,
  recipient: string,
  code: string,
): string {
  const digest = createHash('sha256').update(`${channel}:${recipient}:${code}`).digest('hex');
  return `otp:${channel}:${digest}`;
}

/** Маска номера для operational-логов (без полного E.164). */
export function maskPhoneForOpsLog(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : '****';
  return phone.trim().startsWith('+') ? `+***${last4}` : `***${last4}`;
}

export function logPhoneOtpDeliveryEvent(payload: {
  channel: PhoneOtpDeliveryChannel;
  outcome: OtpDeliveryOutcome;
  phoneMask: string;
  httpStatus?: number;
}): void {
  console.info(
    JSON.stringify({
      event: 'phone_otp_delivery',
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
}

/** POSTs the code to the integrator's send-sms endpoint. Performs no database work whatsoever. */
export async function deliverSmsCodeViaIntegrator(
  phone: string,
  code: string,
  deps: IntegratorSmsDeliveryDeps,
): Promise<SmsCodeDeliveryResult> {
  const url = `${deps.integratorBaseUrl.replace(/\/$/, '')}/api/bersoncare/send-sms`;
  const phoneMask = maskPhoneForOpsLog(phone);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    phone,
    code,
    idempotencyKey: otpDeliveryIdempotencyKey('sms', phone, code),
  });
  const signature = signIntegratorPayload(timestamp, body, deps.sharedSecret);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
        ...getCurrentCorrelationIdHeader(),
      },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok) {
      const rateLimited = res.status === 429;
      logPhoneOtpDeliveryEvent({
        channel: 'sms',
        outcome: rateLimited ? 'rate_limited' : 'delivery_failed',
        phoneMask,
        httpStatus: res.status,
      });
      return rateLimited
        ? { ok: false, code: 'rate_limited', retryAfterSeconds: 60 }
        : { ok: false, code: 'delivery_failed' };
    }
    if (!data.ok) {
      logPhoneOtpDeliveryEvent({
        channel: 'sms',
        outcome: 'delivery_failed',
        phoneMask,
        httpStatus: res.status,
      });
      return { ok: false, code: 'delivery_failed', retryAfterSeconds: 60 };
    }
    logPhoneOtpDeliveryEvent({
      channel: 'sms',
      outcome: 'success',
      phoneMask,
      httpStatus: res.status,
    });
    return { ok: true };
  } catch {
    logPhoneOtpDeliveryEvent({ channel: 'sms', outcome: 'delivery_failed', phoneMask });
    return { ok: false, code: 'delivery_failed' };
  }
}
