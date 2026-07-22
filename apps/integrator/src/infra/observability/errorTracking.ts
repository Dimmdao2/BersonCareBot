import {
  captureErrorTrackingException,
  closeErrorTracking,
  initErrorTracking,
  type ErrorTrackingCapturePoint,
  type ErrorTrackingProcessRole,
} from '@bersoncare/error-tracking';

import type { DbPort } from '../../kernel/contracts/index.js';
import { readGlobalServerRuntimeString } from '../db/publicRuntimeSettings.js';

export async function initIntegratorErrorTracking(
  db: DbPort,
  processRole: Extract<ErrorTrackingProcessRole, 'api' | 'worker' | 'scheduler'>,
): Promise<void> {
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

export function captureIntegratorError(error: unknown, capturePoint: ErrorTrackingCapturePoint): void {
  captureErrorTrackingException(error, capturePoint);
}

export function captureUnexpectedIntegratorHttpError(error: unknown, statusCode: number): void {
  if (statusCode >= 500) captureErrorTrackingException(error, 'integrator_http_error');
}

export function closeIntegratorErrorTracking(): Promise<boolean> {
  return closeErrorTracking(1_500);
}
