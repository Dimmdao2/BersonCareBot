import { describe, expect, it, vi } from 'vitest';
import { createPaymentsService } from './service';
import type { PaymentsPort } from './ports';
import type { PaymentIntentRecord } from './types';

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

function buildService() {
  const port = {
    findIntentById: vi.fn(async (id: string) => (id === intent.id ? intent : null)),
  } as unknown as PaymentsPort;
  return createPaymentsService({
    port,
    config: {
      getBookingPaymentSettings: async () => ({
        enabled: false,
        defaultProviderId: '',
        providers: [],
      }),
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
