import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentsService } from './service';
import type { PaymentsPort } from './ports';
import type { BookingPaymentSettings, PaymentIntentRecord } from './types';

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
    ).resolves.toBe(intent);
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
    ).resolves.toBe(intent);
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
});
