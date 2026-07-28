import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgProductsPort } from './pgProducts';

const { getDrizzleMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

const productRow = {
  id: 'prod-1',
  organizationId: 'org-1',
  productType: 'single_visit',
  title: 'Single visit',
  description: null,
  priceMinor: 5000,
  currency: 'RUB',
  compositionJson: {},
  accessRulesJson: {},
  paymentRulesJson: {},
  validityDays: null,
  courseId: null,
  subscriptionPackageId: null,
  showInPatientCatalog: true,
  payByLinkEnabled: false,
  isActive: true,
};

describe('createPgProductsPort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates products inside a Drizzle transaction', async () => {
    const returning = vi.fn(async () => [productRow]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      insert: vi.fn(() => {
        throw new Error('db insert should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProductsPort();
    const result = await port.upsertProduct({
      organizationId: 'org-1',
      productType: 'single_visit',
      title: 'Single visit',
      priceMinor: 5000,
    });

    expect(result).toEqual(expect.objectContaining({ id: 'prod-1', organizationId: 'org-1' }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates products inside a Drizzle transaction', async () => {
    const returning = vi.fn(async () => [{ ...productRow, title: 'Updated visit' }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const tx = { update };
    const db = {
      update: vi.fn(() => {
        throw new Error('db update should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProductsPort();
    const result = await port.upsertProduct({
      id: 'prod-1',
      organizationId: 'org-1',
      productType: 'single_visit',
      title: 'Updated visit',
      priceMinor: 5000,
    });

    expect(result).toEqual(expect.objectContaining({ id: 'prod-1', title: 'Updated visit' }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('creates pay links inside a Drizzle transaction', async () => {
    const returning = vi.fn(async () => [
      {
        id: 'link-1',
        organizationId: 'org-1',
        productId: 'prod-1',
        token: 'token-1',
        expiresAt: null,
        maxUses: null,
        useCount: 0,
        isActive: true,
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      insert: vi.fn(() => {
        throw new Error('db insert should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProductsPort();
    const result = await port.createPayLink({
      organizationId: 'org-1',
      productId: 'prod-1',
      token: 'token-1',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'link-1', token: 'token-1' }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates purchase status inside a Drizzle transaction', async () => {
    const purchaseRow = {
      id: 'purchase-1',
      organizationId: 'org-1',
      productId: 'prod-1',
      productType: 'single_visit',
      platformUserId: 'user-1',
      buyerPhoneNormalized: null,
      giftRecipientPhoneNormalized: null,
      status: 'used',
      title: 'Single visit',
      priceMinor: 5000,
      currency: 'RUB',
      validityDays: null,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: { visitsRemaining: 0 },
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    };
    const returning = vi.fn(async () => [purchaseRow]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const tx = { update };
    const db = {
      update: vi.fn(() => {
        throw new Error('db update should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProductsPort();
    const result = await port.setPurchaseStatus('purchase-1', 'org-1', 'used', {
      fulfillmentJson: { visitsRemaining: 0 },
    });

    expect(result).toEqual(expect.objectContaining({ id: 'purchase-1', status: 'used' }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('appends product history inside a Drizzle transaction', async () => {
    const values = vi.fn(async () => undefined);
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      insert: vi.fn(() => {
        throw new Error('db insert should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgProductsPort();
    await port.appendHistoryEvent({
      organizationId: 'org-1',
      productPurchaseId: 'purchase-1',
      eventType: 'visit_consumed',
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
