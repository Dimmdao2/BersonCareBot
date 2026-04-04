import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRubitimeWebhookRoutes } from './webhook.js';

vi.mock('./client.js', () => ({
  fetchRubitimeRecordById: vi.fn(async () => ({ id: '42', phone: '+79990001122', email: 'u@example.com' })),
}));

vi.mock('../../infra/db/branchTimezone.js', () => ({
  createGetBranchTimezoneWithDataQuality: vi.fn(() => vi.fn(async () => 'Europe/Moscow')),
}));

vi.mock('../../infra/db/repos/integrationDataQualityIncidents.js', () => ({
  upsertIntegrationDataQualityIncident: vi.fn(async () => ({ occurrences: 2 })),
}));

describe('rubitime webhook routes', () => {
  it('POST /webhook/rubitime/:token returns 200 and emits gateway event', async () => {
    const handleIncomingEvent = vi.fn().mockResolvedValue({ status: 'accepted' });
    const webappEmit = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const app = Fastify();
    await registerRubitimeWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent },
      webappEventsPort: {
        emit: webappEmit,
        listSymptomTrackings: vi.fn(async () => ({ ok: true, trackings: [] })),
        listLfkComplexes: vi.fn(async () => ({ ok: true, complexes: [] })),
      },
      dispatchPort: { dispatchOutgoing: vi.fn().mockResolvedValue(undefined) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/rubitime/test-rubitime-webhook-token',
      payload: {
        from: 'user',
        event: 'event-create-record',
        data: { id: '42', phone: '+79990001122', email: 'u@example.com', record: '2026-03-10 12:30:00' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true });
    expect(handleIncomingEvent).toHaveBeenCalledTimes(1);
    expect(webappEmit).toHaveBeenCalledTimes(1);
  });

  it('GET /api/rubitime?record_success=... returns 200 and emits gateway event', async () => {
    const handleIncomingEvent = vi.fn().mockResolvedValue({ status: 'accepted' });
    const webappEmit = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const app = Fastify();
    await registerRubitimeWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent },
      webappEventsPort: {
        emit: webappEmit,
        listSymptomTrackings: vi.fn(async () => ({ ok: true, trackings: [] })),
        listLfkComplexes: vi.fn(async () => ({ ok: true, complexes: [] })),
      },
      dispatchPort: { dispatchOutgoing: vi.fn().mockResolvedValue(undefined) },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/rubitime?token=test-rubitime-webhook-token&record_success=42',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({ ok: true, source: 'record_success', recordId: '42' });
    expect(handleIncomingEvent).toHaveBeenCalledTimes(1);
  });
});
