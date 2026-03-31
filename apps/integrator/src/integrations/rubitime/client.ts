import { rubitimeConfig } from './config.js';

type RubitimeApiEnvelope<TData> = {
  status?: string;
  message?: string;
  data?: TData;
};

export type RubitimeRecordPayload = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

async function postRubitimeApi2(input: {
  method: 'get-record' | 'update-record' | 'remove-record' | 'create-record' | 'get-slots';
  body: Record<string, unknown>;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const url = `https://rubitime.ru/api2/${input.method}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rk: rubitimeConfig.apiKey, ...input.body }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`RUBITIME_HTTP_${response.status}: ${raw.slice(0, 300)}`);
  }

  let parsed: RubitimeApiEnvelope<unknown>;
  try {
    parsed = JSON.parse(raw) as RubitimeApiEnvelope<unknown>;
  } catch {
    throw new Error(`RUBITIME_INVALID_JSON: ${raw.slice(0, 300)}`);
  }

  if (parsed.status !== 'ok') {
    throw new Error(`RUBITIME_API_ERROR: ${parsed.message ?? 'unknown error'}`);
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
  return parsed.data ?? [];
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

export type RubitimeSlotsRequest = {
  type: 'in_person' | 'online';
  city?: string;
  category: 'rehab_lfk' | 'nutrition' | 'general';
  date?: string;
};

export async function fetchRubitimeSlots(input: {
  query: RubitimeSlotsRequest;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<unknown> {
  const req: Parameters<typeof postRubitimeApi2>[0] = {
    method: 'get-slots',
    body: {
      type: input.query.type,
      city: input.query.city,
      category: input.query.category,
      date: input.query.date,
    },
  };
  if (input.fetchImpl !== undefined) req.fetchImpl = input.fetchImpl;
  return postRubitimeApi2(req);
}
