import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentityResolutionPort } from './identityResolutionPort';

const fakes = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  getTelegramBotToken: vi.fn<() => Promise<string>>(),
  getTelegramLoginWidgetBotToken: vi.fn<() => Promise<string>>(),
  resolvedSurfaceHeader: '',
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: fakes.cookieSet }),
  headers: async () =>
    new Headers(
      fakes.resolvedSurfaceHeader
        ? { 'x-bc-resolved-surface': fakes.resolvedSurfaceHeader }
        : undefined,
    ),
}));
vi.mock('@/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    ALLOW_DEV_AUTH_BYPASS: false,
    SESSION_COOKIE_SECRET: 'telegram-token-separation-test-secret',
    APP_BASE_URL: 'https://therapysto.example.test',
    PATIENT_APP_ORIGIN: 'https://therapygo.example.test',
    PATIENT_APP_NAME: 'TherapyGo',
  },
  isProduction: false,
  webappRuntimeDatabaseIsConfigured: () => false,
}));
vi.mock('./emailAuth', () => ({
  isVerifiedEmailGlobalAdminAsync: vi.fn(async () => false),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: vi.fn(async () => ''),
  getMaxBotApiKey: vi.fn(async () => ''),
  getTelegramBotToken: fakes.getTelegramBotToken,
  getTelegramLoginWidgetBotToken: fakes.getTelegramLoginWidgetBotToken,
}));
vi.mock('@/app-layer/principal/sessionPrincipal', () => ({
  stampDbPrincipalFromSession: vi.fn(),
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
  runWithStaffSecuritySelfPrincipal: async (_userId: string, _source: string, fn: () => unknown) =>
    fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));

import { exchangeTelegramInitData } from './service';
import { serializeResolvedSurface } from '@/shared/lib/surface/requestSurface';

function telegramInitData(botToken: string): string {
  const entries = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['user', JSON.stringify({ id: 1005, first_name: 'Test' })],
  ] as const;
  const dataCheckString = [...entries]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams([...entries, ['hash', hash]] as [string, string][]).toString();
}

const identityPort: IdentityResolutionPort = {
  resolveByChannelBinding: vi.fn(
    async (): ReturnType<IdentityResolutionPort['resolveByChannelBinding']> => ({
      user: {
        userId: 'tg:1005',
        role: 'client' as const,
        displayName: 'Test',
        bindings: { telegramId: '1005' },
        contacts: [],
        sessionEpoch: 0,
      },
      accountOutcome: 'linked_existing' as const,
    }),
  ),
  findByChannelBinding: vi.fn(async () => null),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-16T00:00:00.000Z'));
  vi.clearAllMocks();
  fakes.getTelegramBotToken.mockResolvedValue('delivery-bot-token');
  fakes.getTelegramLoginWidgetBotToken.mockResolvedValue('widget-bot-token');
  fakes.resolvedSurfaceHeader = serializeResolvedSurface({
    surface: 'patient_default',
    publicOrigin: 'https://therapygo.example.test',
    authPolicy: { availableMethods: ['phone_bot'], enabledMethods: ['phone_bot'] },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Telegram Mini App token separation', () => {
  it('accepts initData only from the existing Mini App bot, not the Login Widget bot', async () => {
    await expect(
      exchangeTelegramInitData(telegramInitData('delivery-bot-token'), identityPort),
    ).resolves.toMatchObject({ session: { user: { bindings: { telegramId: '1005' } } } });

    fakes.cookieSet.mockClear();
    await expect(
      exchangeTelegramInitData(telegramInitData('widget-bot-token'), identityPort),
    ).resolves.toBeNull();
    expect(fakes.cookieSet).not.toHaveBeenCalled();
  });

  it('does not mint a staff session through the patient Mini App surface', async () => {
    vi.mocked(identityPort.resolveByChannelBinding).mockResolvedValueOnce({
      user: {
        userId: '00000000-0000-4000-8000-000000001005',
        role: 'doctor',
        displayName: 'Test doctor',
        bindings: { telegramId: '1005' },
        contacts: [],
        sessionEpoch: 0,
      },
      accountOutcome: 'linked_existing',
    });

    await expect(
      exchangeTelegramInitData(telegramInitData('delivery-bot-token'), identityPort),
    ).rejects.toThrow('auth_surface_role_mismatch');
    expect(fakes.cookieSet).not.toHaveBeenCalled();
  });
});
