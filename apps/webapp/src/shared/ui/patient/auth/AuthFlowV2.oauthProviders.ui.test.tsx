import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthFlowV2, type PrefetchedPublicAuthConfig } from './AuthFlowV2';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/shared/lib/messengerMiniApp', () => ({
  isMessengerMiniAppHost: () => false,
}));

function baseConfig(
  oauthProviders: PrefetchedPublicAuthConfig['oauthProviders'],
): PrefetchedPublicAuthConfig {
  return {
    oauthProviders,
    telegramBotUsername: null,
    maxBotOpenUrl: null,
    specialistSignupEnabled: false,
    authChannelPolicy: { sms: false, email: false, telegram: false, max: false },
    fetchedAt: Date.now(),
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, href: '' },
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthFlowV2 — OAuth provider registry (VK visibility)', () => {
  it('shows no OAuth block when every provider is disabled/unconfigured', async () => {
    const { container } = render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={baseConfig({ yandex: false, google: false, vk: false, apple: false })}
      />,
    );

    // With no OAuth alternatives the flow lands directly on the email step, skipping oauth_first.
    await waitFor(() =>
      expect(container.querySelector('#auth-flow-v2-email-password')).toBeInTheDocument(),
    );
    expect(container.querySelector('#auth-flow-v2-oauth-first')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Войти через/ })).not.toBeInTheDocument();
  });

  it('hides the VK button when VK is enabled but not fully configured', async () => {
    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={baseConfig({ yandex: true, google: false, vk: false, apple: false })}
      />,
    );

    expect(
      await screen.findByRole('button', { name: 'Войти через Яндекс' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Войти через VK ID' }),
    ).not.toBeInTheDocument();
  });

  it('shows the VK button when VK is enabled and configured, and starts its own oauth/start call', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, authUrl: 'https://id.vk.com/authorize?client_id=x' }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={baseConfig({ yandex: false, google: false, vk: true, apple: false })}
      />,
    );

    const vkButton = await screen.findByRole('button', { name: 'Войти через VK ID' });
    fireEvent.click(vkButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/auth/oauth/start');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.provider).toBe('vk');

    await waitFor(() =>
      expect(window.location.href).toBe('https://id.vk.com/authorize?client_id=x'),
    );
  });
});
