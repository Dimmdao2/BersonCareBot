import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';

const resolvePurchaseOrganizationIdMock = vi.hoisted(() => vi.fn());
const getPurchaseDetailMock = vi.hoisted(() => vi.fn());
const captureProductPaymentMock = vi.hoisted(() => vi.fn());
const resolveUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    products: {
      resolvePurchaseOrganizationId: resolvePurchaseOrganizationIdMock,
      getPurchaseDetail: getPurchaseDetailMock,
      captureProductPayment: captureProductPaymentMock,
    },
  }),
}));

vi.mock('@/app-layer/platform-user/resolveOrCreateUserByPhone', () => ({
  resolveOrCreateUserByPhone: (...args: unknown[]) => resolveUserMock(...args),
}));

import { POST } from './route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const INTENT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_ID = '33333333-3333-4333-8333-333333333333';
const PHONE = '+79001234567';
let organizationSeenByUserWrite: string | undefined;
let organizationSeenByCaptureWrite: string | undefined;

function request() {
  return new Request('http://localhost/api/booking/public/products/payments/mock-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intentId: INTENT_ID,
      purchaseId: PURCHASE_ID,
      contactPhone: PHONE,
    }),
  });
}

describe('POST /api/booking/public/products/payments/mock-complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationSeenByUserWrite = undefined;
    organizationSeenByCaptureWrite = undefined;
    resolvePurchaseOrganizationIdMock.mockResolvedValue(ORG_ID);
    getPurchaseDetailMock.mockResolvedValue({
      purchase: {
        paymentIntentId: INTENT_ID,
        buyerPhoneNormalized: PHONE,
      },
    });
    resolveUserMock.mockImplementation(async () => {
      organizationSeenByUserWrite = getCurrentDbPrincipalOrganizationId();
      return { ok: true, userId: 'user-1' };
    });
    captureProductPaymentMock.mockImplementation(async () => {
      organizationSeenByCaptureWrite = getCurrentDbPrincipalOrganizationId();
    });
  });

  it('runs both public payment writes under the purchase organization principal', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('{"ok":true}');
    expect(organizationSeenByUserWrite).toBe(ORG_ID);
    expect(organizationSeenByCaptureWrite).toBe(ORG_ID);
  });

  it('preserves the public resolver failure response and skips payment capture', async () => {
    resolveUserMock.mockResolvedValueOnce({ ok: false, error: 'user_resolve_failed' });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('{"ok":false,"error":"user_resolve_failed"}');
    expect(captureProductPaymentMock).not.toHaveBeenCalled();
  });
});
