/**
 * Email DeliveryAdapter — wires the integrator SMTP sink into the dispatchPort pipeline (PLAN S8).
 *
 * canHandle: intent.type === 'message.send' && channel === 'email'
 * send:      reads recipient.email, content.subject, content.text/html from the intent payload;
 *            resolves SMTP config via resolveSmtpOutboundConfig(db);
 *            calls sendMail with optional per-specialist fromOverride (PLAN N2 / §5b).
 *
 * N2 — fromOverride: when payload.fromOverride is present (per-specialist From set by S9+
 * call sites via UnifiedContent.fromOverride → messageToIntent → payload.fromOverride), the
 * adapter uses it as the envelope From. Otherwise falls back to the system SMTP fromAddress.
 *
 * Error: if SMTP is not configured, throws EMAIL_NOT_CONFIGURED so the worker's retry/log
 * can surface the misconfiguration without a silent no-op.
 */
import type { DbPort } from '../../kernel/contracts/index.js';
import type { DeliveryAdapter, DeliverySendResult, OutgoingIntent } from '../../kernel/contracts/index.js';
import { readChannel } from '../../infra/adapters/channelRouting.js';
import { resolveSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { sendMail } from './mailer.js';

type EmailDeliveryPayload = {
  recipient?: { email?: unknown };
  message?: { text?: unknown };
  html?: unknown;
  /** payload.subject: set by messageToIntent when UnifiedContent.subject is present (contract fix S9). */
  subject?: unknown;
  /** payload.title: legacy path — used when content.subject was not set (backwards compat). */
  title?: unknown;
  fromOverride?: unknown;
  delivery?: { channels?: unknown };
} & Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function createEmailDeliveryAdapter(deps: { getDb: () => DbPort }): DeliveryAdapter {
  return {
    canHandle(intent: OutgoingIntent): boolean {
      if (intent.type !== 'message.send') return false;
      return readChannel(intent) === 'email';
    },

    async send(intent: OutgoingIntent): Promise<DeliverySendResult> {
      if (intent.type !== 'message.send') return {};
      const payload = intent.payload as EmailDeliveryPayload;

      const to = asString(payload.recipient?.email);
      if (!to) {
        const err = new Error('EMAIL_PAYLOAD_INVALID: recipient.email is required');
        (err as { code?: number }).code = 400;
        throw err;
      }

      // content.subject maps to payload.subject (S9 contract fix); fall back to payload.title
      // for backward compat with call sites that predated the subject field, then a final fallback.
      const subject = asString(payload.subject) ?? asString(payload.title) ?? 'BersonCare';
      const text = asString(payload.message?.text);
      const html = asString(payload.html);

      // N2: per-specialist fromOverride > system SMTP from.
      const fromOverride = asString(payload.fromOverride);

      const db = deps.getDb();
      const smtpConfig = await resolveSmtpOutboundConfig(db);

      if (!smtpConfig.configured) {
        throw new Error('EMAIL_NOT_CONFIGURED');
      }

      await sendMail(smtpConfig, {
        to,
        subject,
        ...(text !== undefined ? { text } : {}),
        ...(html !== undefined ? { html } : {}),
        ...(fromOverride !== undefined ? { from: fromOverride } : {}),
      });

      return {};
    },
  };
}
