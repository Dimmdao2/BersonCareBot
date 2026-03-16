/**
 * Emits signed events to webapp POST /api/integrator/events.
 * Contract: webapp/INTEGRATOR_CONTRACT.md, verifyIntegratorSignature (timestamp.body, HMAC-SHA256 base64url).
 */
import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import type { WebappEventBody, WebappEventsPort } from '../../kernel/contracts/index.js';

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

export function createWebappEventsPort(): WebappEventsPort {
  const baseUrl = env.APP_BASE_URL ?? '';
  const secret = env.INTEGRATOR_SHARED_SECRET ?? '';

  return {
    async emit(event: WebappEventBody): Promise<{ ok: boolean; status: number; error?: string }> {
      if (!baseUrl || !secret) {
        return { ok: false, status: 0, error: 'APP_BASE_URL or INTEGRATOR_SHARED_SECRET not set' };
      }
      const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/events`;
      const body = JSON.stringify({
        eventType: event.eventType,
        ...(event.eventId && { eventId: event.eventId }),
        ...(event.occurredAt && { occurredAt: event.occurredAt }),
        ...(event.idempotencyKey && { idempotencyKey: event.idempotencyKey }),
        ...(event.payload && { payload: event.payload }),
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = sign(timestamp, body, secret);
      const idempotencyKey = event.idempotencyKey ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Bersoncare-Timestamp': timestamp,
        'X-Bersoncare-Signature': signature,
        'X-Bersoncare-Idempotency-Key': idempotencyKey,
      };
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
        });
        const ok = res.ok || res.status === 202;
        return { ok, status: res.status, ...(ok ? {} : { error: await res.text().catch(() => res.statusText) }) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, status: 0, error: message };
      }
    },
  };
}
