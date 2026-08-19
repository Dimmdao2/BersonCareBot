import { createHmac } from 'node:crypto';
import { after } from 'next/server';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import {
  getIntegratorApiUrl,
  getIntegratorWebhookSecret,
} from '@/modules/system-settings/integrationRuntime';
import type { BookingSyncPort } from '@/modules/patient-booking/ports';

async function normalizeBaseUrl(): Promise<string | null> {
  const base = (await getIntegratorApiUrl()).trim();
  if (!base) return null;
  return base.replace(/\/$/, '');
}

async function postSigned(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const base = await normalizeBaseUrl();
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!base || !secret) {
    throw new Error('integrator_not_configured');
  }
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('base64url');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bersoncare-Timestamp': timestamp,
      'X-Bersoncare-Signature': signature,
      ...getCurrentCorrelationIdHeader(),
    },
    body: raw,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const POST_SIGNED_RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryablePostSignedFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

async function postSignedWithRetry(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await postSigned(path, body);
      if (result.status >= 400 && result.status < 500) {
        return result;
      }
      if (result.status >= 500) {
        lastError = new Error(`integrator_http_${result.status}`);
        if (attempt < 2) {
          await sleep(POST_SIGNED_RETRY_BACKOFF_MS[attempt] ?? 2000);
          continue;
        }
        return result;
      }
      return result;
    } catch (e) {
      lastError = e;
      if (isRetryablePostSignedFailure(e) && attempt < 2) {
        await sleep(POST_SIGNED_RETRY_BACKOFF_MS[attempt] ?? 2000);
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('integrator_request_failed');
}

function integratorErrorCode(json: Record<string, unknown>): string {
  const err = json.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  ) {
    return (err as { code: string }).code.trim();
  }
  return 'booking_lifecycle_event_failed';
}

/** Отправка события интегратору: подписанный POST + существующая лестница повторов. */
async function deliverBookingLifecycleEvent(input: {
  eventType: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { status, json } = await postSignedWithRetry('/api/bersoncare/booking/lifecycle-event', {
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  });
  if (status >= 400 || json.ok !== true) {
    throw new Error(integratorErrorCode(json));
  }
}

/**
 * Отложить работу за пределы ответа человеку. Внутри запроса это `after()` Next (тот же приём уже
 * стоит в `api/auth/phone/start`); вне запроса — cron-скрипты, воркеры, тесты — `after()` бросает,
 * и тогда работа выполняется НА МЕСТЕ, то есть поведение вне запроса не меняется вовсе.
 */
export type DeferOutsideResponse = (work: () => Promise<void>) => Promise<void>;

const deferWithNextAfter: DeferOutsideResponse = async (work) => {
  try {
    after(work);
  } catch {
    await work();
  }
};

export function createBookingSyncPort(options?: { defer?: DeferOutsideResponse }): BookingSyncPort {
  const defer = options?.defer ?? deferWithNextAfter;
  return {
    async emitBookingEvent(input): Promise<void> {
      const event = {
        eventType: input.eventType,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as unknown as Record<string, unknown>,
      };
      if (input.waitForDelivery === true) {
        await deliverBookingLifecycleEvent(event);
        return;
      }
      // Человек уже получил ответ; отказ отправки ниже НЕ проглатывается пустым `catch {}`, как
      // раньше на каждом вызывающем, а называется в журнале своим именем и с ключом события —
      // иначе трёхсекундное ожидание отказа было ещё и невидимым.
      await defer(async () => {
        try {
          await deliverBookingLifecycleEvent(event);
        } catch (err) {
          console.error('[booking-lifecycle] deferred integrator event failed', {
            event: 'booking_lifecycle_emit_failed',
            eventType: event.eventType,
            idempotencyKey: event.idempotencyKey,
            err,
          });
        }
      });
    },
  };
}
