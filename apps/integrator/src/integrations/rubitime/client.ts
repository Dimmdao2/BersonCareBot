import { getRubitimeApiKey } from './runtimeConfig.js';
import { withRubitimeApiThrottle } from './rubitimeApiThrottle.js';

/** Rubitime HTTP 200 + body error (still counts as a request on their side). */
function isRubitimeConsecutiveRequestLimitMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('consecutive requests') || m.includes('5 second');
}

type RubitimeApiEnvelope<TData> = {
  status?: string;
  message?: string;
  data?: TData;
};

export type RubitimeRecordPayload = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

/** Aligned with webapp booking M2M POST retry policy: 3 attempts, backoff ms. */
const RUBITIME_API_RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postRubitimeApi2(input: {
  method: 'get-record' | 'update-record' | 'remove-record' | 'create-record' | 'get-schedule';
  body: Record<string, unknown>;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<unknown> {
  const apiKey = (await getRubitimeApiKey()).trim();
  if (!apiKey) {
    throw new Error('RUBITIME_API_KEY_NOT_CONFIGURED');
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const url = `https://rubitime.ru/api2/${input.method}`;
  const bodyJson = JSON.stringify({ rk: apiKey, ...input.body });

  let lastHttpError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    let pack: { status: number; ok: boolean; raw: string };
    try {
      pack = await withRubitimeApiThrottle(async () => {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: bodyJson,
        });
        const raw = await response.text();
        return { status: response.status, ok: response.ok, raw };
      });
    } catch (e) {
      if (e instanceof TypeError && attempt < 2) {
        await sleep(RUBITIME_API_RETRY_BACKOFF_MS[attempt] ?? 2000);
        continue;
      }
      throw e;
    }

    if (!pack.ok) {
      lastHttpError = new Error(`RUBITIME_HTTP_${pack.status}: ${pack.raw.slice(0, 300)}`);
      if (pack.status >= 500 && attempt < 2) {
        await sleep(RUBITIME_API_RETRY_BACKOFF_MS[attempt] ?? 2000);
        continue;
      }
      throw lastHttpError;
    }

    const raw = pack.raw;

    let parsed: RubitimeApiEnvelope<unknown>;
    try {
      parsed = JSON.parse(raw) as RubitimeApiEnvelope<unknown>;
    } catch {
      throw new Error(`RUBITIME_INVALID_JSON: ${raw.slice(0, 300)}`);
    }

    if (parsed.status !== 'ok') {
      const apiMessage = typeof parsed.message === 'string' ? parsed.message : 'unknown error';
      if (isRubitimeConsecutiveRequestLimitMessage(apiMessage) && attempt < 2) {
        continue;
      }
      throw new Error(`RUBITIME_API_ERROR: ${apiMessage}`);
    }

    const data = asRecord(parsed.data);
    if (input.method === 'get-record') {
      if (!data) {
        throw new Error('RUBITIME_API_EMPTY_RECORD');
      }
      return data;
    }
    if (input.method === 'update-record' || input.method === 'remove-record' || input.method === 'create-record') {
      return data ?? {};
    }
    // get-schedule: data is an object keyed by date, not an array
    return parsed.data ?? {};
  }

  throw lastHttpError ?? new Error('RUBITIME_REQUEST_FAILED');
}

export async function fetchRubitimeRecordById(input: {
  recordId: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<RubitimeRecordPayload> {
  const id = input.recordId.trim();
  const numericId = Number(id);
  const req: Parameters<typeof postRubitimeApi2>[0] = {
    method: 'get-record',
    body: { id: Number.isFinite(numericId) ? numericId : id },
  };
  if (input.fetchImpl !== undefined) req.fetchImpl = input.fetchImpl;
  return postRubitimeApi2(req) as Promise<RubitimeRecordPayload>;
}

/** Rubitime API2 `update-record` — требуются `id` и `rk`; остальные поля по документации Rubitime. */
export async function updateRubitimeRecord(input: {
  recordId: string;
  data: Record<string, unknown>;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<RubitimeRecordPayload> {
  const id = input.recordId.trim();
  const numericId = Number(id);
  const req: Parameters<typeof postRubitimeApi2>[0] = {
    method: 'update-record',
    body: { id: Number.isFinite(numericId) ? numericId : id, ...input.data },
  };
  if (input.fetchImpl !== undefined) req.fetchImpl = input.fetchImpl;
  return postRubitimeApi2(req) as Promise<RubitimeRecordPayload>;
}

/** Rubitime API2 `remove-record` (отмена/удаление записи). */
export async function removeRubitimeRecord(input: {
  recordId: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<RubitimeRecordPayload> {
  const id = input.recordId.trim();
  const numericId = Number(id);
  const req: Parameters<typeof postRubitimeApi2>[0] = {
    method: 'remove-record',
    body: { id: Number.isFinite(numericId) ? numericId : id },
  };
  if (input.fetchImpl !== undefined) req.fetchImpl = input.fetchImpl;
  return postRubitimeApi2(req) as Promise<RubitimeRecordPayload>;
}

/** Rubitime API2 `create-record`. */
export async function createRubitimeRecord(input: {
  data: Record<string, unknown>;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<RubitimeRecordPayload> {
  const req: Parameters<typeof postRubitimeApi2>[0] = {
    method: 'create-record',
    body: { ...input.data },
  };
  if (input.fetchImpl !== undefined) req.fetchImpl = input.fetchImpl;
  return postRubitimeApi2(req) as Promise<RubitimeRecordPayload>;
}

export type RubitimeScheduleRequest = {
  branchId: number;
  cooperatorId: number;
  serviceId: number;
};

/**
 * Получает доступное расписание через Rubitime api2/get-schedule.
 * Возвращает сырой объект `data` из Rubitime envelope.
 * Форма: { "YYYY-MM-DD": { "HH:MM": { available: bool } } }
 * Парсинг и нормализацию выполняет scheduleNormalizer.ts.
 */
export async function fetchRubitimeSchedule(input: {
  params: RubitimeScheduleRequest;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<unknown> {
  const req: Parameters<typeof postRubitimeApi2>[0] = {
    method: 'get-schedule',
    body: {
      branch_id: input.params.branchId,
      cooperator_id: input.params.cooperatorId,
      service_id: input.params.serviceId,
      only_available: 1,
    },
  };
  if (input.fetchImpl !== undefined) req.fetchImpl = input.fetchImpl;
  return postRubitimeApi2(req);
}
