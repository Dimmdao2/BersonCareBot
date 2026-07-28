import type { Pool } from 'pg';
import {
  captureErrorTrackingException,
  closeErrorTracking,
  initErrorTracking,
} from '@bersoncare/error-tracking';

import { runWithMediaWorkerInfraPrincipal } from './runMediaWorkerSql.js';
import { readServerRuntimeString } from './serverRuntimeConfig.js';

export async function initMediaWorkerErrorTracking(pool: Pool): Promise<void> {
  try {
    const [enabled, dsn] = await Promise.all([
      readServerRuntimeString(pool, 'error_tracking_enabled'),
      readServerRuntimeString(pool, 'error_tracking_dsn'),
    ]);
    await initErrorTracking({
      enabled: enabled === 'true',
      dsn,
      service: 'media-worker',
      processRole: 'media-worker',
    });
  } catch {
    // Optional telemetry config/SDK failures must never affect readiness.
  }
}

export async function runMediaWorkerStartupGate(
  pool: Pool,
  assertReady: () => Promise<void>,
): Promise<void> {
  await runWithMediaWorkerInfraPrincipal('media-worker:tick', async () => {
    await initMediaWorkerErrorTracking(pool);
    await assertReady();
  });
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
