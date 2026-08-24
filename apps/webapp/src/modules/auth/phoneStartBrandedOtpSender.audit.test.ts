/**
 * C3 audit (2026-08-24). Названная поломка: пациент входит с брендированного адреса клиники, а
 * OTP уходит в интегратор БЕЗ `clinicRequiredOrganizationId` — интегратор не видит
 * `senderScope: 'clinic_required'`, доставка остаётся `clinic_preferred` и код логина приносит
 * ПЛАТФОРМЕННЫЙ бот вместо бота клиники. Отказ дорогой (чужой отправитель в коде доступа) и
 * молчаливый (пациент код получает, ошибки нет).
 *
 * Существующий `phoneStartFallback.route.test.ts` жёстко замокан на `patient_default` и эту
 * ветку не исполняет: снятие обеих строк `clinicRequiredOrganizationId` в маршруте оставляет его
 * зелёным (проверено при аудите).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneOtpDelivery, DeferredPhoneOtpDelivery } from '@/modules/auth/smsPort';
import type { SessionUser } from '@/shared/types/session';

const BRANDED_ORG_ID = '00000000-0000-4000-8000-0000000c3001';

type StartPhoneAuth = (
  phone: string,
  context: { channel: 'web'; chatId: string; displayName?: string },
  options?: { delivery?: PhoneOtpDelivery; deferredDelivery?: DeferredPhoneOtpDelivery },
) => Promise<{ ok: true; challengeId: string; retryAfterSeconds?: number }>;

const fakes = vi.hoisted(() => ({
  surface: { current: 'patient_default' as 'patient_default' | 'patient_branded' },
  findByPhone: vi.fn(),
  startPhoneAuth: vi.fn<StartPhoneAuth>(),
  after: vi.fn<(task: () => Promise<void>) => void>(),
  isChannelEnabled: vi.fn<(channel: string) => Promise<boolean>>(),
  getClientVisiblePolicy: vi.fn(),
  resolveAuthOtpChannel: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: fakes.after };
});
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: () => 'registration-attempt',
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
  recordAuthRegistrationSuccess: vi.fn(),
}));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/verifiedStaffPrimaryLogin', () => ({
  prepareVerifiedPrimaryLogin: vi.fn(),
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: vi.fn().mockReturnValue(false),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isAuthChannelEnabled: fakes.isChannelEnabled,
  getClientVisibleAuthChannelPolicy: fakes.getClientVisiblePolicy,
}));
vi.mock('@/shared/lib/surface/requestSurface', () => ({
  requireResolvedSurface: () =>
    fakes.surface.current === 'patient_branded'
      ? {
          surface: 'patient_branded',
          publicOrigin: 'https://clinic.therapygo.test',
          organizationId: BRANDED_ORG_ID,
          clinicSlug: 'clinic',
          authPolicy: { availableMethods: [], enabledMethods: [] },
        }
      : {
          surface: 'patient_default',
          publicOrigin: 'https://app.example.test',
          authPolicy: { availableMethods: [], enabledMethods: [] },
        },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userByPhone: {
      findByPhone: fakes.findByPhone,
      getVerifiedEmailForUser: vi.fn(),
      isPhoneTrustedForUser: vi.fn(),
    },
    auth: {
      startPhoneAuth: fakes.startPhoneAuth,
      getPhoneChallenge: vi.fn(),
      confirmPhoneAuth: vi.fn(),
    },
    channelPreferences: { resolveAuthOtpChannel: fakes.resolveAuthOtpChannel },
  }),
}));

import { POST as startPhone } from '@/app/api/auth/phone/start/route';

const user: SessionUser = {
  userId: '00000000-0000-4000-8000-0000000c3777',
  role: 'client',
  displayName: 'Branded patient',
  bindings: { telegramId: 'tg-c3-777', maxId: 'max-c3-777' },
  sessionEpoch: 0,
  contacts: [
    {
      kind: 'phone',
      value: '+79995550101',
      isPrimary: true,
      confirmedAt: '2026-01-01T00:00:00.000Z',
      sourceOrigin: 'direct',
    },
  ],
};

function startRequest(): Request {
  return new Request('https://clinic.therapygo.test/api/auth/phone/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+79995550101' }),
  });
}

async function deliveryPassedToOtpPort(): Promise<PhoneOtpDelivery | undefined> {
  const pending = startPhone(startRequest());
  await vi.advanceTimersByTimeAsync(600);
  await pending;
  return fakes.startPhoneAuth.mock.calls[0]?.[2]?.delivery;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-24T05:00:00.000Z'));
  vi.clearAllMocks();
  fakes.after.mockImplementation(() => undefined);
  fakes.isChannelEnabled.mockResolvedValue(true);
  fakes.getClientVisiblePolicy.mockResolvedValue({
    email: true,
    sms: true,
    telegram: true,
    max: true,
  });
  fakes.findByPhone.mockResolvedValue(user);
  fakes.startPhoneAuth.mockResolvedValue({
    ok: true,
    challengeId: 'c3-audit-challenge',
    retryAfterSeconds: 60,
  });
});

describe('C3: OTP брендированного пациента требует бот клиники', () => {
  it('telegram с брендированного адреса несёт организацию клиники в порт доставки', async () => {
    fakes.surface.current = 'patient_branded';
    fakes.resolveAuthOtpChannel.mockResolvedValue('telegram');

    expect(await deliveryPassedToOtpPort()).toEqual({
      channel: 'telegram',
      recipientId: 'tg-c3-777',
      clinicRequiredOrganizationId: BRANDED_ORG_ID,
    });
  });

  it('MAX с брендированного адреса несёт организацию клиники в порт доставки', async () => {
    fakes.surface.current = 'patient_branded';
    fakes.resolveAuthOtpChannel.mockResolvedValue('max');

    expect(await deliveryPassedToOtpPort()).toEqual({
      channel: 'max',
      recipientId: 'max-c3-777',
      clinicRequiredOrganizationId: BRANDED_ORG_ID,
    });
  });

  it('небрендированная пациентская поверхность остаётся без clinic_required', async () => {
    fakes.surface.current = 'patient_default';
    fakes.resolveAuthOtpChannel.mockResolvedValue('telegram');

    expect(await deliveryPassedToOtpPort()).toEqual({
      channel: 'telegram',
      recipientId: 'tg-c3-777',
    });
  });
});
