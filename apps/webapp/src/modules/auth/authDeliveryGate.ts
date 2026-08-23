import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
  isIndependentAuthMethodEnabled,
  isOAuthProviderEnabled,
  type AuthChannel,
} from './authChannelPolicy';
import type { OAuthProvider } from './oauthProviderRegistry';

export type AuthDeliveryDenied = {
  ok: false;
  reason: typeof AUTH_CHANNEL_DISABLED_ERROR;
};

export type AuthMechanic = 'passkey' | `oauth_${OAuthProvider}`;

/**
 * The one server-side chokepoint for surface-aware login mechanics.
 *
 * Presentation may read the policy to decide what to display, but a start, callback, or passkey
 * ceremony must ask this gate again. The resolver-backed policy is deliberately fail-closed so a
 * disabled setting, missing surface, or settings failure cannot become an authentication path.
 */
export async function isAuthMechanicEnabled(mechanic: AuthMechanic): Promise<boolean> {
  try {
    if (mechanic === 'passkey') {
      return await isIndependentAuthMethodEnabled('passkey');
    }
    return await isOAuthProviderEnabled(mechanic.slice('oauth_'.length) as OAuthProvider);
  } catch {
    return false;
  }
}

/**
 * The one surface-aware authorization seam for auth-code/contact delivery.
 *
 * Every webapp call that can reach the integrator's auth delivery endpoints enters here. Policy
 * lookup failures are deliberately indistinguishable from an explicit disabled toggle: neither a
 * missing surface nor a missing/malformed projection may turn into delivery or an unrenderable 500.
 */
export async function withAuthDeliveryChannelGate<T>(
  channel: AuthChannel,
  deliver: () => Promise<T>,
): Promise<T | AuthDeliveryDenied> {
  try {
    if (await isAuthChannelEnabled(channel)) {
      return deliver();
    }
  } catch {
    // Fail closed with the same stable, caller-renderable reason as an explicit disabled toggle.
  }
  return { ok: false, reason: AUTH_CHANNEL_DISABLED_ERROR };
}
