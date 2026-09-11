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
    expect(response.headers.get('location')).toBeNull();
    expect(body).not.toContain(providerUrl);
    expect(body).not.toContain('PRIVATE PATIENT SENTINEL');
  });
});
