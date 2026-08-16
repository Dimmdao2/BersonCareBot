import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type { BookingPaymentSettings, PaymentProviderConfig } from '@/modules/payments/types';

type GetPaymentProviderAdapter =
  typeof import('@/infra/payments/paymentProviderRegistry').getPaymentProviderAdapter;

const registry = vi.hoisted(() => ({
  getPaymentProviderAdapter: vi.fn<GetPaymentProviderAdapter>(),
}));

vi.mock('@/infra/payments/paymentProviderRegistry', () => registry);

import { createRegistryAcquiringGateway } from './registryAcquiringGateway';

const providerConfig: PaymentProviderConfig = {
  id: 'yookassa',
  label: 'ЮKassa',
  enabled: true,
  shopId: 'test-shop',
  apiKey: 'test-key',
};

const createIntent = vi.fn<PaymentProviderPort['createIntent']>();
const providerAdapter: PaymentProviderPort = {
  createIntent,
  refund: vi.fn<PaymentProviderPort['refund']>(),
  inspectWebhook: vi.fn<PaymentProviderPort['inspectWebhook']>(),
  verifyWebhook: vi.fn<PaymentProviderPort['verifyWebhook']>(),
};

const providerAConfig: PaymentProviderConfig = {
  ...providerConfig,
  id: 'provider-a',
  label: 'Provider A',
};
const providerBConfig: PaymentProviderConfig = {
  ...providerConfig,
  id: 'provider-b',
  label: 'Provider B',
};

function settings(enabled: boolean): BookingPaymentSettings {
  return {
    enabled,
    defaultProviderId: providerConfig.id,
    providers: [providerConfig],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  registry.getPaymentProviderAdapter.mockReturnValue(providerAdapter);
  createIntent.mockResolvedValue({
    providerIntentRef: 'provider-intent-1074',
    checkoutUrl: 'https://checkout.example.test/1074',
  });
});

describe('registry acquiring provider boundary', () => {
  it('fails closed before adapter resolution when payments are globally disabled', async () => {
    const gateway = createRegistryAcquiringGateway({
      getConfig: async () => settings(false),
    });

    await expect(
      gateway.createCharge({
        organizationId: '00000000-0000-4000-8000-000000001074',
        patientUserId: '00000000-0000-4000-8000-000000001074',
        amountMinor: 12_345,
        currency: 'RUB',
        idempotencyKey: 'charge-1074-disabled',
        returnUrl: 'https://app.example.test/payments/return',
      }),
    ).resolves.toEqual({ ok: false, reason: 'payments_disabled' });
    expect(registry.getPaymentProviderAdapter).not.toHaveBeenCalled();
  });

  it('forwards the caller-owned charge identity without substituting provider fields', async () => {
    const gateway = createRegistryAcquiringGateway({
      getConfig: async () => settings(true),
    });

    await expect(
      gateway.createCharge({
        organizationId: '00000000-0000-4000-8000-000000001074',
        patientUserId: '00000000-0000-4000-8000-000000001074',
        amountMinor: 12_345,
        currency: 'RUB',
        idempotencyKey: 'charge-1074-stable',
        description: 'Test charge',
        returnUrl: 'https://app.example.test/payments/return',
      }),
    ).resolves.toEqual({
      ok: true,
      providerId: 'yookassa',
      providerPaymentId: 'provider-intent-1074',
      redirectUrl: 'https://checkout.example.test/1074',
    });

    expect(createIntent).toHaveBeenCalledWith({
      amountMinor: 12_345,
      currency: 'RUB',
      idempotencyKey: 'charge-1074-stable',
      payerRef: 'platform_user:00000000-0000-4000-8000-000000001074',
      purpose: 'patient_acquiring_charge',
      subjectRef: 'charge-1074-stable',
      returnUrl: 'https://app.example.test/payments/return',
      metadata: {
        patientUserId: '00000000-0000-4000-8000-000000001074',
        description: 'Test charge',
      },
      providerConfig,
    });
  });

  it('refunds through the original provider after the clinic default changes', async () => {
    let defaultProviderId = providerAConfig.id;
    const refundA = vi.fn<PaymentProviderPort['refund']>().mockResolvedValue({
      providerRefundRef: 'refund-a-1074',
    });
    const adapterA: PaymentProviderPort = { ...providerAdapter, refund: refundA };
    const adapterB: PaymentProviderPort = { ...providerAdapter, refund: vi.fn() };
    registry.getPaymentProviderAdapter.mockImplementation((providerId) =>
      providerId === providerAConfig.id ? adapterA : adapterB,
    );
    const gateway = createRegistryAcquiringGateway({
      getConfig: async () => ({
        enabled: true,
        defaultProviderId,
        providers: [providerAConfig, providerBConfig],
      }),
    });

    defaultProviderId = providerBConfig.id;
    await expect(
      gateway.refund({
        organizationId: '00000000-0000-4000-8000-000000001074',
        providerId: providerAConfig.id,
        providerPaymentId: 'provider-intent-a-1074',
        amountMinor: 12_345,
        currency: 'RUB',
        idempotencyKey: 'refund-1074',
      }),
    ).resolves.toEqual({ ok: true, providerRefundRef: 'refund-a-1074' });

    expect(registry.getPaymentProviderAdapter).toHaveBeenCalledWith(providerAConfig.id);
    expect(refundA).toHaveBeenCalledWith({
      providerIntentRef: 'provider-intent-a-1074',
      amountMinor: 12_345,
      currency: 'RUB',
      idempotencyKey: 'refund-1074',
      providerConfig: providerAConfig,
    });
    expect(adapterB.refund).not.toHaveBeenCalled();
  });
});
