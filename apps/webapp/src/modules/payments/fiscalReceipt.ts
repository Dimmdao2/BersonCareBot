import type { PaymentReceipt } from './providerPort';
import type { BookingPaymentSettings } from './types';

export function buildBookingPaymentReceipt(input: {
  settings: BookingPaymentSettings;
  providerId: string;
  customerEmail: string | null | undefined;
  description: string | null | undefined;
  amountMinor: number;
}): PaymentReceipt | undefined {
  if (input.providerId !== 'yookassa') return undefined;
  if (!input.settings.fiscalVatCode) {
    throw new Error('booking_payment_receipt_vat_code_missing');
  }
  const customerEmail = input.customerEmail?.trim();
  if (!customerEmail) throw new Error('booking_payment_receipt_customer_email_missing');

  return {
    customer: { email: customerEmail },
    items: [
      {
        description: input.description?.trim() || 'Оплата медицинской услуги',
        quantity: 1,
        amountMinor: input.amountMinor,
        vatCode: input.settings.fiscalVatCode,
        paymentSubject: 'service',
        paymentMode: 'full_prepayment',
        measure: 'piece',
      },
    ],
    ...(input.settings.fiscalTaxSystemCode
      ? { taxSystemCode: input.settings.fiscalTaxSystemCode }
      : {}),
  };
}
