import { afterEach, describe, expect, it, vi } from 'vitest';

import { exchangeAppleAuthorizationCode } from './appleOAuthHelpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exchangeAppleAuthorizationCode', () => {
  const opts = {
    clientId: 'client-1',
    clientSecretJwt: 'signed-secret',
    code: 'authorization-code',
    redirectUri: 'https://app.test/api/auth/oauth/callback/apple',
  };

  it('preserves the token exchange request and response through the bounded fetch', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'at', id_token: 'id-token' })),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeAppleAuthorizationCode(opts)).resolves.toEqual({
      access_token: 'at',
      id_token: 'id-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/token',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
  });

  it('preserves the existing provider HTTP error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('invalid_grant', { status: 400 })),
    );

    await expect(exchangeAppleAuthorizationCode(opts)).rejects.toThrow(
      'apple_token_exchange_failed: 400 invalid_grant',
    );
  });
});
