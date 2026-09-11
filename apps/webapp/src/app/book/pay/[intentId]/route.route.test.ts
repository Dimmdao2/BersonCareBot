import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  buildAppDeps: vi.fn(),
  readAppointmentPaymentCheck: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import { GET } from './route';

const intentId = '0a1d74ef-98e8-4cf3-924c-8d1baea7ba23';
const providerUrl = 'https://provider.example.test/private-checkout/secret';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.buildAppDeps.mockReturnValue({
    payments: { readAppointmentPaymentCheck: fakes.readAppointmentPaymentCheck },
  });
});

function request(id = intentId) {
  return GET(new Request(`https://clinic.example.test/book/pay/${id}`), {
    params: Promise.resolve({ intentId: id }),
  });
}

describe('anonymous appointment payment check route', () => {
  it('does not reveal whether a dead invoice UUID exists', async () => {
    fakes.readAppointmentPaymentCheck.mockImplementation(async (id: string) =>
      id === intentId
        ? {
            alive: false,
            amountMinor: 12_500,
            currency: 'RUB',
            paymentDeadlineAt: '2026-09-12T08:00:00.000Z',
            appointmentStatus: 'cancelled_by_specialist',
            providerCheckoutUrl: null,
          }
        : {
            alive: false,
            amountMinor: null,
            currency: null,
            paymentDeadlineAt: null,
            appointmentStatus: null,
            providerCheckoutUrl: null,
          },
    );

    async function snapshot(id: string) {
      const response = await request(id);
      return {
        status: response.status,
        cacheControl: response.headers.get('cache-control'),
        contentType: response.headers.get('content-type'),
        location: response.headers.get('location'),
        body: await response.text(),
      };
    }

    const dead = await snapshot(intentId);
    const unknown = await snapshot('0a1d74ef-98e8-4cf3-924c-8d1baea7ba24');
    const malformed = await snapshot('not-a-uuid');

    expect(unknown).toEqual(dead);
    expect(malformed).toEqual(dead);
  });

  it('redirects a live invoice to its internal provider continuation', async () => {
    fakes.readAppointmentPaymentCheck.mockResolvedValue({
      alive: true,
      amountMinor: 12_500,
      currency: 'RUB',
      paymentDeadlineAt: '2026-09-12T08:00:00.000Z',
      appointmentStatus: 'awaiting_payment',
      providerCheckoutUrl: providerUrl,
    });

    const response = await request();

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(providerUrl);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not disclose or link the provider when the same invoice is dead', async () => {
    fakes.readAppointmentPaymentCheck.mockResolvedValue({
      alive: false,
      amountMinor: 12_500,
      currency: 'RUB',
      paymentDeadlineAt: '2026-09-12T08:00:00.000Z',
      appointmentStatus: 'cancelled_by_specialist',
      // Deliberately present in the fake: the HTTP boundary must still refuse to expose it.
      providerCheckoutUrl: providerUrl,
      patientName: 'PRIVATE PATIENT SENTINEL',
    });

    const response = await request();
    const body = await response.text();

    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(body).not.toContain(providerUrl);
    expect(body).not.toContain('PRIVATE PATIENT SENTINEL');
  });

  /**
   * Наш сбой не имеет права объявлять живую бронь отменённой: человек прочитает это как
   * окончательный ответ, перестанет платить и потеряет слот по-настоящему. Отказ проверки должен
   * читаться как «попробуйте позже», а не как «всё, поздно».
   */
  it('does not call a live booking cancelled when the check itself failed', async () => {
    fakes.readAppointmentPaymentCheck.mockRejectedValue(new Error('db is down'));

    const response = await request();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
