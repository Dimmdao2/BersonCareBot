export type ManualInvoiceFailure = Readonly<{
  status: 404 | 409 | 422 | 501 | 502 | 503;
  error: string;
}>;

import {
  PaymentProviderRequestRefusedError,
  PaymentProviderTransportError,
} from '@/modules/payments/providerPort';
import { ExternalFetchTimeoutError } from '@/shared/lib/externalFetch';

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

type TrustedInfrastructureFailure = Readonly<{
  code: string | null;
}>;

const trustedInfrastructureFailures = new WeakMap<Error, TrustedInfrastructureFailure>();

function rawErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim().slice(0, 32) : null;
}

function trustedInfrastructureFailure(error: unknown): TrustedInfrastructureFailure | null {
  return error instanceof Error ? (trustedInfrastructureFailures.get(error) ?? null) : null;
}

function markTrustedInfrastructureFailure(error: unknown, code: string | null): Error {
  const failure = new Error('saas_billing_database_unavailable', { cause: error });
  trustedInfrastructureFailures.set(failure, { code });
  return failure;
}

export async function withManualInvoiceDatabaseBoundary<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = rawErrorCode(error);
    if (code && DATABASE_UNAVAILABLE_CODES.has(code)) {
      throw markTrustedInfrastructureFailure(error, code);
    }
    throw error;
  }
}

export async function withManualInvoiceProviderTransportBoundary<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PaymentProviderTransportError) {
      throw markTrustedInfrastructureFailure(error, error.transportCode);
    }
    if (error instanceof ExternalFetchTimeoutError) {
      throw markTrustedInfrastructureFailure(error, 'ETIMEDOUT');
    }
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function diagnosticRoot(error: unknown): string {
  const message = errorMessage(error);
  if (trustedInfrastructureFailure(error)) return 'database_unavailable';
  if (error instanceof PaymentProviderRequestRefusedError) return 'provider_invoice_refused';
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
  const infrastructureFailure = trustedInfrastructureFailure(error);
  return {
    event: 'saas_billing_manual_invoice_failed',
    errorName: error instanceof Error ? 'Error' : 'NonError',
    errorCode: infrastructureFailure?.code ?? null,
    root: diagnosticRoot(error),
  } as const;
}

export function mapManualInvoiceFailure(error: unknown): ManualInvoiceFailure {
  const message = errorMessage(error);
  if (trustedInfrastructureFailure(error)) {
    return { status: 503, error: 'saas_billing_database_unavailable' };
  }
  if (error instanceof PaymentProviderRequestRefusedError) {
    return { status: 502, error: 'saas_billing_provider_rejected_invoice' };
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
    message === 'yookassa_missing_invoice_fields' ||
    message === 'saas_billing_checkout_unavailable' ||
    message === 'provider_temporarily_unavailable'
  ) {
    return { status: 502, error: 'saas_billing_provider_rejected_invoice' };
  }
  return { status: 503, error: 'saas_billing_manual_invoice_unavailable' };
}
