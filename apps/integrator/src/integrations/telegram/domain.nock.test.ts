import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import fetch from 'node-fetch';

describe('telegram domain nock', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('blocks real network and allows mocked Bot API POST', async () => {
    nock('https://api.telegram.org')
      .post(/\/bot[^/]+\/sendMessage$/)
      .reply(200, {
        ok: true,
        result: {
          message_id: 1,
        },
      });

    const res = await fetch('https://api.telegram.org/bottest-token/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: 100, text: 'hello' }),
    });
    const json = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
    expect(json.ok).toBe(true);
    expect(json.result?.message_id).toBe(1);
  });
});
