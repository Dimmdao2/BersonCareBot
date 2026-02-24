import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRubitimeReqSuccessIframeRoute } from './reqSuccessIframe.js';

describe('GET /api/rubitime (iframe req success)', () => {
  const testRecordId = 'rec-test-5008';
  const baseDeps = {
    windowMinutes: 20,
    delayMinMs: 0,
    delayMaxMs: 0,
    ipLimitPerMin: 5,
    globalLimitPerMin: 1000,
  };

  it('returns neutral html when record_success is missing', async () => {
    const app = Fastify({ logger: false });
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => null,
      findTelegramUserByPhone: async () => null,
      ...baseDeps,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/rubitime',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toBe('');
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
      ...baseDeps,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${testRecordId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="success_info_container"');
    expect(res.body).toContain('id="tgbot_activate"');
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
      ...baseDeps,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${testRecordId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
  });

  it('returns neutral html when ip limit is exceeded', async () => {
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
      ...baseDeps,
      ipLimitPerMin: 1,
    });

    const first = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${testRecordId}`,
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    const second = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${testRecordId}`,
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    expect(first.statusCode).toBe(200);
    expect(first.body).toContain('id="success_info_container"');
    expect(second.statusCode).toBe(200);
    expect(second.body).toBe('');
  });
});
