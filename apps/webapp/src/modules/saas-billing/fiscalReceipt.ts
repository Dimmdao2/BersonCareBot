import type { PaymentReceipt } from '@/modules/payments/providerPort';
import type { SaasBillingInvoice } from './ports';
import type { SaasBillingPayeeRequisites } from './settings';

const RECEIPT_SNAPSHOT_KEY = '__bersoncare_fiscal_receipt';

function required(value: string | null, error: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(error);
  return normalized;
}

export function buildSaasBillingReceipt(
  invoice: SaasBillingInvoice,
  customerEmail: string | null,
  payeeRequisites: SaasBillingPayeeRequisites,
): PaymentReceipt {
  const description =
    invoice.description?.trim() ||
    `${invoice.tariffName}: ${invoice.servicePeriodStartsAt.slice(0, 10)}–${invoice.servicePeriodEndsAt.slice(0, 10)}`;
  return {
    customer: { email: required(customerEmail, 'saas_billing_receipt_customer_email_missing') },
    items: [
      {
        description,
        quantity: 1,
        amountMinor: invoice.amountMinor,
        vatCode: required(payeeRequisites.vatCode, 'saas_billing_receipt_vat_code_missing'),
        paymentSubject: 'service',
        paymentMode: 'full_prepayment',
        measure: 'piece',
      },
    ],
    ...(payeeRequisites.taxSystemCode ? { taxSystemCode: payeeRequisites.taxSystemCode } : {}),
  };
}

/** Partial refunds reuse the original payer, VAT and service description even after settings change. */
export function buildPartialRefundReceipt(
  invoice: SaasBillingInvoice,
  amountMinor: number,
): PaymentReceipt {
  const snapshot = invoice.tariffSnapshot?.[RECEIPT_SNAPSHOT_KEY];
  if (!isPaymentReceipt(snapshot)) throw new Error('saas_billing_refund_receipt_snapshot_missing');
  return {
    ...snapshot,
    items: snapshot.items.map((item, index) =>
      index === 0 ? { ...item, amountMinor, quantity: 1 } : item,
    ),
  };
}

export function withReceiptSnapshot(
  tariffSnapshot: Record<string, unknown> | null,
  receipt: PaymentReceipt,
): Record<string, unknown> {
  return { ...(tariffSnapshot ?? {}), [RECEIPT_SNAPSHOT_KEY]: receipt };
}

function isPaymentReceipt(value: unknown): value is PaymentReceipt {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Partial<PaymentReceipt>;
  return (
    receipt.customer !== undefined &&
    typeof receipt.customer === 'object' &&
    receipt.customer !== null &&
    typeof receipt.customer.email === 'string' &&
    Array.isArray(receipt.items) &&
    receipt.items.length === 1 &&
    receipt.items.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.description === 'string' &&
        typeof item.quantity === 'number' &&
        typeof item.amountMinor === 'number' &&
        typeof item.vatCode === 'string' &&
        item.paymentSubject === 'service' &&
        item.paymentMode === 'full_prepayment' &&
        item.measure === 'piece',
    )
  );
}
