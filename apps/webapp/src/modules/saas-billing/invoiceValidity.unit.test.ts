import { describe, expect, it } from 'vitest';
import {
  isSaasBillingInvoicePayable,
  saasBillingInvoiceExpiresAt,
  SAAS_BILLING_INVOICE_VALIDITY_DAYS,
} from './invoiceValidity';

describe('срок жизни счёта', () => {
  it('счёт живёт ровно константу владельца от момента выставления', () => {
    expect(SAAS_BILLING_INVOICE_VALIDITY_DAYS).toBe(30);
    expect(saasBillingInvoiceExpiresAt('2026-08-02T00:00:00.000Z')).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('оплатить можно только актуальный счёт', () => {
    const asOf = new Date('2026-08-18T12:00:00.000Z');
    const payable = { status: 'pending' as const, expiresAt: '2026-08-19T00:00:00.000Z' };

    expect(isSaasBillingInvoicePayable(payable, asOf)).toBe(true);
    expect(
      isSaasBillingInvoicePayable({ ...payable, expiresAt: '2026-08-18T11:59:59.000Z' }, asOf),
    ).toBe(false);
  });

  it('счёт с наступившим исходом не оплачивается, каким бы ни был срок', () => {
    const asOf = new Date('2026-08-18T12:00:00.000Z');
    for (const status of ['paid', 'failed', 'void'] as const) {
      expect(isSaasBillingInvoicePayable({ status, expiresAt: null }, asOf)).toBe(false);
    }
  });

  it('счёт автопродления своего срока не имеет и остаётся оплачиваемым', () => {
    expect(
      isSaasBillingInvoicePayable(
        { status: 'draft', expiresAt: null },
        new Date('2027-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
