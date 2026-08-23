/**
 * Incident regression: removing the policy decision from the shared delivery seam must make this
 * suite red; otherwise a new or previously-gated route can silently send through a disabled method.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isAuthChannelEnabled: vi.fn(),
  isIndependentAuthMethodEnabled: vi.fn(),
  isOAuthProviderEnabled: vi.fn(),
}));

vi.mock('./authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
  isIndependentAuthMethodEnabled: fakes.isIndependentAuthMethodEnabled,
  isOAuthProviderEnabled: fakes.isOAuthProviderEnabled,
}));

import { isAuthMechanicEnabled, withAuthDeliveryChannelGate } from './authDeliveryGate';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withAuthDeliveryChannelGate', () => {
  it('refuses a disabled method with a renderable reason before delivery', async () => {
    fakes.isAuthChannelEnabled.mockResolvedValue(false);
    const deliver = vi.fn().mockResolvedValue({ ok: true });

    await expect(withAuthDeliveryChannelGate('sms', deliver)).resolves.toEqual({
      ok: false,
      reason: 'auth_channel_disabled',
    });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('fails closed with the same reason when surface/settings resolution fails', async () => {
    fakes.isAuthChannelEnabled.mockRejectedValue(new Error('missing surface setting'));
    const deliver = vi.fn().mockResolvedValue({ ok: true });

    await expect(withAuthDeliveryChannelGate('telegram', deliver)).resolves.toEqual({
      ok: false,
      reason: 'auth_channel_disabled',
    });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('executes delivery only when the method is enabled for the resolved surface', async () => {
    fakes.isAuthChannelEnabled.mockResolvedValue(true);
    const deliver = vi.fn().mockResolvedValue({ ok: true, marker: 'sent' });

    await expect(withAuthDeliveryChannelGate('email', deliver)).resolves.toEqual({
      ok: true,
      marker: 'sent',
    });
    expect(deliver).toHaveBeenCalledOnce();
  });
});

describe('isAuthMechanicEnabled', () => {
  it('refuses disabled OAuth and passkey through the resolver-backed mechanic gate', async () => {
    fakes.isOAuthProviderEnabled.mockResolvedValue(false);
    fakes.isIndependentAuthMethodEnabled.mockResolvedValue(false);

    await expect(isAuthMechanicEnabled('oauth_yandex')).resolves.toBe(false);
    await expect(isAuthMechanicEnabled('passkey')).resolves.toBe(false);
    expect(fakes.isOAuthProviderEnabled).toHaveBeenCalledWith('yandex');
    expect(fakes.isIndependentAuthMethodEnabled).toHaveBeenCalledWith('passkey');
  });

  it('fails closed when the surface policy resolver throws', async () => {
    fakes.isOAuthProviderEnabled.mockRejectedValue(new Error('missing resolved surface'));

    await expect(isAuthMechanicEnabled('oauth_google')).resolves.toBe(false);
  });
});
