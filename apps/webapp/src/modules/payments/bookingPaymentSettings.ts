import type { BookingPaymentSettings, PaymentProviderConfig } from "./types";

function parseProviders(raw: unknown): PaymentProviderConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentProviderConfig[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) continue;
    out.push({
      id,
      label: typeof o.label === "string" ? o.label : id,
      enabled: o.enabled === true,
      webhookSecret: typeof o.webhookSecret === "string" ? o.webhookSecret : undefined,
      apiKey: typeof o.apiKey === "string" ? o.apiKey : undefined,
      shopId: typeof o.shopId === "string" ? o.shopId : undefined,
    });
  }
  return out;
}

export function parseBookingPaymentSettingsValue(envelope: unknown): BookingPaymentSettings {
  const defaults: BookingPaymentSettings = {
    enabled: false,
    defaultProviderId: "mock",
    providers: [{ id: "mock", label: "Тестовый (mock)", enabled: true }],
  };
  if (envelope === null || typeof envelope !== "object") return defaults;
  const inner =
    "value" in envelope && (envelope as Record<string, unknown>).value !== undefined
      ? (envelope as Record<string, unknown>).value
      : envelope;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return defaults;
  const o = inner as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    defaultProviderId:
      typeof o.defaultProviderId === "string" && o.defaultProviderId.trim()
        ? o.defaultProviderId.trim()
        : defaults.defaultProviderId,
    providers: parseProviders(o.providers).length > 0 ? parseProviders(o.providers) : defaults.providers,
  };
}

export function redactBookingPaymentProvidersForClient(settings: BookingPaymentSettings): BookingPaymentSettings {
  return {
    ...settings,
    providers: settings.providers.map((p) => ({
      ...p,
      webhookSecret: p.webhookSecret?.trim() ? "[REDACTED]" : "",
      apiKey: p.apiKey?.trim() ? "[REDACTED]" : "",
    })),
  };
}

export async function mergeBookingPaymentProvidersSecretsRetain(
  getPrevious: () => Promise<unknown>,
  incoming: unknown,
): Promise<{ value: unknown }> {
  const env =
    incoming !== null && typeof incoming === "object" && "value" in (incoming as object)
      ? (incoming as { value: unknown })
      : { value: incoming };
  const inner = env.value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return { value: inner };

  const prev = parseBookingPaymentSettingsValue(await getPrevious());
  const next = parseBookingPaymentSettingsValue({ value: inner });
  const mergedProviders = next.providers.map((p) => {
    const prevP = prev.providers.find((x) => x.id === p.id);
    const webhookSecret =
      p.webhookSecret?.trim() === "" || p.webhookSecret === "[REDACTED]"
        ? prevP?.webhookSecret ?? ""
        : p.webhookSecret;
    const apiKey =
      p.apiKey?.trim() === "" || p.apiKey === "[REDACTED]" ? prevP?.apiKey ?? "" : p.apiKey;
    return { ...p, webhookSecret, apiKey };
  });
  return {
    value: {
      enabled: next.enabled,
      defaultProviderId: next.defaultProviderId,
      providers: mergedProviders,
    },
  };
}
