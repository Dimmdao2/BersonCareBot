import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChannelPolicy } from '@/modules/auth/authChannelPolicy';

const fakes = vi.hoisted(() => ({
  isRateLimited: vi.fn<(phone: string) => Promise<boolean>>(),
  getClientVisiblePolicy: vi.fn<() => Promise<AuthChannelPolicy>>(),
  personalizedLookup: vi.fn(),
  identityPort: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/modules/auth/checkPhoneRateLimit', () => ({
  isCheckPhoneRateLimited: fakes.isRateLimited,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  getClientVisibleAuthChannelPolicy: fakes.getClientVisiblePolicy,
}));
vi.mock('@/modules/auth/checkPhoneMethods', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/auth/checkPhoneMethods')>()),
  // Fault injection: the old contract called this per-phone resolver. A public response must stay
  // available when that identity path is unavailable because it must not use it at all.
  resolveAuthMethodsForPhone: fakes.personalizedLookup,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userByPhone: {
      findByPhone: fakes.identityPort,
      getVerifiedEmailForUser: fakes.identityPort,
    },
    userPins: { getByUserId: fakes.identityPort },
    oauthBindings: fakes.identityPort,
    channelPreferences: { getPreferredAuthOtpChannel: fakes.identityPort },
  }),
}));

import { POST } from './route';

function request(phone: string): Request {
  return new Request('https://app.example.test/api/auth/check-phone', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
}

async function completePublicResponse(phone: string): Promise<Response> {
  const response = POST(request(phone));
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
  fakes.getClientVisiblePolicy.mockResolvedValue({
    sms: true,
    telegram: true,
    max: true,
    email: true,
  });
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

    expect(keys).not.toEqual(
      expect.arrayContaining([
        'exists',
        'bindings',
        'telegramId',
        'maxId',
        'pin',
        'preferredOtpChannel',
        'emailAddress',
        'userId',
      ]),
    );
    expect(JSON.stringify(body)).not.toContain('@');
  });
});
