import {
  captureErrorTrackingException,
  closeErrorTracking,
  initErrorTracking,
  type ErrorTrackingProcessRole,
} from '@bersoncare/error-tracking';

import type { DbPort } from '../../kernel/contracts/index.js';
import { readGlobalServerRuntimeString } from '../db/publicRuntimeSettings.js';

export async function initIntegratorErrorTracking(
  db: DbPort,
  processRole: Extract<ErrorTrackingProcessRole, 'api' | 'worker' | 'scheduler'>,
): Promise<void> {
  if (process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context') {
    // Startup has not installed a declared principal yet. Error tracking is optional, so it must
    // not create an unauthenticated DB checkout merely to read its dark-launch settings.
    await initErrorTracking({ enabled: false, dsn: '', service: 'integrator', processRole });
    return;
  }
  try {
    const [enabled, dsn] = await Promise.all([
      readGlobalServerRuntimeString(db, 'error_tracking_enabled'),
      readGlobalServerRuntimeString(db, 'error_tracking_dsn'),
    ]);
    await initErrorTracking({
      enabled: enabled === 'true',
      dsn,
      service: 'integrator',
      processRole,
    });
  } catch {
    // Runtime config and SDK failures are dark-launch failures, never startup failures.
  }
}

export function captureIntegratorStartupFatal(error: unknown): void {
  captureErrorTrackingException(error, 'integrator_startup_fatal');
}

export function captureUnexpectedIntegratorHttpError(error: unknown, statusCode: number): void {
  if (statusCode >= 500) captureErrorTrackingException(error, 'integrator_http_error');
}

export function captureWorkerLoopError(error: unknown): void {
  captureErrorTrackingException(error, 'worker_loop_error');
}

export function captureWorkerStartupFatal(error: unknown): void {
  captureErrorTrackingException(error, 'worker_startup_fatal');
}

export function captureSchedulerLoopError(error: unknown): void {
  captureErrorTrackingException(error, 'scheduler_loop_error');
}

export function captureSchedulerStartupFatal(error: unknown): void {
  captureErrorTrackingException(error, 'scheduler_startup_fatal');
}

export function closeIntegratorErrorTracking(): Promise<boolean> {
  return closeErrorTracking(1_500);
}
