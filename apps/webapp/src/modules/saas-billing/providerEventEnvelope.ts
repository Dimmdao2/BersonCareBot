import type { SaasBillingProviderEventEnvelope } from './ports';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`saas_billing_provider_event_${field}_invalid`);
  }
  return value;
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

export function sanitizeSaasBillingProviderEventEnvelope(
  input: SaasBillingProviderEventEnvelope,
): SaasBillingProviderEventEnvelope {
  const candidate = input as unknown as Record<string, unknown>;
  const envelope: SaasBillingProviderEventEnvelope = {
    providerId: requiredString(candidate.providerId, 'provider_id'),
    providerEventId: requiredString(candidate.providerEventId, 'provider_event_id'),
    type: requiredString(candidate.type, 'type'),
  };

  const status = optionalString(candidate.status);
  const currency = optionalString(candidate.currency);
  const invoiceReference = optionalString(candidate.invoiceReference);
  const subscriptionReference = optionalString(candidate.subscriptionReference);
  const occurredAt = optionalString(candidate.occurredAt);
  if (status !== undefined) envelope.status = status;
  if (
    candidate.amountMinor === null ||
    (typeof candidate.amountMinor === 'number' && Number.isSafeInteger(candidate.amountMinor))
  ) {
    envelope.amountMinor = candidate.amountMinor;
  }
  if (currency !== undefined) envelope.currency = currency;
  if (invoiceReference !== undefined) envelope.invoiceReference = invoiceReference;
  if (subscriptionReference !== undefined) {
    envelope.subscriptionReference = subscriptionReference;
  }
  if (occurredAt !== undefined) envelope.occurredAt = occurredAt;
  return envelope;
}
