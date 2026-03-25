import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import { getMaxBotInfo } from './client.js';

describe('max client nock', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('reaches MAX API host for bot info request', async () => {
    const baseUrl = 'https://max-api.example';
    const scope = nock(baseUrl).get(/.*/).reply(200, {
      user_id: 1,
      first_name: 'Bot',
      is_bot: true,
    });

    const result = await getMaxBotInfo({ apiKey: 'k', baseUrl });
    expect(scope.isDone()).toBe(true);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
