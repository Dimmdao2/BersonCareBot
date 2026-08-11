import { describe, expect, it, vi } from 'vitest';

const tracking = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn(), close: vi.fn(async () => true) }));
vi.mock('@bersoncare/error-tracking', () => ({
  initErrorTracking: tracking.init,
  captureErrorTrackingException: tracking.capture,
  closeErrorTracking: tracking.close,
}));
const { captureMediaWorkerLoopError, captureMediaWorkerStartupFatal, initMediaWorkerErrorTracking } = await import('./errorTracking.js');

describe('media worker error tracking control adapter', () => {
  it('initializes from a fresh authenticated control snapshot and preserves the closed process tags', async () => {
    const control = { errorTrackingConfig: vi.fn(async () => ({ enabled: true, dsn: 'https://key@example.test/42' })) };
    await initMediaWorkerErrorTracking(control as never);
    expect(tracking.init).toHaveBeenCalledWith({
      enabled: true, dsn: 'https://key@example.test/42', service: 'media-worker', processRole: 'media-worker',
    });
    captureMediaWorkerLoopError(new Error('unsafe message'));
    captureMediaWorkerStartupFatal(new Error('unsafe message'));
    expect(tracking.capture.mock.calls.map(([, point]) => point)).toEqual([
      'media_worker_loop_error', 'media_worker_startup_fatal',
    ]);
  });

  it('fails closed when the control snapshot is unavailable', async () => {
    await expect(initMediaWorkerErrorTracking({ errorTrackingConfig: vi.fn(async () => { throw new Error('unavailable'); }) } as never)).resolves.toBeUndefined();
  });
});
