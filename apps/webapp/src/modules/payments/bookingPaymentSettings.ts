import type { BookingPaymentSettings, PaymentProviderConfig } from './types';

const YOOKASSA_VAT_CODES = new Set([
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
]);
const YOOKASSA_TAX_SYSTEM_CODES = new Set(['1', '2', '3', '4', '5', '6']);

function fiscalCode(value: unknown, allowed: ReadonlySet<string>): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && allowed.has(normalized) ? normalized : null;
}

function parseProviders(raw: unknown): PaymentProviderConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentProviderConfig[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    if (!id) continue;
    out.push({
      id,
      label: typeof o.label === 'string' ? o.label : id,
      enabled: o.enabled === true,
      webhookSecret: typeof o.webhookSecret === 'string' ? o.webhookSecret : undefined,
      apiKey: typeof o.apiKey === 'string' ? o.apiKey : undefined,
      shopId: typeof o.shopId === 'string' ? o.shopId : undefined,
      terminalKey: typeof o.terminalKey === 'string' ? o.terminalKey : undefined,
      publicId: typeof o.publicId === 'string' ? o.publicId : undefined,
      merchantLogin: typeof o.merchantLogin === 'string' ? o.merchantLogin : undefined,
      gatewayUrl: typeof o.gatewayUrl === 'string' ? o.gatewayUrl : undefined,
    });
  }
  return out;
}

export function parseBookingPaymentSettingsValue(envelope: unknown): BookingPaymentSettings {
  const defaults: BookingPaymentSettings = {
    enabled: false,
    defaultProviderId: 'yookassa',
    fiscalVatCode: null,
    fiscalTaxSystemCode: null,
    providers: [
      { id: 'yookassa', label: 'ЮKassa', enabled: false },
      { id: 'tinkoff', label: 'Тинькофф Касса', enabled: false },
      { id: 'cloudpayments', label: 'CloudPayments', enabled: false },
      { id: 'alfabank', label: 'Альфа-Банк', enabled: false },
    ],
  };
  if (envelope === null || typeof envelope !== 'object') return defaults;
  const inner =
    'value' in envelope && (envelope as Record<string, unknown>).value !== undefined
      ? (envelope as Record<string, unknown>).value
      : envelope;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return defaults;
  const o = inner as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    defaultProviderId:
      typeof o.defaultProviderId === 'string' && o.defaultProviderId.trim()
        ? o.defaultProviderId.trim()
        : defaults.defaultProviderId,
    fiscalVatCode: fiscalCode(o.fiscalVatCode, YOOKASSA_VAT_CODES),
    fiscalTaxSystemCode: fiscalCode(o.fiscalTaxSystemCode, YOOKASSA_TAX_SYSTEM_CODES),
    providers:
      parseProviders(o.providers).length > 0 ? parseProviders(o.providers) : defaults.providers,
  };
}

export function redactBookingPaymentProvidersForClient(
  settings: BookingPaymentSettings,
): BookingPaymentSettings {
  return {
    ...settings,
    providers: settings.providers.map((p) => ({
      ...p,
      webhookSecret: p.webhookSecret?.trim() ? '[REDACTED]' : '',
      apiKey: p.apiKey?.trim() ? '[REDACTED]' : '',
    })),
  };
}

/**
 * S5-0 safe projection contract for a future runtime/public payment-config row.
 * It is intentionally not wired into an existing response before S5-3 routes writes
 * through the split store; the current admin redaction contract remains unchanged.
 */
export function projectBookingPaymentPublicConfig(settings: BookingPaymentSettings): {
  enabled: boolean;
  defaultProviderId: string;
  providers: Array<{ id: string; label: string; enabled: boolean }>;
} {
  return {
    enabled: settings.enabled,
    defaultProviderId: settings.defaultProviderId,
    providers: settings.providers.map(({ id, label, enabled }) => ({ id, label, enabled })),
  };
}

export async function mergeBookingPaymentProvidersSecretsRetain(
  getPrevious: () => Promise<unknown>,
  incoming: unknown,
): Promise<{ value: unknown }> {
  const env =
    incoming !== null && typeof incoming === 'object' && 'value' in (incoming as object)
      ? (incoming as { value: unknown })
      : { value: incoming };
  const inner = env.value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return { value: inner };

  const prev = parseBookingPaymentSettingsValue(await getPrevious());
  const next = parseBookingPaymentSettingsValue({ value: inner });
  const mergedProviders = next.providers.map((p) => {
    const prevP = prev.providers.find((x) => x.id === p.id);
    const webhookSecret =
      p.webhookSecret?.trim() === '' || p.webhookSecret === '[REDACTED]'
        ? (prevP?.webhookSecret ?? '')
        : p.webhookSecret;
    const apiKey =
      p.apiKey?.trim() === '' || p.apiKey === '[REDACTED]' ? (prevP?.apiKey ?? '') : p.apiKey;
    return { ...p, webhookSecret, apiKey };
  });
  return {
    value: {
      enabled: next.enabled,
      defaultProviderId: next.defaultProviderId,
      fiscalVatCode: next.fiscalVatCode,
      fiscalTaxSystemCode: next.fiscalTaxSystemCode,
      providers: mergedProviders,
    },
  };
}
