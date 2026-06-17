import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { createSmscClient } from './client.js';

describe('smsc client nock', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    // NOTE: ALLOW_DEV_SMS guard was retired in S15 — no NODE_ENV stub needed for that.
    // nock intercepts work regardless of NODE_ENV.
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
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
