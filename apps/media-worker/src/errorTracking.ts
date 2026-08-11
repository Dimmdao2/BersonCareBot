import {
  captureErrorTrackingException,
  closeErrorTracking,
  initErrorTracking,
} from '@bersoncare/error-tracking';
import type { MediaWorkerControlPort } from './control.js';

/** Error tracking settings reach the worker only through the authenticated control seam. */
export async function initMediaWorkerErrorTracking(control: MediaWorkerControlPort): Promise<void> {
  try {
    const config = await control.errorTrackingConfig();
    await initErrorTracking({
      enabled: config.enabled,
      dsn: config.dsn,
      service: 'media-worker',
      processRole: 'media-worker',
    });
  } catch {
    // The optional dark-launch transport must never make transcoding unavailable.
  }
}

export function captureMediaWorkerLoopError(error: unknown): void {
  captureErrorTrackingException(error, 'media_worker_loop_error');
}

export function captureMediaWorkerStartupFatal(error: unknown): void {
  captureErrorTrackingException(error, 'media_worker_startup_fatal');
}

export function closeMediaWorkerErrorTracking(): Promise<boolean> {
  return closeErrorTracking(1_500);
}
