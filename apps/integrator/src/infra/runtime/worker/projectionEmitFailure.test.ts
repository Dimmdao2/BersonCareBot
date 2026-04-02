import { describe, expect, it } from 'vitest';
import { isRecoverableWebappEmitFailure } from './projectionEmitFailure.js';

describe('isRecoverableWebappEmitFailure', () => {
  it('marks 422/404 as non-recoverable', () => {
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 422 })).toBe(false);
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 404 })).toBe(false);
  });

  it('marks 503/5xx/0 as recoverable', () => {
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 503 })).toBe(true);
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 502 })).toBe(true);
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 0, error: 'econnreset' })).toBe(true);
  });
});
