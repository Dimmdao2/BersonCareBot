import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRubitimeReqSuccessIframeRoute } from './reqSuccessIframe.js';

describe('GET /api/rubitime (iframe req success)', () => {
  const testRecordId = 'rec-test-5008';

  it('returns neutral html when record_success is missing', async () => {
    const app = Fastify({ logger: false });
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => null,
      findTelegramUserByPhone: async () => null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/rubitime',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('data-showbtn="false"');
  });

  it('returns html with button for fresh unlinked record', async () => {
    const app = Fastify({ logger: false });
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => ({
        rubitimeRecordId: testRecordId,
        phoneNormalized: '+79990000001',
        payloadJson: {},
        recordAt: new Date(),
        status: 'created',
      }),
      findTelegramUserByPhone: async () => null,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${testRecordId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data-showbtn="true"');
    expect(res.body).toContain(`t.me/bersoncarebot?start=${testRecordId}`);
  });

  it('returns neutral html when record is linked', async () => {
    const app = Fastify({ logger: false });
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => ({
        rubitimeRecordId: testRecordId,
        phoneNormalized: '+79990000001',
        payloadJson: {},
        recordAt: new Date(),
        status: 'created',
      }),
      findTelegramUserByPhone: async () => ({ chatId: 1, telegramId: '1', username: 'linked' }),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${testRecordId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data-showbtn="false"');
  });
});
