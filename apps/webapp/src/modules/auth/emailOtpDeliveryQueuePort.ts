/**
 * D27-C: the durable-queue seam `startEmailChallenge` enqueues an auth-code email through,
 * instead of awaiting the provider inside the public request. Kept separate from
 * `EmailAuthDbPort` (challenge storage) and `EmailSendPort` (the in-memory/no-DB test fallback,
 * which still sends synchronously) — a distinct concern gets its own port, not a widened one.
 *
 * D27-C fix round 2: the only input is the challenge id. Recipient, code, subject and idempotency
 * key are all derived DB-side from `public.email_challenges` (`app.email_auth_enqueue_otp_delivery`,
 * migration 0363) — this port never carries message content, so there is nothing here for a caller
 * to forge.
 */
export type EnqueueEmailOtpDeliveryInput = {
  challengeId: string;
};

export type EmailOtpDeliveryQueuePort = {
  enqueue: (input: EnqueueEmailOtpDeliveryInput) => Promise<void>;
};

let emailOtpDeliveryQueuePort: EmailOtpDeliveryQueuePort | undefined;

export function bindEmailOtpDeliveryQueuePort(port: EmailOtpDeliveryQueuePort): void {
  emailOtpDeliveryQueuePort = port;
}

function requireEmailOtpDeliveryQueuePort(): EmailOtpDeliveryQueuePort {
  if (!emailOtpDeliveryQueuePort) {
    throw new Error(
      'EmailOtpDeliveryQueuePort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.',
    );
  }
  return emailOtpDeliveryQueuePort;
}

export async function enqueueEmailOtpDelivery(input: EnqueueEmailOtpDeliveryInput): Promise<void> {
  return requireEmailOtpDeliveryQueuePort().enqueue(input);
}
