import { randomUUID } from 'node:crypto';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import type { AuthEmailOtpReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { EnqueueEmailOtpDeliveryInput } from '@/modules/auth/emailOtpDeliveryQueuePort';
import { createPgOutgoingDeliveryQueueWritePort } from './pgOutgoingDeliveryQueue';

const queue = createPgOutgoingDeliveryQueueWritePort();

/** Ahead of every ordinary mailing/reminder priority (0) — see migration 0359. */
const AUTH_EMAIL_OTP_QUEUE_PRIORITY = 100;

/**
 * Short ladder (matches `inbound_reply` on the integrator side): a human is waiting right now,
 * but the code's own 30-minute TTL and resend button make a long tail pointless.
 */
const AUTH_EMAIL_OTP_MAX_ATTEMPTS = 4;

export async function enqueueAuthEmailOtpDelivery(
  input: EnqueueEmailOtpDeliveryInput,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const delivery: AuthEmailOtpReadyOutgoingDelivery = {
    organizationId: null,
    eventId: input.eventId,
    kind: 'auth_email_otp',
    channel: 'email',
    maxAttempts: AUTH_EMAIL_OTP_MAX_ATTEMPTS,
    nextRetryAt: nowIso,
    priority: AUTH_EMAIL_OTP_QUEUE_PRIORITY,
    intent: {
      type: 'message.send',
      meta: {
        // 'otp:' prefix — dispatchPort's sanitizePayloadForLogs redacts the code from
        // delivery_attempt_logs. Deliberately independent from the queue row's own eventId
        // (which is the challenge's idempotency key, not delivery-log-facing evidence).
        eventId: `otp:email:${randomUUID()}`,
        occurredAt: nowIso,
        source: 'email',
        outboundMessageClass: 'auth_code',
        outboundCapability: 'auth_code',
      },
      payload: {
        recipient: { email: input.email },
        message: { text: `Ваш код BersonCare: ${input.code}` },
        delivery: { channels: ['email'] },
        subject: 'Код подтверждения BersonCare',
      },
    },
  };
  await runDrizzleMutationTransaction((tx) => queue.enqueueReady(tx, delivery));
}
