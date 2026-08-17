export type ManualInvoiceFailure = Readonly<{
  status: 404 | 409 | 422 | 501 | 502 | 503;
  error: string;
}>;

const DATABASE_UNAVAILABLE_CODES = new Set([
  '40001',
  '40P01',
  '42501',
  '53300',
  '53400',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function rawErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim().slice(0, 32) : null;
}

function errorCode(error: unknown): string | null {
  const code = rawErrorCode(error);
  if (!code) return null;
  if (DATABASE_UNAVAILABLE_CODES.has(code)) return code;
  // PostgreSQL SQLSTATEs are exactly five upper-case alphanumerics. Keep only that bounded
  // diagnostic class; arbitrary provider `code` values may contain customer or fiscal data.
  return /^[0-9A-Z]{5}$/u.test(code) ? code : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function diagnosticRoot(error: unknown): string {
  const message = errorMessage(error);
  const code = errorCode(error);
  if (code && (DATABASE_UNAVAILABLE_CODES.has(code) || code.startsWith('08'))) {
    return 'database_unavailable';
  }
  if (message === 'organization_not_found') return 'organization_not_found';
  if (message.startsWith('saas_billing_receipt_') || message.startsWith('payment_receipt_')) {
    return 'fiscal_data_invalid';
  }
  if (message.startsWith('saas_billing_provider_invoices_unsupported')) {
    return 'provider_invoices_unsupported';
  }
  if (
    message === 'yookassa_credentials_missing' ||
    message.startsWith('saas_billing_payment_provider_unavailable')
  ) {
    return 'provider_unavailable';
  }
  if (message.startsWith('yookassa_create_invoice_failed')) {
    const status = /^yookassa_create_invoice_failed:(\d{3})(?::|$)/.exec(message)?.[1];
    return status ? `provider_invoice_refused_${status}` : 'provider_invoice_refused';
  }
  if (
    message === 'yookassa_missing_invoice_fields' ||
    message === 'saas_billing_checkout_unavailable' ||
    message === 'provider_temporarily_unavailable'
  ) {
    return 'provider_invalid_or_unavailable';
  }
  if (message.startsWith('saas_billing_manual_invoice_')) return 'manual_invoice_validation';
  if (message.startsWith('saas_billing_')) return 'saas_billing_domain';
  return 'unclassified';
}

/** Redacted root cause only: no raw provider response, fiscal fields, or customer data. */
export function manualInvoiceFailureDiagnostic(error: unknown) {
  return {
    event: 'saas_billing_manual_invoice_failed',
    errorName: error instanceof Error ? 'Error' : 'NonError',
    errorCode: errorCode(error),
    root: diagnosticRoot(error),
  } as const;
}

export function mapManualInvoiceFailure(error: unknown): ManualInvoiceFailure {
  const message = errorMessage(error);
  const code = errorCode(error);
  if (code && (DATABASE_UNAVAILABLE_CODES.has(code) || code.startsWith('08'))) {
    return { status: 503, error: 'saas_billing_database_unavailable' };
  }
  if (message === 'organization_not_found') {
    return { status: 404, error: message };
  }
  if (
    message === 'saas_billing_no_tariff_assigned' ||
    message === 'saas_billing_tariff_not_billable' ||
    message === 'saas_billing_subscription_not_found'
  ) {
    return { status: 409, error: message };
  }
  if (
    message === 'saas_billing_manual_invoice_amount_must_be_positive_integer' ||
    message === 'saas_billing_manual_invoice_description_required' ||
    message === 'saas_billing_manual_invoice_expiry_invalid'
  ) {
    return { status: 422, error: message };
  }
  if (message.startsWith('saas_billing_receipt_') || message.startsWith('payment_receipt_')) {
    return { status: 422, error: 'saas_billing_fiscal_data_invalid' };
  }
  if (message.startsWith('saas_billing_provider_invoices_unsupported')) {
    return { status: 501, error: 'saas_billing_provider_invoices_unsupported' };
  }
  if (
    message === 'yookassa_credentials_missing' ||
    message.startsWith('saas_billing_payment_provider_unavailable')
  ) {
    return { status: 503, error: 'saas_billing_payment_provider_unavailable' };
  }
  if (
    message.startsWith('yookassa_create_invoice_failed') ||
    message === 'yookassa_missing_invoice_fields' ||
    message === 'saas_billing_checkout_unavailable' ||
    message === 'provider_temporarily_unavailable'
  ) {
    return { status: 502, error: 'saas_billing_provider_rejected_invoice' };
  }
  return { status: 503, error: 'saas_billing_manual_invoice_unavailable' };
}
