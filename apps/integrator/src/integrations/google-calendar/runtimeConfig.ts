/**
 * Google Calendar runtime config: canonical DB-backed `public.system_settings` (admin scope).
 * Reads on demand so an admin availability switch takes effect without a redeploy.
 */
import { createDbPort } from '../../infra/db/client.js';
import type { GoogleCalendarConfig } from './config.js';
import { logger } from '../../infra/observability/logger.js';
import {
  listExactOrganizationIdsWithTruePublicSystemSetting,
  listGoogleCalendarProbeOrganizationIdsViaCapability,
  readExactOrganizationPublicSystemSettingString,
  readPublicSystemSettingString,
} from '../../infra/db/publicSystemSettings.js';
import { getCurrentIntegratorTechnicalRuntimeRole } from '../../infra/db/withClient.js';
import { isPlatformIntegrationAvailable } from '../../infra/db/platformIntegrationAvailability.js';

async function readDbSetting(
  key: string,
  organizationId: string | null = null,
): Promise<string | null> {
  try {
    const db = createDbPort();
    return await readPublicSystemSettingString(db, key, 'admin', { organizationId });
  } catch {
    return null;
  }
}

/**
 * Clinic-owned connection values are exact organization rows. The platform OAuth identity
 * is global, but every value remains canonical DB state; unavailable authority fails closed.
 */
async function readConfigFromDb(organizationId: string): Promise<GoogleCalendarConfig> {
  try {
    const db = createDbPort();
    const [
      enabledRaw,
      clientId,
      clientSecret,
      redirectUri,
      calendarId,
      refreshToken,
      platformAvailable,
    ] = await Promise.all([
      readExactOrganizationPublicSystemSettingString(db, 'google_calendar_enabled', organizationId),
      readDbSetting('google_client_id'),
      readDbSetting('google_client_secret'),
      readDbSetting('google_redirect_uri'),
      readExactOrganizationPublicSystemSettingString(db, 'google_calendar_id', organizationId),
      readExactOrganizationPublicSystemSettingString(db, 'google_refresh_token', organizationId),
      isPlatformIntegrationAvailable(db, 'google_calendar'),
    ]);
    return {
      enabled:
        platformAvailable &&
        (enabledRaw !== null ? enabledRaw === 'true' || enabledRaw === '1' : false),
      clientId: clientId ?? '',
      clientSecret: clientSecret ?? '',
      redirectUri: redirectUri ?? '',
      // A clinic connection must never inherit either value from another clinic.
      calendarId: calendarId ?? '',
      refreshToken: refreshToken ?? '',
    };
  } catch (err) {
    logger.warn({ err }, '[google-calendar] failed to read clinic config from DB');
    return {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      calendarId: '',
      refreshToken: '',
    };
  }
}

/**
 * Operator health needs an actual clinic context after calendar credentials became per-org.
 * Return all explicitly enabled clinic rows; the probe chooses the first fully configured one.
 */
export async function listGoogleCalendarProbeOrganizationIds(): Promise<string[]> {
  try {
    // Under the scheduler capability role the settings table is unreachable, so the probe used to
    // see an empty list and report google_calendar as skipped_not_configured forever.
    const db = createDbPort();
    return getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_scheduler'
      ? await listGoogleCalendarProbeOrganizationIdsViaCapability(db)
      : await listExactOrganizationIdsWithTruePublicSystemSetting(db, 'google_calendar_enabled');
  } catch (err) {
    logger.warn({ err }, '[google-calendar] failed to list clinic configs for operator probe');
    return [];
  }
}

export async function getGoogleCalendarConfig(
  organizationId: string | null | undefined = null,
): Promise<GoogleCalendarConfig> {
  const normalizedOrganizationId = organizationId?.trim() ?? '';
  if (!normalizedOrganizationId) {
    return {
      enabled: false,
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      calendarId: '',
      refreshToken: '',
    };
  }
  return readConfigFromDb(normalizedOrganizationId);
}
