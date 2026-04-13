import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockFetchRubitimeRecordById = vi.hoisted(() => vi.fn());
const mockPrepareRubitimeWebhookIngress = vi.hoisted(() => vi.fn());
const mockSyncRubitimeWebhookBodyToGoogleCalendar = vi.hoisted(() => vi.fn());
const mockBuildUserEmailAutobindWebappEvent = vi.hoisted(() => vi.fn());

vi.mock('./client.js', () => ({
  fetchRubitimeRecordById: mockFetchRubitimeRecordById,
}));

vi.mock('./ingestNormalization.js', () => ({
  prepareRubitimeWebhookIngress: mockPrepareRubitimeWebhookIngress,
}));

vi.mock('./connector.js', () => ({
  syncRubitimeWebhookBodyToGoogleCalendar: mockSyncRubitimeWebhookBodyToGoogleCalendar,
  buildUserEmailAutobindWebappEvent: mockBuildUserEmailAutobindWebappEvent,
}));

vi.mock('../../infra/db/client.js', () => ({
  createDbPort: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));

vi.mock('../../infra/db/branchTimezone.js', () => ({
  createGetBranchTimezoneWithDataQuality: () => async () => 'Europe/Moscow',
}));

import {
  RUBITIME_POST_CREATE_GET_RECORD_RETRY_MS,
  runPostCreateProjection,
} from './postCreateProjection.js';

const RECORD_ID = 'rec-42';

function makeIncoming(overrides: Record<string, unknown> = {}) {
  return {
    entity: 'record' as const,
    action: 'created' as const,
    recordId: RECORD_ID,
    phone: '+79990001122',
    recordAt: '2026-04-08T08:00:00.000Z',
    statusCode: '0',
    record: { id: 42, phone: '+79990001122' },
    cooperatorId: '20',
    dateTimeEnd: '2026-04-08T09:00:00.000Z',
    timeNormalizationStatus: 'ok' as const,
    ...overrides,
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    dispatchPort: { dispatchOutgoing: vi.fn().mockResolvedValue(undefined) },
    dbWritePort: { writeDb: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

describe('runPostCreateProjection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetchRubitimeRecordById.mockResolvedValue({ id: 42, phone: '+79990001122', record: '2026-04-08 11:00:00' });
    mockPrepareRubitimeWebhookIngress.mockResolvedValue(makeIncoming());
    mockSyncRubitimeWebhookBodyToGoogleCalendar.mockResolvedValue('gcal-123');
    mockBuildUserEmailAutobindWebappEvent.mockReturnValue(null);
  });

  it('happy path: fetch + normalize + gcal + upsert all succeed', async () => {
    const deps = makeDeps();
    const result = await runPostCreateProjection(RECORD_ID, deps);

    expect(result.projectionOk).toBe(true);
    expect(result.gcalEventId).toBe('gcal-123');
    expect(mockFetchRubitimeRecordById).toHaveBeenCalledWith({ recordId: RECORD_ID });
    expect(mockPrepareRubitimeWebhookIngress).toHaveBeenCalledTimes(1);
    expect(mockSyncRubitimeWebhookBodyToGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(deps.dbWritePort.writeDb).toHaveBeenCalledTimes(1);
    const upsertCall = deps.dbWritePort.writeDb.mock.calls[0]![0];
    expect(upsertCall.type).toBe('booking.upsert');
    expect(upsertCall.params.externalRecordId).toBe(RECORD_ID);
    expect(upsertCall.params.status).toBe('created');
    expect(upsertCall.params.gcalEventId).toBe('gcal-123');
  });

  it('fetch failure after retry returns projectionOk=false', async () => {
    vi.useFakeTimers();
    try {
      mockFetchRubitimeRecordById.mockClear();
      mockFetchRubitimeRecordById.mockRejectedValue(new Error('RUBITIME_API_ERROR'));
      const deps = makeDeps();
      const promise = runPostCreateProjection(RECORD_ID, deps);
      await vi.advanceTimersByTimeAsync(RUBITIME_POST_CREATE_GET_RECORD_RETRY_MS);
      const result = await promise;

      expect(result.projectionOk).toBe(false);
      expect(result.error).toBe('fetch_failed');
      expect(mockFetchRubitimeRecordById).toHaveBeenCalledTimes(2);
      expect(deps.dbWritePort.writeDb).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gcal failure is non-fatal: writeDb still called', async () => {
    mockSyncRubitimeWebhookBodyToGoogleCalendar.mockRejectedValue(new Error('gcal_unavailable'));
    const deps = makeDeps();
    const result = await runPostCreateProjection(RECORD_ID, deps);

    expect(result.projectionOk).toBe(true);
    expect(result.gcalEventId).toBeNull();
    expect(deps.dbWritePort.writeDb).toHaveBeenCalledTimes(1);
    const upsertCall = deps.dbWritePort.writeDb.mock.calls[0]![0];
    expect(upsertCall.params.gcalEventId).toBeUndefined();
  });

  it('writeDb failure returns projectionOk=false with upsert_failed', async () => {
    const deps = makeDeps();
    deps.dbWritePort.writeDb.mockRejectedValue(new Error('db_error'));
    const result = await runPostCreateProjection(RECORD_ID, deps);

    expect(result.projectionOk).toBe(false);
    expect(result.error).toBe('upsert_failed');
    expect(result.gcalEventId).toBe('gcal-123');
  });

  it('booking.upsert params match expected shape from incoming', async () => {
    const incoming = makeIncoming({
      cooperatorId: '55',
      timeNormalizationStatus: 'degraded',
      timeNormalizationFieldErrors: [{ field: 'recordAt', reason: 'naive' }],
    });
    mockPrepareRubitimeWebhookIngress.mockResolvedValue(incoming);
    const deps = makeDeps();

    await runPostCreateProjection(RECORD_ID, deps);

    const params = deps.dbWritePort.writeDb.mock.calls[0]![0].params;
    expect(params.externalRecordId).toBe(RECORD_ID);
    expect(params.phoneNormalized).toBe('+79990001122');
    expect(params.recordAt).toBe('2026-04-08T08:00:00.000Z');
    expect(params.status).toBe('created');
    expect(params.lastEvent).toBe('created');
    expect(params.rubitimeCooperatorId).toBe('55');
    expect(params.dateTimeEnd).toBe('2026-04-08T09:00:00.000Z');
    expect(params.timeNormalizationStatus).toBe('degraded');
    expect(params.timeNormalizationFieldErrors).toEqual([{ field: 'recordAt', reason: 'naive' }]);
  });

  it('email autobind: called when webappEventsPort provided', async () => {
    const autobindEvent = { eventType: 'user.email.autobind', idempotencyKey: 'key', payload: {} };
    mockBuildUserEmailAutobindWebappEvent.mockReturnValue(autobindEvent);
    const emit = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const deps = makeDeps({ webappEventsPort: { emit, listSymptomTrackings: vi.fn() } });

    await runPostCreateProjection(RECORD_ID, deps);

    expect(emit).toHaveBeenCalledWith(autobindEvent);
  });

  it('email autobind: emit skipped when webappEventsPort not provided', async () => {
    mockBuildUserEmailAutobindWebappEvent.mockClear();
    const autobindEvent = { eventType: 'user.email.autobind', idempotencyKey: 'key', payload: {} };
    mockBuildUserEmailAutobindWebappEvent.mockReturnValue(autobindEvent);
    const deps = makeDeps();

    await runPostCreateProjection(RECORD_ID, deps);

    const calls = mockBuildUserEmailAutobindWebappEvent.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown> | undefined)?.from === 'webapp',
    );
    expect(calls).toHaveLength(0);
  });
});
