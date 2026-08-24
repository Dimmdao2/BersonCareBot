import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
  type AuthChannel,
} from './authChannelPolicy';

export type AuthDeliveryDenied = {
  ok: false;
  reason: typeof AUTH_CHANNEL_DISABLED_ERROR;
};

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
