import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRubitimeReqSuccessIframeRoute } from './reqSuccessIframe.js';

describe('registerRubitimeReqSuccessIframeRoute', () => {
  it('returns empty body when record_success is missing', async () => {
    const app = Fastify();
    registerRubitimeReqSuccessIframeRoute(app, {
      eventGateway: {
        handleIncomingEvent: async () => ({ status: 'accepted_noop', dedupKey: 'k1', reason: 'NO_RECORD_ID' }),
      },
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
      eventGateway: {
        handleIncomingEvent: async (event) => ({ status: 'accepted', dedupKey: 'k2', event }),
      },
      onAcceptedEvent: async () => ({ showButton: true, recordId: 'rec-1' }),
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
      eventGateway: {
        handleIncomingEvent: async (event) => ({ status: 'accepted', dedupKey: 'k3', event }),
      },
      onAcceptedEvent: async () => ({ showButton: false, recordId: 'rec-1' }),
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
