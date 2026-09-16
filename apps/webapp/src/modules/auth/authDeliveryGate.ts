import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
  type AuthChannel,
} from './authChannelPolicy';

export type AuthDeliveryDenied = {
  ok: false;
  reason: typeof AUTH_CHANNEL_DISABLED_ERROR;
};

export type AuthDeliveryPurpose = 'login_door' | 'surface_requested';

/**
 * The one authorization seam for auth-code/contact delivery.
 *
 * Every webapp call that can reach the integrator's auth delivery endpoints enters here and must
 * say whether it is opening a login door or delivering a code already requested by a legitimate
 * flow. Policy lookup failures are deliberately indistinguishable from an explicit disabled
 * toggle: neither a missing surface nor a missing/malformed projection may turn into delivery or
 * an unrenderable 500.
 */
export async function withAuthDeliveryChannelGate<T>(
  channel: AuthChannel,
  purpose: AuthDeliveryPurpose,
  deliver: () => Promise<T>,
): Promise<T | AuthDeliveryDenied> {
  try {
    const enabled =
      purpose === 'login_door'
        ? await isAuthChannelEnabled(channel)
        : await isAuthChannelEnabled(channel, undefined, 'transactional');
    if (enabled) {
      return deliver();
    }
  } catch {
    // Fail closed with the same stable, caller-renderable reason as an explicit disabled toggle.
  }
  return { ok: false, reason: AUTH_CHANNEL_DISABLED_ERROR };
}
