import { describe, expect, it } from 'vitest';
import { decideRetry } from './retryPolicy.js';

describe('decideRetry', () => {
  it('returns retry when attempts below max', () => {
    const result = decideRetry({
      job: {
        id: 'j1',
        kind: 'delivery.retry',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 0,
        maxAttempts: 3,
        payload: {},
      },
      nowIso: '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });
    expect(result.kind).toBe('retry');
  });

  it('returns complete when max attempts reached', () => {
    const result = decideRetry({
      job: {
        id: 'j2',
        kind: 'delivery.retry',
        runAt: '2026-03-05T12:00:00.000Z',
        attempts: 2,
        maxAttempts: 3,
        payload: {},
      },
      nowIso: '2026-03-05T12:00:00.000Z',
      retryDelaySeconds: 60,
    });
    expect(result.kind).toBe('complete');
  });
});
