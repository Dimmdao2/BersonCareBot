import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentsService } from './service';
import type { PaymentsPort } from './ports';
import type { BookingPaymentSettings, PaymentIntentRecord, PaymentRecord } from './types';
import type { BeAppointment } from '@/modules/booking-engine/types';

const providerAdapter = vi.hoisted(() => ({
  createIntent: vi.fn(),
}));

vi.mock('@/infra/payments/paymentProviderRegistry', () => ({
  getPaymentProviderAdapter: vi.fn(() => providerAdapter),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const intent: PaymentIntentRecord = {
  id: 'intent-1',
  organizationId: 'org-1',
  idempotencyKey: 'key-1',
  providerId: 'yookassa',
  appointmentId: null,
  platformUserId: 'user-1',
  productRef: null,
  amountMinor: 10_000,
  currency: 'RUB',
  status: 'pending',
  purpose: 'appointment_prepayment',
  providerIntentRef: 'yk-1',
  checkoutUrl: 'https://yookassa.ru/checkout/intent-1',
};

function buildService(
  settings: BookingPaymentSettings = {
    enabled: false,
    defaultProviderId: '',
    providers: [],
  },
) {
  const port = {
    findIntentById: vi.fn(async (id: string) => (id === intent.id ? intent : null)),
  } as unknown as PaymentsPort;
  return createPaymentsService({
    port,
    config: {
      getBookingPaymentSettings: async () => settings,
    },
    captureUnitOfWork: {
      run: async (_orgId, fn) => fn(),
      runSerializedPostCommit: async (_orgId, _key, fn) => fn(),
    },
    bookingEngine: null,
  });
}

// B0.3a: the payment-status routes for packages and products fetch the intent by id and hand back
// its status/checkoutUrl. A valid intent id from another organization must never resolve — this is
// the one place an org boundary could quietly leak a stranger's payment state.
describe('getIntentForOrganization: org-scoped payment intent lookup', () => {
  it('returns the intent for its own organization', async () => {
    const service = buildService();
    const result = await service.getIntentForOrganization('intent-1', 'org-1');
    expect(result?.checkoutUrl).toBe('https://yookassa.ru/checkout/intent-1');
  });

  it('refuses a real intent id when queried under a different organization', async () => {
    const service = buildService();
    const result = await service.getIntentForOrganization('intent-1', 'org-2');
    expect(result).toBeNull();
  });

  it('returns null for an unknown intent id', async () => {
    const service = buildService();
    const result = await service.getIntentForOrganization('missing', 'org-1');
    expect(result).toBeNull();
  });
});

describe('B1.3 — prepayment provider availability', () => {
  it.each([
    [
      'payments are disabled globally',
      { enabled: false, defaultProviderId: '', providers: [] } satisfies BookingPaymentSettings,
      'payments_disabled',
    ],
    [
      'the default provider has no credentials',
      {
        enabled: true,
        defaultProviderId: 'yookassa',
        providers: [{ id: 'yookassa', label: 'YooKassa', enabled: true, shopId: 'shop-1' }],
      } satisfies BookingPaymentSettings,
      'payment_provider_unavailable',
    ],
  ] as const)('refuses an active policy when %s', async (_case, settings, reason) => {
    const availability = await buildService(settings).getPrepaymentAvailability('org-1');

    expect(availability).toEqual({ available: false, reason });
  });

  it('allows an active policy when payments and the default provider are usable', async () => {
    const availability = await buildService({
      enabled: true,
      defaultProviderId: 'yookassa',
      fiscalVatCode: '1',
      providers: [
        {
          id: 'yookassa',
          label: 'YooKassa',
          enabled: true,
          apiKey: 'api-key',
          shopId: 'shop-1',
        },
      ],
    }).getPrepaymentAvailability('org-1');

    expect(availability).toEqual({ available: true });
  });

  it('keeps payment_provider_unavailable as the booking-time guard', async () => {
    const payments = buildService({
      enabled: true,
      defaultProviderId: 'yookassa',
      providers: [{ id: 'yookassa', label: 'YooKassa', enabled: true, shopId: 'shop-1' }],
    });

    await expect(
      payments.createAppointmentPaymentIntent({
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        platformUserId: 'user-1',
        amountMinor: 1_000,
        currency: 'RUB',
        idempotencyKey: 'prepayment-1',
        returnUrl: 'https://example.test/pay',
      }),
    ).rejects.toThrow('payment_provider_unavailable');
  });
});

describe('payments tariff mechanic', () => {
  it('keeps stored provider URLs behind the check route in appointment link reads', async () => {
    const payments = createPaymentsService({
      port: {
        listAppointmentCheckoutUrls: vi.fn(async () => [
          {
            appointmentId: 'appointment-1',
            intentId: intent.id,
            purpose: 'appointment_prepayment',
            checkoutUrl: intent.checkoutUrl,
          },
        ]),
      } as unknown as PaymentsPort,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          providers: [],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
      resolvePatientPublicOrigin: async () => 'https://clinic.therapygo.test',
    });

    await expect(payments.listAppointmentCheckoutUrls('org-1', ['appointment-1'])).resolves.toEqual(
      [
        {
          appointmentId: 'appointment-1',
          checkoutUrl: `https://clinic.therapygo.test/book/pay/${intent.id}`,
        },
      ],
    );
  });

  it('keeps an existing payment intent available after payment acceptance is disabled', async () => {
    const payments = createPaymentsService({
      port: {
        findIntentByIdempotency: vi.fn(async () => intent),
      } as unknown as PaymentsPort,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          fiscalVatCode: '1',
          providers: [
            {
              id: 'yookassa',
              label: 'YooKassa',
              enabled: true,
              apiKey: 'api-key',
              shopId: 'shop-1',
            },
          ],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
      canCreatePaymentIntent: async () => false,
      resolvePatientPublicOrigin: async () => 'https://clinic.therapygo.test',
    });

    await expect(
      payments.createAppointmentPaymentIntent({
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        platformUserId: 'user-1',
        amountMinor: 10_000,
        currency: 'RUB',
        idempotencyKey: 'key-1',
        returnUrl: 'https://app.example.test/return',
      }),
    ).resolves.toMatchObject({
      id: intent.id,
      checkoutUrl: `https://clinic.therapygo.test/book/pay/${intent.id}`,
    });
  });

  it('refuses a direct new patient-payment request before the provider can create an intent', async () => {
    const port = {
      findIntentByIdempotency: vi.fn(async () => null),
    } as unknown as PaymentsPort;
    const payments = createPaymentsService({
      port,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          fiscalVatCode: '1',
          providers: [
            {
              id: 'yookassa',
              label: 'YooKassa',
              enabled: true,
              apiKey: 'api-key',
              shopId: 'shop-1',
            },
          ],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
      canCreatePaymentIntent: async () => false,
    });

    await expect(
      payments.createAppointmentPaymentIntent({
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        platformUserId: 'user-1',
        amountMinor: 10_000,
        currency: 'RUB',
        idempotencyKey: 'appointment-1:prepayment',
        returnUrl: 'https://app.example.test/return',
      }),
    ).rejects.toThrow('payments_disabled');
    expect(providerAdapter.createIntent).not.toHaveBeenCalled();
  });

  it('refuses a new package-payment intent before the provider can create it', async () => {
    const payments = createPaymentsService({
      port: {
        findIntentByIdempotency: vi.fn(async () => null),
      } as unknown as PaymentsPort,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          fiscalVatCode: '1',
          providers: [
            {
              id: 'yookassa',
              label: 'YooKassa',
              enabled: true,
              apiKey: 'api-key',
              shopId: 'shop-1',
            },
          ],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
      canCreatePaymentIntent: async () => false,
    });

    await expect(
      payments.createPackagePaymentIntent({
        organizationId: 'org-1',
        platformUserId: 'user-1',
        patientPackageId: 'patient-package-1',
        amountMinor: 10_000,
        currency: 'RUB',
        idempotencyKey: 'package:patient-package-1:offer',
        returnUrl: 'https://app.example.test/return',
      }),
    ).rejects.toThrow('payments_disabled');
    expect(providerAdapter.createIntent).not.toHaveBeenCalled();
  });

  it('creates a new payment intent when the tariff allows payment acceptance', async () => {
    const createdIntent = {
      providerIntentRef: 'yk-created-1',
      checkoutUrl: 'https://yookassa.ru/checkout/created-1',
    };
    providerAdapter.createIntent.mockResolvedValue(createdIntent);
    const createPaymentIntent = vi.fn(async () => intent);
    const payments = createPaymentsService({
      port: {
        findIntentByIdempotency: vi.fn(async () => null),
        createPaymentIntent,
        appendHistoryEvent: vi.fn(async () => undefined),
      } as unknown as PaymentsPort,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          fiscalVatCode: '1',
          providers: [
            {
              id: 'yookassa',
              label: 'YooKassa',
              enabled: true,
              apiKey: 'api-key',
              shopId: 'shop-1',
            },
          ],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
      canCreatePaymentIntent: async () => true,
      resolvePayerEmail: async () => 'patient@example.test',
      resolvePatientPublicOrigin: async () => 'https://clinic.therapygo.test',
    });

    await expect(
      payments.createAppointmentPaymentIntent({
        organizationId: 'org-1',
        appointmentId: 'appointment-1',
        platformUserId: 'user-1',
        amountMinor: 10_000,
        currency: 'RUB',
        idempotencyKey: 'appointment-1:prepayment',
        returnUrl: 'https://app.example.test/return',
      }),
    ).resolves.toMatchObject({
      id: intent.id,
      checkoutUrl: `https://clinic.therapygo.test/book/pay/${intent.id}`,
    });
    expect(providerAdapter.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({
          customer: { email: 'patient@example.test' },
          items: [expect.objectContaining({ amountMinor: 10_000, vatCode: '1' })],
        }),
      }),
    );
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        providerIntentRef: createdIntent.providerIntentRef,
      }),
    );
  });

  // S2.3: пока бронь держит слот, счёт у провайдера обязан умереть в ту же секунду, что и у нас.
  // Молчаливая поломка здесь стоит дорого и невидима: провайдер принимает деньги за время, которое
  // мы уже освободили и отдали другому пациенту, а возврат разбирают вручную.
  function buildExpiringService(adapterOverride?: { supportsInvoice?: boolean }) {
    if (adapterOverride) Object.assign(providerAdapter, adapterOverride);
    providerAdapter.createIntent.mockResolvedValue({
      providerIntentRef: 'yk-created-2',
      checkoutUrl: 'https://yookassa.ru/checkout/created-2',
    });
    return createPaymentsService({
      port: {
        findIntentByIdempotency: vi.fn(async () => null),
        createPaymentIntent: vi.fn(async () => intent),
        appendHistoryEvent: vi.fn(async () => undefined),
      } as unknown as PaymentsPort,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          fiscalVatCode: '1',
          providers: [
            {
              id: 'yookassa',
              label: 'YooKassa',
              enabled: true,
              apiKey: 'api-key',
              shopId: 'shop-1',
            },
          ],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: null,
      canCreatePaymentIntent: async () => true,
      resolvePayerEmail: async () => 'patient@example.test',
    });
  }

  const expiringInput = {
    organizationId: 'org-1',
    appointmentId: 'appointment-1',
    platformUserId: 'user-1',
    amountMinor: 10_000,
    currency: 'RUB',
    idempotencyKey: 'appointment-1:prepayment',
    returnUrl: 'https://app.example.test/return',
  };

  it('hands the appointment payment deadline to the provider as the invoice expiry', async () => {
    const payments = buildExpiringService({ supportsInvoice: true });
    await payments.createAppointmentPaymentIntent({
      ...expiringInput,
      expiresAt: '2026-09-11T21:40:00.000Z',
    });
    expect(providerAdapter.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({ expiresAt: '2026-09-11T21:40:00.000Z' }),
      }),
    );
  });

  it('refuses a deadline the provider cannot enforce instead of silently dropping it', async () => {
    const payments = buildExpiringService({ supportsInvoice: false });
    await expect(
      payments.createAppointmentPaymentIntent({
        ...expiringInput,
        expiresAt: '2026-09-11T21:40:00.000Z',
      }),
    ).rejects.toThrow('payment_provider_cannot_expire_invoice');
    expect(providerAdapter.createIntent).not.toHaveBeenCalled();
  });
});

describe('appointment-bound payment summary', () => {
  it('attributes only this appointment share of one captured multi-appointment payment', async () => {
    const appointment = {
      id: 'appointment-1',
      organizationId: 'org-1',
      serviceId: null,
      status: 'confirmed',
      paymentRef: 'payment-shared',
    } as unknown as BeAppointment;
    const sharedPayment: PaymentRecord = {
      id: 'payment-shared',
      organizationId: 'org-1',
      paymentIntentId: 'intent-shared',
      appointmentId: null,
      amountMinor: 20_000,
      currency: 'RUB',
      status: 'succeeded',
      providerId: 'yookassa',
      purpose: 'appointment_prepayment',
    };
    const port = {
      findPaymentById: vi.fn(async () => sharedPayment),
      countAppointmentsByPaymentRef: vi.fn(async () => 2),
      findIntentById: vi.fn(async () => null),
      findLatestIntentByAppointment: vi.fn(async () => null),
      listHistoryForAppointment: vi.fn(async () => []),
    } as unknown as PaymentsPort;
    const payments = createPaymentsService({
      port,
      config: {
        getBookingPaymentSettings: async () => ({
          enabled: true,
          defaultProviderId: 'yookassa',
          providers: [],
        }),
      },
      captureUnitOfWork: {
        run: async (_organizationId, fn) => fn(),
        runSerializedPostCommit: async (_organizationId, _key, fn) => fn(),
      },
      bookingEngine: {
        getAppointment: vi.fn(async () => appointment),
        listAppointmentsByChainId: vi.fn(async () => []),
        transitionAppointmentStatus: vi.fn(),
      },
    });

    const summary = await payments.getAppointmentPaymentSummary('appointment-1', 'org-1');

    expect(summary?.payment?.amountMinor).toBe(10_000);
    expect(port.countAppointmentsByPaymentRef).toHaveBeenCalledWith('payment-shared', 'org-1');
  });
});
