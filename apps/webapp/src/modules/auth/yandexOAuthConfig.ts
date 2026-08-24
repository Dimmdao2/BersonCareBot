import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import type { VerifiedOAuthState } from '@/modules/auth/oauthSignedState';
import { getConfigValue } from '@/modules/system-settings/configAdapter';
import type { ResolvedSurface } from '@/shared/lib/surface/requestSurface';

export const YANDEX_OAUTH_CALLBACK_PATH = '/api/auth/oauth/callback/yandex';

export type ResolvedYandexOAuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}>;

/** The callback must be served by the very surface (including its tenant) that signed state. */
export function yandexOAuthStateMatchesSurface(
  state: VerifiedOAuthState,
  surface: ResolvedSurface,
): boolean {
  return (
    state.surface === surface.surface &&
    state.publicOrigin === surface.publicOrigin &&
    state.organizationId === surface.organizationId
  );
}

function callbackUriFor(surface: ResolvedSurface): string | null {
  try {
    return new URL(YANDEX_OAUTH_CALLBACK_PATH, surface.publicOrigin).toString();
  } catch {
    return null;
  }
}

function parseExactCallbackAllowlist(raw: string): readonly string[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    // Existing installations persist the former single redirect URI as a JSON string. Treat it
    // as a one-entry exact allowlist until the same settings write path saves the list form.
    if (typeof value === 'string') return [value];
    return null;
  } catch {
    return raw.trim() ? [raw.trim()] : null;
  }
}

/**
 * The sole Yandex OAuth configuration choke point. Credentials are global, but may only be
 * used by an enabled patient surface whose exact callback URL is registered in settings.
 */
export async function resolveYandexOAuthConfig(
  surface: ResolvedSurface,
): Promise<ResolvedYandexOAuthConfig | null> {
  if (surface.surface !== 'patient_default' && surface.surface !== 'patient_branded') return null;
  if (!surface.authPolicy.availableMethods.includes('oauth')) return null;

  const redirectUri = callbackUriFor(surface);
  if (!redirectUri) return null;

  const [enabled, clientIdRaw, clientSecretRaw, allowlistRaw] = await Promise.all([
    isOAuthProviderEnabled('yandex', 'patient'),
    getConfigValue('yandex_oauth_client_id'),
    getConfigValue('yandex_oauth_client_secret'),
    getConfigValue('yandex_oauth_redirect_uri'),
  ]);
  const clientId = clientIdRaw.trim();
  const clientSecret = clientSecretRaw.trim();
  const allowlist = parseExactCallbackAllowlist(allowlistRaw);

  if (!enabled || !clientId || !clientSecret || !allowlist?.includes(redirectUri)) return null;
  return { clientId, clientSecret, redirectUri };
}
