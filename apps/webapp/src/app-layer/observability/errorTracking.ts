import { captureErrorTrackingException, initErrorTracking } from '@bersoncare/error-tracking';

import { createPgAppRuntimeSettingsPort } from '@/infra/repos/pgAppRuntimeSettings';

function envelopeString(valueJson: unknown): string | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const value = (valueJson as Record<string, unknown>).value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

export async function initWebappErrorTracking(): Promise<void> {
  try {
    const settings = createPgAppRuntimeSettingsPort();
    const [enabledRow, dsnRow] = await Promise.all([
      settings.getEffective({
        key: 'error_tracking_enabled',
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['server'],
        operationFamily: 'auth_role_config',
      }),
      settings.getEffective({
        key: 'error_tracking_dsn',
        scope: 'admin',
        organizationId: null,
        allowedAudiences: ['server'],
        operationFamily: 'auth_role_config',
      }),
    ]);
    await initErrorTracking({
      enabled: envelopeString(enabledRow?.valueJson) === 'true',
      dsn: envelopeString(dsnRow?.valueJson),
      service: 'webapp',
      processRole: 'webapp',
    });
  } catch {
    // Error tracking is an optional dark-launch capability and fails closed.
  }
}

export function captureWebappRequestError(error: unknown): void {
  captureErrorTrackingException(error, 'webapp_request_error');
}
