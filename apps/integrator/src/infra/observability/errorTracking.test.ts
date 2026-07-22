import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock('@bersoncare/error-tracking', () => ({
  captureErrorTrackingException: captureMock,
  closeErrorTracking: vi.fn(async () => true),
  initErrorTracking: vi.fn(async () => ({ enabled: false, release: 'dev' })),
}));

import { captureUnexpectedIntegratorHttpError } from './errorTracking.js';

describe('integrator error tracking', () => {
  beforeEach(() => captureMock.mockReset());

  it.each([200, 201, 204, 400, 401, 404, 422, 499])('does not capture HTTP %s', (statusCode) => {
    captureUnexpectedIntegratorHttpError(new Error('expected'), statusCode);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('captures one unexpected 5xx error', () => {
    const error = new Error('synthetic');
    captureUnexpectedIntegratorHttpError(error, 500);
    expect(captureMock).toHaveBeenCalledOnce();
    expect(captureMock).toHaveBeenCalledWith(error, 'integrator_http_error');
  });
});
