import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentProviderPort } from '@/modules/payments/providerPort';
import type {
  BookingPaymentSettings,
  PaymentProviderConfig,
} from '@/modules/payments/types';

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
        patientUserId: '00000000-0000-4000-8000-000000001074',
        amountMinor: 12_345,
        currency: 'RUB',
        idempotencyKey: 'charge-1074-disabled',
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
        patientUserId: '00000000-0000-4000-8000-000000001074',
        amountMinor: 12_345,
        currency: 'RUB',
        idempotencyKey: 'charge-1074-stable',
        description: 'Test charge',
        metadata: { returnUrl: 'https://app.example.test/payments/return' },
      }),
    ).resolves.toEqual({
      ok: true,
      providerPaymentId: 'provider-intent-1074',
      redirectUrl: 'https://checkout.example.test/1074',
    });

    expect(createIntent).toHaveBeenCalledWith({
      amountMinor: 12_345,
      currency: 'RUB',
      idempotencyKey: 'charge-1074-stable',
      metadata: {
        patientUserId: '00000000-0000-4000-8000-000000001074',
        description: 'Test charge',
        returnUrl: 'https://app.example.test/payments/return',
      },
      providerConfig,
    });
  });
});
