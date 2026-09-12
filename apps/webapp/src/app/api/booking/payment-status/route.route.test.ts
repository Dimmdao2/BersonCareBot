import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  RESOLVED_SURFACE_HEADER,
  serializeResolvedSurface,
} from '@/shared/lib/surface/requestSurface';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  getBookingPaymentStatus: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));

import { GET } from './route';

const bookingId = 'booking-owner';
const patientOrigin = 'https://patient.example.test';

function request() {
  return new Request(`http://localhost/api/booking/payment-status?bookingId=${bookingId}`, {
    headers: {
      [RESOLVED_SURFACE_HEADER]: serializeResolvedSurface({
        surface: 'patient_default',
        publicOrigin: patientOrigin,
        authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: 'owner-user' } },
  });
  fakes.buildAppDeps.mockReturnValue({
    patientBooking: {
      getBookingPaymentStatus: fakes.getBookingPaymentStatus,
    },
  });
});

describe('B1.2 booking payment status ownership', () => {
  it('returns payment status only through the authenticated booking owner identity', async () => {
    fakes.getBookingPaymentStatus.mockResolvedValue({
      ok: true,
      intentId: 'intent-1',
      amountMinor: 420000,
      currency: 'RUB',
      intentStatus: 'pending',
      checkoutUrl: `${patientOrigin}/book/pay/intent-1`,
      paymentDeadlineAt: '2026-09-12T09:30:00.000Z',
      appointmentStatus: 'awaiting_payment',
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      intentId: 'intent-1',
      amountMinor: 420000,
      currency: 'RUB',
      intentStatus: 'pending',
      checkoutUrl: `${patientOrigin}/book/pay/intent-1`,
      paymentDeadlineAt: '2026-09-12T09:30:00.000Z',
      appointmentStatus: 'awaiting_payment',
    });
    // Маршрут НЕ переустанавливает принципал: сессия пациента уже организационно-привязанная, а
    // рантайм не пускает пациентский контекст без организации к этому корню (живая проверка S9.4).
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith(bookingId, patientOrigin);
  });

  // Имя раньше обещало проверку СТЕНЫ («чужую бронь не видно»), а поймать её этот файл не может:
  // сервис здесь замокан, SQL не участвует. Настоящая стена живёт в корне и проверена живой
  // поломкой `omit_identity_filter` в `patient-booking-payment-status.devDbProof.test.mjs`.
  // Здесь остаётся ровно то, что тут действительно ловится: отказ корня не превращается в 200.
  it('turns a refused read into 404 and leaks nothing beyond the error code', async () => {
    fakes.getBookingPaymentStatus.mockResolvedValue({ ok: false, error: 'not_found' });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'not_found' });
    expect(fakes.getBookingPaymentStatus).toHaveBeenCalledWith(bookingId, patientOrigin);
  });
});
