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

export async function fetchRubitimeRecordById(input: {
  recordId: string;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<RubitimeRecordPayload> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl('https://rubitime.ru/api2/get-record', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      rk: rubitimeConfig.apiKey,
      id: input.recordId,
    }),
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
  if (!data) {
    throw new Error('RUBITIME_API_EMPTY_RECORD');
  }

  return data;
}
