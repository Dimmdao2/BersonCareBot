import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  ensureAuthModulePortsBound: vi.fn(),
  buildAppDeps: vi.fn(),
  identifyPublicBookingPayer: vi.fn(),
  createVerifiedPublicBooking: vi.fn(),
  isPublicBookingConfirmRateLimited: vi.fn(),
  resolvePublicBookingRateLimitClientKey: vi.fn(),
  consumePublicBookingVerification: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
  withPatientIdentityPrincipal: vi.fn(),
  findByUserId: vi.fn(),
  setSessionFromUser: vi.fn(),
  getBookingPaymentStatus: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/booking/identifyPublicBookingPayer', () => ({
  identifyPublicBookingPayer: fakes.identifyPublicBookingPayer,
}));
vi.mock('@/app-layer/booking/createVerifiedPublicBooking', () => ({
  createVerifiedPublicBooking: fakes.createVerifiedPublicBooking,
}));
vi.mock('@/modules/public-booking/publicBookingRateLimit', () => ({
  PUBLIC_BOOKING_CONFIRM_RATE_LIMIT_SEC: 60,
  isPublicBookingConfirmRateLimited: fakes.isPublicBookingConfirmRateLimited,
  resolvePublicBookingRateLimitClientKey: fakes.resolvePublicBookingRateLimitClientKey,
}));
vi.mock('@/modules/public-booking/publicBookingVerification', () => ({
  consumePublicBookingVerification: fakes.consumePublicBookingVerification,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
  withPatientIdentityPrincipal: fakes.withPatientIdentityPrincipal,
}));
vi.mock('@/modules/patient-booking/inPersonBookingResolve', () => ({
  InPersonBookingResolveError: class InPersonBookingResolveError extends Error {},
}));

import { POST } from './route';

const payer = { userId: 'payer-user', role: 'client' as const };
const intent = {
  organizationId: 'org-1',
  contactPhone: '+79990000000',
  contactName: 'Payer',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.resolvePublicBookingRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-1' });
  fakes.isPublicBookingConfirmRateLimited.mockResolvedValue(false);
  fakes.consumePublicBookingVerification.mockResolvedValue({ ok: true, verified: { intent } });
  fakes.identifyPublicBookingPayer.mockResolvedValue({ ok: true, platformUserId: payer.userId });
  fakes.findByUserId.mockResolvedValue(payer);
  fakes.createVerifiedPublicBooking.mockResolvedValue({ id: 'booking-1', status: 'awaiting_payment' });
  fakes.getBookingPaymentStatus.mockResolvedValue({
    ok: true,
    summary: { intent: { checkoutUrl: 'https://pay.example.test/checkout' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    auth: { setSessionFromUser: fakes.setSessionFromUser },
    userByPhone: { findByUserId: fakes.findByUserId },
    patientBooking: { getBookingPaymentStatus: fakes.getBookingPaymentStatus },
  });
  fakes.withExplicitOrganizationPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
  fakes.withPatientIdentityPrincipal.mockImplementation(
    (_principal: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe('B1.2 SMS booking confirmation', () => {
  it('keeps the canonical SMS payer in the normal patient session and payment door', async () => {
    const response = await POST(
      new Request('http://localhost/api/booking/public/create/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, checkoutUrl: 'https://pay.example.test/checkout' });
    expect(fakes.setSessionFromUser).toHaveBeenCalledWith(payer);
    expect(fakes.createVerifiedPublicBooking).toHaveBeenCalledWith(
      expect.anything(),
      intent,
      payer.userId,
    );
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith('booking-1', payer.userId);
  });

  // Читать личную строку человека под bootstrap-принципалом нельзя: у класса `pre_session` нет
  // реляционной двери, и до 19.08 этот шаг падал с «Missing declared webapp port capability:
  // pre_session» — то есть подтверждение записи не доходило до создания вовсе.
  it('reads the person for the session under that person own patient principal', async () => {
    await POST(
      new Request('http://localhost/api/booking/public/create/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }),
      }),
    );

    expect(fakes.withPatientIdentityPrincipal).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: payer.userId }),
      expect.any(Function),
    );
  });

  // Отказ на записи больше не молчит: снаружи по-прежнему нейтральный 503 (аноним не должен узнать
  // причину), но причина обязана оказаться в логе — именно её отсутствие держало воронку мёртвой
  // с 12.08 незамеченной.
  it('answers a neutral 503 and does not swallow the reason when the write fails', async () => {
    fakes.createVerifiedPublicBooking.mockRejectedValue(new Error('canonical_booking_unavailable'));

    const response = await POST(
      new Request('http://localhost/api/booking/public/create/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: 'canonical_booking_unavailable' });
  });
});
