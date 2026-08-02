import type { PaymentProviderConfig } from '@/modules/payments/types';

export const DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID = 'yookassa';

export type SaasBillingLifecyclePolicy = {
  graceDays: number;
  chargeAttempts: number;
  readOnlyDays: number;
};

export type SaasBillingPayeeRequisites = {
  legalEntityType: string | null;
  taxIdentifier: string | null;
  registrationReasonCode: string | null;
  bankAccount: string | null;
  taxRegime: string | null;
  vatRate: string | null;
  /** YooKassa/FNS VAT code. `vatRate` remains a backward-compatible source for existing admin data. */
  vatCode: string | null;
  /** Conditional: external cash-register configurations can require it. */
  taxSystemCode: string | null;
};

export type SaasBillingPaymentProviderSettings = {
  defaultProviderId: string;
  providers: PaymentProviderConfig[];
  payeeRequisites: SaasBillingPayeeRequisites;
  lifecyclePolicy: SaasBillingLifecyclePolicy | null;
};

function unwrap(envelope: unknown): unknown {
  if (
    envelope !== null &&
    typeof envelope === 'object' &&
    !Array.isArray(envelope) &&
    'value' in envelope
  ) {
    return (envelope as Record<string, unknown>).value;
  }
  return envelope;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function parseProviders(raw: unknown): PaymentProviderConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const id = nullableString(row.id);
    if (!id) return [];
    return [
      {
        id,
        label: nullableString(row.label) ?? id,
        enabled: row.enabled === true,
        webhookSecret: nullableString(row.webhookSecret) ?? undefined,
        apiKey: nullableString(row.apiKey) ?? undefined,
        shopId: nullableString(row.shopId) ?? undefined,
        terminalKey: nullableString(row.terminalKey) ?? undefined,
        publicId: nullableString(row.publicId) ?? undefined,
        merchantLogin: nullableString(row.merchantLogin) ?? undefined,
        gatewayUrl: nullableString(row.gatewayUrl) ?? undefined,
      },
    ];
  });
}

function parsePayeeRequisites(raw: unknown): SaasBillingPayeeRequisites {
  const row =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    legalEntityType: nullableString(row.legalEntityType),
    taxIdentifier: nullableString(row.taxIdentifier),
    registrationReasonCode: nullableString(row.registrationReasonCode),
    bankAccount: nullableString(row.bankAccount),
    taxRegime: nullableString(row.taxRegime),
    vatRate: nullableString(row.vatRate),
    vatCode: nullableString(row.vatCode) ?? nullableString(row.vatRate),
    taxSystemCode: nullableString(row.taxSystemCode) ?? nullableString(row.taxRegime),
  };
}

function parseLifecyclePolicy(raw: unknown): SaasBillingLifecyclePolicy | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const graceDays = positiveInteger(row.graceDays);
  const chargeAttempts = positiveInteger(row.chargeAttempts);
  const readOnlyDays = positiveInteger(row.readOnlyDays);
  return graceDays && chargeAttempts && readOnlyDays
    ? { graceDays, chargeAttempts, readOnlyDays }
    : null;
}

export function parseSaasBillingPaymentProviderSettings(
  envelope: unknown,
): SaasBillingPaymentProviderSettings {
  const inner = unwrap(envelope);
  const row =
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : {};
  const providers = parseProviders(row.providers);
  return {
    defaultProviderId:
      nullableString(row.defaultProviderId) ?? DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID,
    providers:
      providers.length > 0
        ? providers
        : [
            {
              id: DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID,
              label: 'ЮKassa',
              enabled: true,
            },
          ],
    payeeRequisites: parsePayeeRequisites(row.payeeRequisites),
    lifecyclePolicy: parseLifecyclePolicy(row.lifecyclePolicy),
  };
}

function redactProvider(provider: PaymentProviderConfig): PaymentProviderConfig {
  return {
    ...provider,
    webhookSecret: provider.webhookSecret ? '[REDACTED]' : '',
    apiKey: provider.apiKey ? '[REDACTED]' : '',
  };
}

export function redactSaasBillingPaymentProviderValue(envelope: unknown): unknown {
  const value = parseSaasBillingPaymentProviderSettings(envelope);
  return { value: { ...value, providers: value.providers.map(redactProvider) } };
}

export async function mergeSaasBillingPaymentProviderSecretsRetain(
  getPrevious: () => Promise<unknown>,
  incoming: unknown,
): Promise<{ value: unknown }> {
  const previous = parseSaasBillingPaymentProviderSettings(await getPrevious());
  const next = parseSaasBillingPaymentProviderSettings(incoming);
  return {
    value: {
      ...next,
      providers: next.providers.map((provider) => {
        const previousProvider = previous.providers.find(({ id }) => id === provider.id);
        return {
          ...provider,
          webhookSecret:
            provider.webhookSecret === '[REDACTED]' || provider.webhookSecret === undefined
              ? previousProvider?.webhookSecret
              : provider.webhookSecret,
          apiKey:
            provider.apiKey === '[REDACTED]' || provider.apiKey === undefined
              ? previousProvider?.apiKey
              : provider.apiKey,
        };
      }),
    },
  };
}
