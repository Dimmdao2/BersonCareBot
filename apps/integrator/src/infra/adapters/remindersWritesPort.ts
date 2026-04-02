/**
 * Signed POST to webapp integrator reminder occurrence actions (snooze / skip).
 */
import { createHmac } from 'node:crypto';
import type { RemindersWebappWritesPort } from '../../kernel/contracts/index.js';
import { env, integratorWebhookSecret } from '../../config/env.js';

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

export function createRemindersWritesPort(): RemindersWebappWritesPort {
  return {
    async postOccurrenceSnooze(input) {
      const baseUrl = env.APP_BASE_URL ?? '';
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({
        integratorUserId: input.integratorUserId,
        occurrenceId: input.occurrenceId,
        minutes: input.minutes,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/reminders/occurrences/snooze`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bersoncare-Timestamp': timestamp,
            'X-Bersoncare-Signature': signature,
          },
          body,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          snoozedUntil?: string;
          error?: string;
        };
        if (!res.ok || data.ok !== true || typeof data.snoozedUntil !== 'string') {
          return { ok: false, error: data.error ?? res.statusText };
        }
        return { ok: true, snoozedUntil: data.snoozedUntil };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },

    async postOccurrenceSkip(input) {
      const baseUrl = env.APP_BASE_URL ?? '';
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({
        integratorUserId: input.integratorUserId,
        occurrenceId: input.occurrenceId,
        reason: input.reason,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/reminders/occurrences/skip`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Bersoncare-Timestamp': timestamp,
            'X-Bersoncare-Signature': signature,
          },
          body,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          skippedAt?: string;
          error?: string;
        };
        if (!res.ok || data.ok !== true || typeof data.skippedAt !== 'string') {
          return { ok: false, error: data.error ?? res.statusText };
        }
        return { ok: true, skippedAt: data.skippedAt };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };
}
