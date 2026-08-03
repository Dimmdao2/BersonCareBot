import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChannelPolicy } from '@/modules/auth/authChannelPolicy';

const fakes = vi.hoisted(() => ({
  isRateLimited: vi.fn<(phone: string) => Promise<boolean>>(),
  isChannelEnabled: vi.fn<(channel: string) => Promise<boolean>>(),
  getClientVisiblePolicy: vi.fn<() => Promise<AuthChannelPolicy>>(),
  getCurrentSession: vi.fn(),
  buildAppDeps: vi.fn(),
  personalizedLookup: vi.fn(),
  identityPort: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/modules/auth/checkPhoneRateLimit', () => ({
  isCheckPhoneRateLimited: fakes.isRateLimited,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  getClientVisibleAuthChannelPolicy: fakes.getClientVisiblePolicy,
  isAuthChannelEnabled: fakes.isChannelEnabled,
}));
vi.mock('@/modules/auth/checkPhoneMethods', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/checkPhoneMethods')>()),
  // Fault injection: the old contract called this per-phone resolver. A public response must stay
  // available when that identity path is unavailable because it must not use it at all.
  resolveAuthMethodsForPhone: fakes.personalizedLookup,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@/modules/roles/service', () => ({ canAccessPatient: vi.fn(() => true) }));
vi.mock('@/modules/auth/phoneMessengerBindStartRateLimit', () => ({
  PHONE_MESSENGER_BIND_START_RATE_LIMIT_SEC: 600,
  isPhoneMessengerBindStartRateLimited: vi.fn(async () => false),
}));
vi.mock('@/modules/system-settings/telegramLoginBotUsername', () => ({
  getTelegramLoginBotUsername: vi.fn(async () => 'test_bot'),
}));
vi.mock('@/modules/system-settings/maxLoginBotNickname', () => ({
  getMaxLoginBotNickname: vi.fn(async () => 'test_max_bot'),
}));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: vi.fn(() => 'registration-attempt'),
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
  recordAuthRegistrationSuccess: vi.fn(),
}));

import { POST as checkPhone } from './route';
import { POST as startMessengerBind } from '../phone/messenger-bind/start/route';

function identityDeps() {
  return {
    userByPhone: {
      findByPhone: fakes.identityPort,
      getVerifiedEmailForUser: fakes.identityPort,
    },
    userPins: { getByUserId: fakes.identityPort },
    oauthBindings: fakes.identityPort,
    channelPreferences: { getPreferredAuthOtpChannel: fakes.identityPort },
  };
}

function requestBody(body: unknown): Request {
  return new Request('https://app.example.test/api/auth/check-phone', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function request(phone: string): Request {
  return requestBody({ phone });
}

async function completePublicResponse(phone: string): Promise<Response> {
  const response = checkPhone(request(phone));
  await vi.advanceTimersByTimeAsync(500);
  return response;
}

function recursiveKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(recursiveKeys);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [
    key,
    ...recursiveKeys(nested),
  ]);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-03T10:00:00.000Z'));
  vi.clearAllMocks();
  fakes.isRateLimited.mockResolvedValue(false);
  fakes.isChannelEnabled.mockResolvedValue(true);
  fakes.getClientVisiblePolicy.mockResolvedValue({
    sms: true,
    telegram: true,
    max: true,
    email: true,
  });
  fakes.getCurrentSession.mockResolvedValue(null);
  fakes.buildAppDeps.mockImplementation(identityDeps);
  fakes.personalizedLookup.mockRejectedValue(new Error('identity lookup must not be called'));
  fakes.identityPort.mockRejectedValue(new Error('identity port must not be called'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('public check-phone enumeration closure', () => {
  it('returns byte-equivalent global capabilities for known and unknown phones despite identity faults', async () => {
    const known = await completePublicResponse('+79991234567');
    const unknown = await completePublicResponse('+79991234568');
    const knownBody = await known.text();
    const unknownBody = await unknown.text();

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknownBody).toBe(knownBody);
    expect(JSON.parse(knownBody)).toEqual({
      ok: true,
      methods: { sms: false, telegram: true, max: true, email: true },
    });
    expect(fakes.personalizedLookup).not.toHaveBeenCalled();
    expect(fakes.identityPort).not.toHaveBeenCalled();
  });

  it('does not vary with account existence, bindings, PIN, email, or preference', async () => {
    fakes.personalizedLookup.mockImplementation(async (phone: string) =>
      phone === '+79991234567'
        ? {
            exists: true,
            userId: '00000000-0000-4000-8000-000000000027',
            methods: {
              sms: false,
              pin: true,
              telegram: true,
              max: false,
              email: true,
              emailAddress: 'owner@example.test',
            },
          }
        : {
            exists: false,
            methods: { sms: false, telegram: false, max: false, email: false },
          },
    );
    fakes.identityPort.mockResolvedValue('telegram');

    const boundAccount = await completePublicResponse('+79991234567');
    const absentAccount = await completePublicResponse('+79991234568');

    expect(await absentAccount.text()).toBe(await boundAccount.text());
    expect(fakes.personalizedLookup).not.toHaveBeenCalled();
    expect(fakes.identityPort).not.toHaveBeenCalled();
  });

  it('projects only configured-and-enabled global capabilities for every entered phone', async () => {
    fakes.getClientVisiblePolicy.mockResolvedValue({
      sms: false,
      telegram: false,
      max: true,
      email: false,
    });

    const first = await completePublicResponse('+79991234567');
    const second = await completePublicResponse('+79991234568');
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(secondBody).toEqual(firstBody);
    expect(firstBody).toEqual({
      ok: true,
      methods: { sms: false, telegram: false, max: true, email: false },
    });
  });

  it('contains no account-derived field or full email at any nesting level', async () => {
    const response = await completePublicResponse('+79991234567');
    const body = await response.json();
    const keys = recursiveKeys(body);

    for (const forbiddenKey of [
      'exists',
      'bindings',
      'telegramId',
      'maxId',
      'pin',
      'preferredOtpChannel',
      'emailAddress',
      'userId',
    ]) {
      expect(keys).not.toContain(forbiddenKey);
    }
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('keeps the pre-deploy caller contract usable without account fields', async () => {
    const response = await completePublicResponse('+79991234567');
    const body = (await response.json()) as {
      ok?: boolean;
      exists?: boolean;
      methods?: { telegram?: boolean; max?: boolean; email?: boolean };
    };

    // The deployed predecessor treated a missing `exists` as the anonymous/unknown branch and
    // continued with the channel picker whenever the methods object exposed a usable channel.
    const legacyStep =
      body.ok && body.methods
        ? !body.exists && (body.methods.telegram || body.methods.max || body.methods.email)
          ? 'choose_channel'
          : 'no_channel'
        : 'error';

    expect(legacyStep).toBe('choose_channel');
    expect(body).not.toHaveProperty('exists');
  });

  it('does not resolve a valid public response before the server timing floor', async () => {
    let settled = false;
    const responsePromise = checkPhone(request('+79991234567')).then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect((await responsePromise).status).toBe(200);
  });

  it('rejects invalid phones before rate-limit or capability work', async () => {
    const response = await checkPhone(requestBody({ phone: 'not-a-phone' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'invalid_phone' });
    expect(fakes.isRateLimited).not.toHaveBeenCalled();
    expect(fakes.getClientVisiblePolicy).not.toHaveBeenCalled();
  });

  it('preserves the public rate-limit rejection before capability work', async () => {
    fakes.isRateLimited.mockResolvedValue(true);

    const response = await checkPhone(request('+79991234567'));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'rate_limited' });
    expect(fakes.getClientVisiblePolicy).not.toHaveBeenCalled();
  });

  it('rejects anonymous profile binding before any identity dependency is built', async () => {
    const response = await startMessengerBind(
      new Request('https://app.example.test/api/auth/phone/messenger-bind/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone: '+79991234567',
          channelCode: 'telegram',
          purpose: 'profile_bind',
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.identityPort).not.toHaveBeenCalled();
  });
});
