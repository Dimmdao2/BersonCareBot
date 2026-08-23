import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ isAuthMechanicEnabled: vi.fn<() => Promise<boolean>>() }));

vi.mock('@/modules/auth/authDeliveryGate', () => ({
  isAuthMechanicEnabled: fakes.isAuthMechanicEnabled,
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isAuthMechanicEnabled.mockResolvedValue(false);
});

describe('Apple OAuth callback surface gate', () => {
  it('refuses before parsing callback input when the surface matrix disables OAuth', async () => {
    const response = await POST(
      new Request('https://app.example.test/api/auth/oauth/callback/apple', { method: 'POST' }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('reason=oauth_disabled');
    expect(fakes.isAuthMechanicEnabled).toHaveBeenCalledWith('oauth_apple');
  });
});
