import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRubitimeReqSuccessIframeRoute } from './reqSuccessIframe.js';

describe('registerRubitimeReqSuccessIframeRoute', () => {
  it('returns empty body when record_success is missing', async () => {
    const app = Fastify();
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => null,
      findTelegramUserByPhone: async () => null,
      windowMinutes: 20,
      delayMinMs: 0,
      delayMaxMs: 0,
      ipLimitPerMin: 100,
      globalLimitPerMin: 1000,
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/rubitime' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
    await app.close();
  });

  it('returns button html when eligible', async () => {
    const app = Fastify();
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => ({
        rubitimeRecordId: 'rec-1',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: new Date(Date.now() - 1000),
        status: 'updated',
      }),
      findTelegramUserByPhone: async () => null,
      windowMinutes: 20,
      delayMinMs: 0,
      delayMaxMs: 0,
      ipLimitPerMin: 100,
      globalLimitPerMin: 1000,
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/rubitime?record_success=rec-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('t.me/bersoncarebot?start=rec-1');
    expect(res.body).toContain('tgbot_activate');
    await app.close();
  });

  it('returns empty body when linked user exists', async () => {
    const app = Fastify();
    registerRubitimeReqSuccessIframeRoute(app, {
      getRecordByRubitimeId: async () => ({
        rubitimeRecordId: 'rec-1',
        phoneNormalized: '+79990001122',
        payloadJson: {},
        recordAt: new Date(Date.now() - 1000),
        status: 'updated',
      }),
      findTelegramUserByPhone: async () => ({ chatId: 1, telegramId: '1', username: null }),
      windowMinutes: 20,
      delayMinMs: 0,
      delayMaxMs: 0,
      ipLimitPerMin: 100,
      globalLimitPerMin: 1000,
    });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/rubitime?record_success=rec-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
    await app.close();
  });
});
