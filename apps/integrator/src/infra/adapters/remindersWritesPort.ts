/**
 * Signed POST to webapp integrator reminder occurrence actions (snooze / skip).
 */
import { createHmac } from 'node:crypto';
import type { DbPort } from '../../kernel/contracts/index.js';
import type { RemindersWebappWritesPort } from '../../kernel/contracts/index.js';
import { getAppBaseUrl } from '../../config/appBaseUrl.js';
import { integratorWebhookSecret } from '../../config/env.js';

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

export function createRemindersWritesPort(deps: { db: DbPort }): RemindersWebappWritesPort {
  const { db } = deps;
  return {
    async postOccurrenceSnooze(input) {
      const baseUrl = await getAppBaseUrl(db);
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
      const baseUrl = await getAppBaseUrl(db);
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

    async postOccurrenceDone(input) {
      const baseUrl = await getAppBaseUrl(db);
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({
        integratorUserId: input.integratorUserId,
        occurrenceId: input.occurrenceId,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/reminders/occurrences/done`;
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
          doneAt?: string;
          error?: string;
        };
        if (!res.ok || data.ok !== true || typeof data.doneAt !== 'string') {
          return { ok: false, error: data.error ?? res.statusText };
        }
        return { ok: true, doneAt: data.doneAt };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },

    async postReminderMuteUntil(input) {
      const baseUrl = await getAppBaseUrl(db);
      const secret = integratorWebhookSecret();
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const body = JSON.stringify({
        integratorUserId: input.integratorUserId,
        mutedUntilIso: input.mutedUntilIso,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/reminders/mute`;
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
          error?: string;
        };
        if (!res.ok || data.ok !== true) {
          return { ok: false, error: data.error ?? res.statusText };
        }
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };
}
