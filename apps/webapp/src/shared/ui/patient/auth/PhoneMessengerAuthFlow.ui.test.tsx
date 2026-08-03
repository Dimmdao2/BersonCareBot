import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthFlowV2 } from './AuthFlowV2';
import { PhoneMessengerAuthFlow } from './PhoneMessengerAuthFlow';

const fakes = vi.hoisted(() => ({ isMiniApp: false }));

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
    <button type="button" onClick={() => void onSubmit('+79991234567')}>
      Submit phone
    </button>
  ),
}));
vi.mock('@/shared/ui/patient/auth/OtpCodeForm', () => ({
  OtpCodeForm: ({ description }: { description?: string }) => (
    <div data-testid="otp-code-form">{description}</div>
  ),
}));

afterEach(() => {
  fakes.isMiniApp = false;
  vi.unstubAllGlobals();
});

describe('PhoneMessengerAuthFlow automatic delivery', () => {
  it('is reachable when OAuth and messengers are disabled', async () => {
    render(
      <AuthFlowV2
        nextParam={null}
        prefetchedAuthConfig={{
          oauthProviders: { yandex: false, google: false, apple: false },
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

    await waitFor(() => expect(screen.getByTestId('otp-code-form')).toBeInTheDocument());
    expect(screen.getByTestId('otp-code-form')).toHaveTextContent(
      'код отправлен по SMS или на подтверждённый email',
    );
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
          oauthProviders: { yandex: false, google: false, apple: false },
          telegramBotUsername: null,
          maxBotOpenUrl: null,
          specialistSignupEnabled: false,
          authChannelPolicy: { sms: false, email: true, telegram: true, max: true },
          fetchedAt: Date.now(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Submit phone' }));

    await waitFor(() => expect(screen.getByTestId('otp-code-form')).toBeInTheDocument());
    expect(screen.getByTestId('otp-code-form')).toHaveTextContent(
      'код, отправленный вам в Telegram',
    );
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
});
