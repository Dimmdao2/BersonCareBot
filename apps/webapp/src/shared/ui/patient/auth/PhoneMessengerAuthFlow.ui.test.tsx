import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthFlowV2 } from './AuthFlowV2';
import { PhoneMessengerAuthFlow } from './PhoneMessengerAuthFlow';

const fakes = vi.hoisted(() => ({ isMiniApp: false, submittedPhone: '+79991234567' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/shared/lib/messengerMiniApp', () => ({
  isMessengerMiniAppHost: () => fakes.isMiniApp,
}));
vi.mock('@/shared/ui/patient/auth/InternationalPhoneInput', () => ({
  InternationalPhoneInput: ({
    onSubmit,
  }: {
    onSubmit: (normalized: string) => void | Promise<void>;
  }) => (
    <button type="button" onClick={() => void onSubmit(fakes.submittedPhone)}>
      Submit phone
    </button>
  ),
}));

afterEach(() => {
  fakes.isMiniApp = false;
  fakes.submittedPhone = '+79991234567';
  vi.unstubAllGlobals();
});

describe('PhoneMessengerAuthFlow automatic delivery', () => {
  it('is reachable when OAuth and messengers are disabled', async () => {
    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, vk: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          authChannelPolicy: { sms: true, email: true, telegram: false, max: false },
          fetchedAt: Date.now(),
        }}
      />,
    );

    const phoneEntry = await screen.findByRole('button', {
      name: 'Войти по номеру телефона',
    });
    fireEvent.click(phoneEntry);

    expect(await screen.findByRole('button', { name: 'Submit phone' })).toBeInTheDocument();
  });

  it('lets a browser login use SMS/email policy without sending an account-specific channel', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          challengeId: 'opaque-challenge-1005',
          retryAfterSeconds: 60,
          deliveryChannel: 'automatic',
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PhoneMessengerAuthFlow
        channelPolicy={{ sms: true, email: true, telegram: false, max: false }}
        purpose="login"
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit phone' }));

    await waitFor(() => expect(screen.getByLabelText('Код подтверждения')).toBeInTheDocument());
    expect(screen.getByText('Код отправлен, проверьте входящие.')).toBeInTheDocument();
    expect(screen.getByText('Повторная отправка возможна через 60 сек')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/phone/start');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      phone: '+79991234567',
      channel: 'web',
      purpose: 'login',
    });
    expect(body).not.toHaveProperty('deliveryChannel');
  });

  it('keeps the legacy Mini App caller on the neutral check-phone contract', async () => {
    fakes.isMiniApp = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          methods: { sms: false, telegram: true, max: true, email: true },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          challengeId: 'opaque-challenge-1005',
          retryAfterSeconds: 60,
          deliveryChannel: 'telegram',
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, vk: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          authChannelPolicy: { sms: false, email: true, telegram: true, max: true },
          fetchedAt: Date.now(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Submit phone' }));

    await waitFor(() => expect(screen.getByLabelText('Код подтверждения')).toBeInTheDocument());
    expect(screen.getByText('Введите код, отправленный вам в Telegram.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/check-phone',
      '/api/auth/phone/start',
    ]);
  });

  it('uses the authenticated messenger-bind door for profile binding without checking entered-phone bindings', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PhoneMessengerAuthFlow
        channelPolicy={{ sms: false, email: false, telegram: true, max: true }}
        purpose="profile_bind"
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit phone' }));

    expect(await screen.findByRole('button', { name: 'Telegram' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Max' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Telegram' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/phone/messenger-bind/start');
    expect(JSON.parse(String(init?.body))).toEqual({
      phone: '+79991234567',
      channelCode: 'telegram',
      purpose: 'profile_bind',
    });
  });

  it('shows the same complete global channel list and neutral result for known and unknown phones', async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          challengeId: `opaque-challenge-${fetchMock.mock.calls.length}`,
          retryAfterSeconds: 60,
          deliveryChannel: 'automatic',
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const run = async (phone: string) => {
      fakes.submittedPhone = phone;
      const view = render(
        <PhoneMessengerAuthFlow
          channelPolicy={{ sms: true, email: true, telegram: true, max: true }}
          purpose="login"
          onBack={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Submit phone' }));
      await screen.findByLabelText('Код подтверждения');
      fireEvent.click(screen.getByRole('button', { name: 'Подтвердить другим способом' }));

      const labels = [
        'Получить код в Max',
        'Получить код на email',
        'Получить код в Telegram',
        'Получить код по SMS',
      ].filter((label) => screen.queryByRole('button', { name: label }) != null);

      fireEvent.click(screen.getByRole('button', { name: 'Получить код в Telegram' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const message = screen.getByText('Код отправлен, проверьте входящие.').textContent;
      const requestBodies = fetchMock.mock.calls.map(([, init]) =>
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      view.unmount();
      fetchMock.mockClear();
      return { labels, message, requestBodies };
    };

    const known = await run('+79991234567');
    const unknown = await run('+79991234568');

    expect(unknown.labels).toEqual(known.labels);
    expect(known.labels).toHaveLength(4);
    expect(unknown.message).toBe(known.message);
    expect(known.requestBodies[1]).toMatchObject({
      phone: '+79991234567',
      purpose: 'login',
      deliveryChannel: 'telegram',
    });
    expect(unknown.requestBodies[1]).toMatchObject({
      phone: '+79991234568',
      purpose: 'login',
      deliveryChannel: 'telegram',
    });
  });

  it('adds the neutral spam-folder hint after choosing email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({ ok: true, challengeId: crypto.randomUUID(), retryAfterSeconds: 60 }),
        }) as Response,
      ),
    );

    render(
      <PhoneMessengerAuthFlow
        channelPolicy={{ sms: false, email: true, telegram: true, max: false }}
        purpose="login"
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Submit phone' }));
    await screen.findByLabelText('Код подтверждения');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить другим способом' }));
    fireEvent.click(screen.getByRole('button', { name: 'Получить код на email' }));

    expect(
      await screen.findByText(
        'Код отправлен, проверьте входящие. Если письмо не приходит, проверьте папку «Спам».',
      ),
    ).toBeInTheDocument();
  });

  it('returns from the real code screen to the other login methods', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => ({ ok: true, challengeId: 'opaque-challenge-return', retryAfterSeconds: 60 }),
        }) as Response,
      ),
    );

    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: true, google: false, vk: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          authChannelPolicy: { sms: true, email: true, telegram: true, max: true },
          fetchedAt: Date.now(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Войти по номеру телефона' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit phone' }));
    await screen.findByLabelText('Код подтверждения');

    fireEvent.click(screen.getByRole('button', { name: 'Войти иначе' }));

    expect(await screen.findByRole('button', { name: 'Войти через Яндекс' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Код подтверждения')).not.toBeInTheDocument();
  });
});
