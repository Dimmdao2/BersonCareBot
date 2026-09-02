/**
 * Public (non-secret) half of the per-org dedicated bot configuration, as stored by webapp
 * (`apps/webapp/src/modules/system-settings/clinicBotConfig.ts`): siblings of `value` inside the
 * SAME `clinic_telegram_bot_token` / `clinic_max_bot_api_key` envelope that carries the credential
 * and `deliveryReadiness`.
 *
 * Reading it here needs no new key and no new privilege: the integrator already reads that exact
 * envelope through `app.read_integrator_clinic_delivery_credential`.
 */

export type ClinicBotInboundForwarding = Readonly<{
  enabled: boolean;
  destinationChatId: string;
}>;

const DESTINATION_CHAT_ID_RE = /^-?[0-9]{1,32}$/;

function envelope(valueJson: unknown): Record<string, unknown> | null {
  return valueJson !== null && typeof valueJson === 'object' && !Array.isArray(valueJson)
    ? (valueJson as Record<string, unknown>)
    : null;
}

/**
 * Owner 20.08: «умолчание — игнорировать; включает клиника явно» and «id чата … без него
 * пересылку включить нельзя». Both halves therefore fail closed: anything other than an explicit
 * `enabled: true` plus an exact chat id yields `null` — i.e. ignore the inbound message.
 */
export function parseClinicBotInboundForwarding(
  valueJson: unknown,
): ClinicBotInboundForwarding | null {
  const forwarding = envelope(envelope(valueJson)?.inboundForwarding);
  if (!forwarding || forwarding.enabled !== true) return null;
  const raw = forwarding.destinationChatId;
  const destinationChatId = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!DESTINATION_CHAT_ID_RE.test(destinationChatId)) return null;
  return { enabled: true, destinationChatId };
}
