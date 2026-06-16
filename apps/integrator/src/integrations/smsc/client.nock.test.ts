import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { createSmscClient } from './client.js';

describe('smsc client nock', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    // Run as production so the dev-suppress guard does not interfere with nock HTTP intercepts
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    vi.unstubAllEnvs();
  });

  it('calls smsc provider endpoint and returns ok', async () => {
    nock('https://smsc.ru')
      .get('/sys/send.php')
      .query(true)
      .reply(200, { id: 123, cnt: 1 });

    const client = createSmscClient({
      apiKey: 'test-key',
      log: { warn: vi.fn(), error: vi.fn() },
    });

    const result = await client.sendSms({ toPhone: '+79990001122', message: 'hello' });
    expect(result).toEqual({ ok: true });
  });
});
