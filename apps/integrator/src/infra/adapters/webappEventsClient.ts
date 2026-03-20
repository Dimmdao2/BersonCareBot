/**
 * Emits signed events to webapp POST /api/integrator/events and reads diary lists via GET with M2M auth.
 * Contract: webapp/INTEGRATOR_CONTRACT.md; GET sign payload: timestamp.canonicalGet (canonicalGet = "GET pathname?query").
 */
import { createHash, createHmac } from 'node:crypto';
import { env, integratorWebhookSecret } from '../../config/env.js';
import type {
  WebappEventBody,
  WebappEventsPort,
  WebappLfkComplex,
  WebappSymptomTracking,
} from '../../kernel/contracts/index.js';

function sign(timestamp: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64url');
}

function signGet(timestamp: string, canonicalGet: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${canonicalGet}`).digest('base64url');
}

async function fetchSignedGet<T>(input: {
  baseUrl: string;
  path: string;
  query: Record<string, string>;
  secret: string;
  parseResponse: (data: { ok?: boolean; [k: string]: unknown }) => T;
}): Promise<T & { ok: boolean; error?: string }> {
  const pathname = input.path;
  const search = new URLSearchParams(input.query).toString();
  const url = `${input.baseUrl.replace(/\/$/, '')}${pathname}${search ? `?${search}` : ''}`;
  const canonicalGet = `GET ${pathname}${search ? `?${search}` : ''}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signGet(timestamp, canonicalGet, input.secret);
  const headers: Record<string, string> = {
    'X-Bersoncare-Timestamp': timestamp,
    'X-Bersoncare-Signature': signature,
  };
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; [k: string]: unknown };
    const parsed = input.parseResponse(data);
    if (!res.ok) {
      return { ...parsed, ok: false, error: data.error ?? res.statusText };
    }
    return { ...parsed, ok: data.ok === true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message } as T & { ok: boolean; error?: string };
  }
}

export function createWebappEventsPort(): WebappEventsPort {
  const baseUrl = env.APP_BASE_URL ?? '';
  const secret = integratorWebhookSecret();

  return {
    async emit(event: WebappEventBody): Promise<{ ok: boolean; status: number; error?: string }> {
      if (!baseUrl || !secret) {
        return { ok: false, status: 0, error: 'APP_BASE_URL or webhook secret not set' };
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
      const idempotencyKey = event.idempotencyKey ?? `evt-fallback:${event.eventType}:${createHash('sha256').update(body).digest('hex').slice(0, 24)}`;
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

    async listSymptomTrackings(userId: string): Promise<{
      ok: boolean;
      trackings?: WebappSymptomTracking[];
      error?: string;
    }> {
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const result = await fetchSignedGet<{ trackings?: WebappSymptomTracking[] }>({
        baseUrl,
        path: '/api/integrator/diary/symptom-trackings',
        query: { userId },
        secret,
        parseResponse: (data) => ({
          trackings: Array.isArray(data.trackings) ? (data.trackings as WebappSymptomTracking[]) : [],
        }),
      });
      return result.ok
        ? { ok: true, trackings: result.trackings ?? [] }
        : { ok: false, error: result.error ?? 'request failed' };
    },

    async listLfkComplexes(userId: string): Promise<{
      ok: boolean;
      complexes?: WebappLfkComplex[];
      error?: string;
    }> {
      if (!baseUrl || !secret) {
        return { ok: false, error: 'APP_BASE_URL or webhook secret not set' };
      }
      const result = await fetchSignedGet<{ complexes?: WebappLfkComplex[] }>({
        baseUrl,
        path: '/api/integrator/diary/lfk-complexes',
        query: { userId },
        secret,
        parseResponse: (data) => ({
          complexes: Array.isArray(data.complexes) ? (data.complexes as WebappLfkComplex[]) : [],
        }),
      });
      return result.ok
        ? { ok: true, complexes: result.complexes ?? [] }
        : { ok: false, error: result.error ?? 'request failed' };
    },
  };
}
