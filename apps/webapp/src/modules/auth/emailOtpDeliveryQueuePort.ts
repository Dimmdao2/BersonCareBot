/**
 * D27-C: the durable-queue seam `startEmailChallenge` enqueues an auth-code email through,
 * instead of awaiting the provider inside the public request. Kept separate from
 * `EmailAuthDbPort` (challenge storage) and `EmailSendPort` (the in-memory/no-DB test fallback,
 * which still sends synchronously) — a distinct concern gets its own port, not a widened one.
 */
export type EnqueueEmailOtpDeliveryInput = {
  /** Idempotency key for `outgoing_delivery_queue.event_id` — one row per challenge issuance. */
  eventId: string;
  email: string;
  code: string;
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
