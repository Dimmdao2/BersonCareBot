import { logger } from '@/app-layer/logging/logger';
import { dispatchOperatorAlert } from '@/modules/operator-alerts/dispatchOperatorAlert';
import { persistUndeliveredSupportSubmission } from './persistUndeliveredSupportSubmission';

/**
 * D-2 (night plan 2026-07-26): support forms (patient + guest) used to send to Telegram ONLY
 * (raw `env.ADMIN_TELEGRAM_ID`) and 503 without it. This is the replacement chokepoint both
 * routes call: delivery goes through `dispatchOperatorAlert`, the SAME multi-channel
 * (telegram/max/web_push/sms), config-driven ("support" block in `operator_health_alert_config`)
 * mechanism already built for operator health alerts (f5ecb6e78) — reused, not reinvented.
 * Because the channel set is a matter of configuration, removing Telegram later (E-1) changes
 * nothing here: whatever channels remain configured keep receiving submissions.
 *
 * If no channel confirms delivery, the submission is never silently dropped: it is persisted
 * (see `persistUndeliveredSupportSubmission`) so the operator can recover it later, and
 * `dispatchOperatorAlert`'s own empty-audience path already counts + alerts the failure itself
 * (content-free, by design — D-h) so the gap is visible without anyone polling a queue.
 */
export type RelaySupportSubmissionInput = {
  kind: 'patient' | 'guest';
  /** Unique per submission — becomes the operator-alert dedup key; must never collide across
   * distinct human messages (dedup is designed for repeated system alerts, not this). */
  messageId: string;
  lines: string[];
  email: string;
  message: string;
  userId?: string;
  fromPath?: string | null;
};

export type RelaySupportSubmissionResult = {
  /** A configured channel confirmed accepting the message. */
  delivered: boolean;
  /** Only meaningful when `delivered` is false: whether the content itself was preserved. */
  persisted: boolean;
};

export async function relaySupportSubmission(
  input: RelaySupportSubmissionInput,
): Promise<RelaySupportSubmissionResult> {
  let dispatched = false;
  try {
    const result = await dispatchOperatorAlert({
      block: 'support',
      topic: `support_submission_${input.kind}`,
      dedupKey: input.messageId,
      lines: input.lines,
      pushTitle: 'Обращение в поддержку',
    });
    dispatched = result.dispatched;
  } catch (err) {
    logger.error(
      { err, kind: input.kind, scope: 'support', event: 'support_submission_dispatch_threw' },
      '[support] dispatchOperatorAlert threw',
    );
  }

  if (dispatched) {
    return { delivered: true, persisted: false };
  }

  const persisted = await persistUndeliveredSupportSubmission({
    at: new Date().toISOString(),
    kind: input.kind,
    email: input.email,
    message: input.message,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.fromPath ? { fromPath: input.fromPath } : {}),
  });

  return { delivered: false, persisted };
}
