/* eslint-disable no-secrets/no-secrets -- test titles reference connector export names, not secrets */
import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerRubitimeWebhookRoutes } from './webhook.js';

const mockPrepare = vi.hoisted(() => vi.fn());
const mockSyncGcal = vi.hoisted(() => vi.fn());
const mockReportOperatorFailure = vi.hoisted(() => vi.fn());

vi.mock('./client.js', () => ({
  fetchRubitimeRecordById: vi.fn(async () => ({ id: '42', phone: '+79990001122', email: 'u@example.com' })),
}));

vi.mock('../../infra/db/branchTimezone.js', () => ({
  createGetBranchTimezoneWithDataQuality: vi.fn(() => vi.fn(async () => 'Europe/Moscow')),
}));

vi.mock('../../infra/db/repos/integrationDataQualityIncidents.js', () => ({
  upsertIntegrationDataQualityIncident: vi.fn(async () => ({ occurrences: 2 })),
}));

vi.mock('./ingestNormalization.js', () => ({
  prepareRubitimeWebhookIngress: mockPrepare,
}));

vi.mock('./connector.js', () => ({
  buildUserEmailAutobindWebappEvent: vi.fn(() => null),
  rubitimeIncomingToEvent: vi.fn(() => ({
    eventType: 'booking.rubitime',
    idempotencyKey: 'k',
    payload: { incoming: {} },
  })),
  syncRubitimeWebhookBodyToGoogleCalendar: mockSyncGcal,
}));

vi.mock('../../infra/operatorIncident/reportOperatorFailure.js', () => ({
  reportOperatorFailure: mockReportOperatorFailure,
}));

describe('rubitime webhook — Google Calendar failure → operator incident', () => {
  it('calls reportOperatorFailure when syncRubitimeWebhookBodyToGoogleCalendar rejects', async () => {
    mockPrepare.mockResolvedValue({
      recordId: 'rec-1',
      phone: '+79990001122',
      recordAt: '2026-04-08T08:00:00.000Z',
      statusCode: '0',
      record: {},
      cooperatorId: '20',
      action: 'created' as const,
      dateTimeEnd: '2026-04-08T09:00:00.000Z',
      timeNormalizationStatus: 'ok' as const,
    });
    mockSyncGcal.mockRejectedValue(new Error('GOOGLE_CALENDAR_HTTP_503'));
    mockReportOperatorFailure.mockResolvedValue(undefined);

    const handleIncomingEvent = vi.fn().mockResolvedValue({ status: 'accepted' });
    const app = Fastify();
    await registerRubitimeWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent },
      webappEventsPort: {
        emit: vi.fn().mockResolvedValue({ ok: true, status: 202 }),
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
    expect(mockReportOperatorFailure).toHaveBeenCalledTimes(1);
    expect(mockReportOperatorFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'outbound',
        integration: 'google_calendar',
      }),
    );
    expect(handleIncomingEvent).toHaveBeenCalledTimes(1);
  });
});
