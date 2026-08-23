/**
 * F4 audit-2 acceptance oracle.
 *
 * Поломка: маршрут доставки кода вызывает интеграторский шов `/api/bersoncare/send-sms`, не
 * спросив политику канала для поверхности запроса. Последствие: способ входа, выключенный
 * владельцем в настройках глобал-админа, продолжает слать реальные SMS. До 42fbd07d1 это ловил
 * собственный гейт интегратора (403 `auth_channel_disabled`); гейт удалён, и теперь единственная
 * защита — проверка на стороне вызывающего.
 *
 * Оракул независим от реализации: он смотрит только на то, дошло ли дело до шва доставки.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  publicValues: new Map<string, boolean>(),
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  requirePatientApiBusinessAccess: vi.fn(),
  buildAppDeps: vi.fn(),
  startPhoneAuth: vi.fn(),
  stampBootstrapPrincipal: vi.fn(),
  ensureAuthModulePortsBound: vi.fn(),
  identifyPublicBookingPayer: vi.fn(),
  isPublicBookingCreateRateLimited: vi.fn(),
  resolvePublicBookingRateLimitClientKey: vi.fn(),
  resolveSlugBoundPublicInPersonBookingOrganization: vi.fn(),
  resolveInPersonBookingContext: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
  deliverCode: vi.fn(),
  issueChallenge: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
  getPublicAuthChannelConfigured: async () => true,
}));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-bc-resolved-surface': encodeURIComponent(
        JSON.stringify({
          surface: 'patient_default',
          publicOrigin: 'https://patient.example.test',
          authPolicy: {
            availableMethods: ['password', 'email_code', 'phone_bot', 'totp', 'oauth', 'passkey'],
            enabledMethods: ['email_code'],
          },
        }),
      ),
    }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/app-layer/booking/identifyPublicBookingPayer', () => ({
  identifyPublicBookingPayer: fakes.identifyPublicBookingPayer,
}));
vi.mock('@/app-layer/booking/createVerifiedPublicBooking', () => ({
  createVerifiedPublicBooking: vi.fn(),
}));
vi.mock('@/modules/public-booking/publicBookingRateLimit', () => ({
  PUBLIC_BOOKING_RATE_LIMIT_SEC: 60,
  isPublicBookingCreateRateLimited: fakes.isPublicBookingCreateRateLimited,
  resolvePublicBookingRateLimitClientKey: fakes.resolvePublicBookingRateLimitClientKey,
}));
vi.mock('@/modules/patient-booking/inPersonBookingResolve', () => ({
  InPersonBookingResolveError: class InPersonBookingResolveError extends Error {},
  resolveSlugBoundPublicInPersonBookingOrganization:
    fakes.resolveSlugBoundPublicInPersonBookingOrganization,
  resolveInPersonBookingContext: fakes.resolveInPersonBookingContext,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));

import { POST as purgeOtpStart } from '@/app/api/patient/diary/purge-otp/start/route';
import { POST as publicBookingCreate } from '@/app/api/booking/public/create/route';

const branchId = '00000000-0000-4000-8000-000000000301';
const serviceId = '00000000-0000-4000-8000-000000000302';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.publicValues.clear();
  // Владелец выключил SMS на всех трёх поверхностях; включён только email.
  for (const surface of ['staff', 'platform_admin', 'patient'] as const) {
    fakes.publicValues.set(`auth_surface_${surface}_sms_enabled`, false);
    fakes.publicValues.set(`auth_surface_${surface}_email_enabled`, true);
  }
  fakes.getPublicRuntimeBool.mockImplementation(async (key) => {
    const value = fakes.publicValues.get(key);
    if (value === undefined) throw new Error(`missing public projection: ${key}`);
    return value;
  });
  fakes.startPhoneAuth.mockResolvedValue({ ok: true, challengeId: 'ch-1', retryAfterSeconds: 60 });
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'u-1', phone: '+79990000000' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    auth: { startPhoneAuth: fakes.startPhoneAuth },
    publicBookingVerification: {
      otp: { issueChallenge: fakes.issueChallenge },
      deliverCode: fakes.deliverCode,
    },
  });
  fakes.issueChallenge.mockResolvedValue(true);
  fakes.deliverCode.mockResolvedValue({ ok: true });
  fakes.resolvePublicBookingRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-1' });
  fakes.isPublicBookingCreateRateLimited.mockResolvedValue(false);
  fakes.identifyPublicBookingPayer.mockResolvedValue({ ok: false, error: 'no_session' });
  fakes.resolveSlugBoundPublicInPersonBookingOrganization.mockResolvedValue({
    organizationId: 'org-1',
    keys: { branchId, serviceId },
  });
  fakes.resolveInPersonBookingContext.mockResolvedValue({
    organizationId: 'org-1',
    branchId,
    serviceId,
  });
  fakes.withExplicitOrganizationPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe('delivery seams behind a disabled channel', () => {
  it('diary purge OTP does not reach SMS delivery when SMS is disabled on the request surface', async () => {
    const response = await purgeOtpStart();

    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
    expect(response.status).not.toBe(200);
  });

  it('anonymous public booking does not reach SMS delivery when SMS is disabled on the request surface', async () => {
    const response = await publicBookingCreate(
      new Request('http://patient.example.test/api/booking/public/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'in_person',
          orgSlug: 'clinic',
          branchId,
          serviceId,
          slotStart: '2026-08-10T10:00:00.000Z',
          slotEnd: '2026-08-10T10:30:00.000Z',
          contactName: 'Anon',
          contactPhone: '+79990000000',
          contactEmail: 'anon@example.test',
          proofMethod: 'sms',
        }),
      }),
    );

    expect(fakes.deliverCode).not.toHaveBeenCalled();
    expect(response.status).not.toBe(200);
  });
});
