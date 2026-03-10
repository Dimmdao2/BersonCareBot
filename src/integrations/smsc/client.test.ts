/* global RequestInit */
import { describe, expect, it, vi } from 'vitest';
import { createSmscClient } from './client.js';

function createLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('createSmscClient', () => {
  it('sends utf-8 json requests to smsc', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ id: 123, cnt: 1 }),
    });
    const log = createLogger();
    const client = createSmscClient({
      apiKey: 'test-key',
      baseUrl: 'https://smsc.ru/sys/send.php',
      log,
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });

    const result = await client.sendSms({ toPhone: '+79990001122', message: 'Привет' });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('apikey')).toBe('test-key');
    expect(parsed.searchParams.get('phones')).toBe('+79990001122');
    expect(parsed.searchParams.get('mes')).toBe('Привет');
    expect(parsed.searchParams.get('charset')).toBe('utf-8');
    expect(parsed.searchParams.get('fmt')).toBe('3');
    expect(options.method).toBe('GET');
  });

  it('returns provider errors from smsc json response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ error: 'invalid sender', error_code: 7 }),
    });
    const client = createSmscClient({
      apiKey: 'test-key',
      log: createLogger(),
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
    });

    const result = await client.sendSms({ toPhone: '+79990001122', message: 'test' });

    expect(result).toEqual({ ok: false, error: 'invalid sender (code: 7)' });
  });
});
