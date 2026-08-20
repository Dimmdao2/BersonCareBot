/**
 * Google Calendar runtime config: canonical DB-backed `public.system_settings` (admin scope).
 * Reads on demand so an admin availability switch takes effect without a redeploy.
 */
import { createDbPort } from '../../infra/db/client.js';
import type { GoogleCalendarConfig } from './config.js';
import { logger } from '../../infra/observability/logger.js';
import {
  fetchIntegratorGoogleCalendarGlobalSettingString,
  fetchIntegratorGoogleCalendarOrganizationSettingString,
  type IntegratorGoogleCalendarGlobalSettingKey,
  listGoogleCalendarProbeOrganizationIdsViaCapability,
} from '../../infra/db/publicSystemSettings.js';
import { isPlatformIntegrationAvailable } from '../../infra/db/platformIntegrationAvailability.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';

/**
 * Platform-wide Google OAuth identity. Goes through the calendar capability, not a settings-table
 * read: no integrator role can touch `public.system_settings`, so this used to return null for
 * every value and left the clinic's calendar integration permanently disabled.
 */
async function readGlobalGoogleSetting(
  key: IntegratorGoogleCalendarGlobalSettingKey,
): Promise<string | null> {
  try {
    return await fetchIntegratorGoogleCalendarGlobalSettingString(createDbPort(), key);
  } catch {
    return null;
  }
}

/**
 * Clinic-owned connection values are exact organization rows. The platform OAuth identity
 * is global, but every value remains canonical DB state; unavailable authority fails closed.
 *
 * The whole read runs in THIS clinic's context. `app.read_integrator_google_calendar_setting`
 * is a tenant capability — the clinic's calendar id and refresh token are the clinic's, and the
 * root matches `organization_id` exactly. The operator probe reaches this same door once per
 * candidate clinic and used to arrive under the platform-wide scheduler role, where the root is
 * not executable; the `catch` below then reported every clinic as "not configured". Selecting the
 * organization context here, at the single door to the capability, is the same rule the delivery
 * capability follows in `../../infra/db/platformIntegrationAvailability.ts`.
 */
async function readConfigFromDb(organizationId: string): Promise<GoogleCalendarConfig> {
  try {
    const db = createDbPort();
    return await runWithOrganizationPrincipal(organizationId, async () => {
      const [
        enabledRaw,
        clientId,
        clientSecret,
        redirectUri,
        calendarId,
        refreshToken,
        platformAvailable,
      ] = await Promise.all([
        fetchIntegratorGoogleCalendarOrganizationSettingString(
          db,
          'google_calendar_enabled',
          organizationId,
        ),
        readGlobalGoogleSetting('google_client_id'),
        readGlobalGoogleSetting('google_client_secret'),
        readGlobalGoogleSetting('google_redirect_uri'),
        fetchIntegratorGoogleCalendarOrganizationSettingString(
          db,
          'google_calendar_id',
          organizationId,
        ),
        fetchIntegratorGoogleCalendarOrganizationSettingString(
          db,
          'google_refresh_token',
          organizationId,
        ),
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
    });
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
    // Probe-only caller, and the settings table is unreachable from this app under every
    // principal, so there is no second path to keep: the probe used to see an empty list here and
    // report google_calendar as skipped_not_configured forever.
    return await listGoogleCalendarProbeOrganizationIdsViaCapability(createDbPort());
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
