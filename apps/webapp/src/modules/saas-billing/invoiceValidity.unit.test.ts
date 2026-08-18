import { describe, expect, it } from 'vitest';
import {
  isSaasBillingInvoicePayable,
  saasBillingInvoiceExpiresAt,
  SAAS_BILLING_INVOICE_VALIDITY_DAYS,
} from './invoiceValidity';

describe('срок жизни счёта', () => {
  it('счёт живёт ровно столько дней, сколько передал вызывающий', () => {
    expect(saasBillingInvoiceExpiresAt('2026-08-02T00:00:00.000Z', 30)).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(saasBillingInvoiceExpiresAt('2026-08-02T00:00:00.000Z', 7)).toBe(
      '2026-08-09T00:00:00.000Z',
    );
  });

  it('дефолт остаётся дефолтом, а не политикой: он ничего не решает сам', () => {
    expect(SAAS_BILLING_INVOICE_VALIDITY_DAYS).toBe(30);
    // Срок НЕ вычисляется без явно переданного числа — иначе где-то снова заведётся второй дом.
    expect(() =>
      (saasBillingInvoiceExpiresAt as (issuedAt: string) => string)('2026-08-02T00:00:00.000Z'),
    ).toThrow('saas_billing_invoice_validity_days_invalid');
  });

  it('бессмысленный срок отвергается, а не превращается в счёт, который нельзя оплатить', () => {
    for (const days of [0, -1, 1.5, Number.NaN]) {
      expect(() => saasBillingInvoiceExpiresAt('2026-08-02T00:00:00.000Z', days)).toThrow(
        'saas_billing_invoice_validity_days_invalid',
      );
    }
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
