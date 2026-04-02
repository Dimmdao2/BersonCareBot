import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, WebappEventsPort } from '../../../kernel/contracts/index.js';
import { runProjectionWorkerTick } from './projectionWorker.js';

vi.mock('../../db/repos/projectionOutbox.js', () => ({
  claimDueProjectionEvents: vi.fn(),
  completeProjectionEvent: vi.fn(),
  failProjectionEvent: vi.fn(),
  rescheduleProjectionEvent: vi.fn(),
}));

import {
  claimDueProjectionEvents,
  completeProjectionEvent,
  failProjectionEvent,
  rescheduleProjectionEvent,
} from '../../db/repos/projectionOutbox.js';

const mockClaim = claimDueProjectionEvents as ReturnType<typeof vi.fn>;
const mockComplete = completeProjectionEvent as ReturnType<typeof vi.fn>;
const mockFail = failProjectionEvent as ReturnType<typeof vi.fn>;
const mockReschedule = rescheduleProjectionEvent as ReturnType<typeof vi.fn>;

function fakeDb(): DbPort {
  return { query: vi.fn() as unknown as DbPort['query'], tx: vi.fn() as unknown as DbPort['tx'] };
}

function fakeWebappPort(ok: boolean, error?: string): WebappEventsPort {
  return {
    emit: vi.fn().mockResolvedValue({ ok, status: ok ? 202 : 503, error }),
    listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
    listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
  };
}

const BASE_EVENT = {
  id: 1,
  eventType: 'user.upserted',
  idempotencyKey: 'key-1',
  occurredAt: '2026-01-01T00:00:00Z',
  payload: {},
  attemptsDone: 0,
  maxAttempts: 3,
};

describe('runProjectionWorkerTick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes event on successful emit', async () => {
    const db = fakeDb();
    const port = fakeWebappPort(true);
    mockClaim.mockResolvedValueOnce([{ ...BASE_EVENT }]);

    const processed = await runProjectionWorkerTick(db, port, 10);

    expect(processed).toBe(1);
    expect(mockComplete).toHaveBeenCalledWith(db, 1);
    expect(mockFail).not.toHaveBeenCalled();
  });

  it('reschedules event on failed emit when attempts remain', async () => {
    const db = fakeDb();
    const port = fakeWebappPort(false, 'service unavailable');
    mockClaim.mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 0 }]);

    await runProjectionWorkerTick(db, port, 10);

    expect(mockReschedule).toHaveBeenCalledWith(db, 1, 1, 30);
    expect(mockFail).not.toHaveBeenCalled();
  });

  it('moves event to DLQ when max attempts exceeded', async () => {
    const db = fakeDb();
    const port = fakeWebappPort(false, 'error');
    mockClaim.mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 2, maxAttempts: 3 }]);

    await runProjectionWorkerTick(db, port, 10);

    expect(mockFail).toHaveBeenCalledWith(db, 1, 'error');
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('moves event to DLQ immediately on non-recoverable emit (e.g. HTTP 422)', async () => {
    const db = fakeDb();
    const port: WebappEventsPort = {
      emit: vi.fn().mockResolvedValue({ ok: false, status: 422, error: 'validation' }),
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    mockClaim.mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 0, maxAttempts: 5 }]);

    await runProjectionWorkerTick(db, port, 10);

    expect(mockFail).toHaveBeenCalledWith(db, 1, 'validation');
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('caps exponential backoff delay', async () => {
    const db = fakeDb();
    const port = fakeWebappPort(false, 'unavailable');
    mockClaim.mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 9, maxAttempts: 12 }]);

    await runProjectionWorkerTick(db, port, 10);

    expect(mockReschedule).toHaveBeenCalledWith(db, 1, 10, 3600);
  });

  it('handles emit exception with retry', async () => {
    const db = fakeDb();
    const port: WebappEventsPort = {
      emit: vi.fn().mockRejectedValue(new Error('network down')),
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    mockClaim.mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 0 }]);

    await runProjectionWorkerTick(db, port, 10);

    expect(mockReschedule).toHaveBeenCalledWith(db, 1, 1, 30);
  });

  it('completes after failed emit then successful retry (same outbox row)', async () => {
    const db = fakeDb();
    const emit = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, error: 'unavailable' })
      .mockResolvedValueOnce({ ok: true, status: 202 });
    const port: WebappEventsPort = {
      emit,
      listSymptomTrackings: vi.fn().mockResolvedValue({ ok: true, trackings: [] }),
      listLfkComplexes: vi.fn().mockResolvedValue({ ok: true, complexes: [] }),
    };
    mockClaim
      .mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 0 }])
      .mockResolvedValueOnce([{ ...BASE_EVENT, attemptsDone: 1 }]);

    await runProjectionWorkerTick(db, port, 10);
    await runProjectionWorkerTick(db, port, 10);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(mockReschedule).toHaveBeenCalledWith(db, 1, 1, 30);
    expect(mockComplete).toHaveBeenCalledWith(db, 1);
    expect(mockFail).not.toHaveBeenCalled();
  });

  it('returns 0 when no events due', async () => {
    mockClaim.mockResolvedValueOnce([]);
    const processed = await runProjectionWorkerTick(fakeDb(), fakeWebappPort(true), 10);
    expect(processed).toBe(0);
  });
});
