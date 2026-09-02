/**
 * Public (non-secret) half of the EXISTING per-org dedicated bot configuration.
 *
 * Owner 20.08 («Пересылка входящих — настройка КЛИНИКИ, а не платформы» + «свой бот» = пара
 * платформ): the clinic owns a public bot identity and two forwarding settings per platform. They
 * are NOT a second store: they live as siblings of `value` inside the very same
 * `clinic_telegram_bot_token` / `clinic_max_bot_api_key` envelope that already carries
 * `deliveryReadiness`, so the credential stays exactly where it is (`value`) and the dedicated-bot
 * fingerprint trigger — which reads `value_json #>> '{value}'` — keeps working unchanged.
 *
 * Why siblings and not `value.<field>`: `value` IS the credential for these two keys (registry
 * `secretAudit: whole_value`, DB trigger `clinic_dedicated_bot_bindings`). Nesting the public
 * fields under `value` would change the fingerprint input and silently unroute every live
 * dedicated bot.
 */

export const CLINIC_BOT_PUBLIC_ID_FIELD = 'botPublicId';
export const CLINIC_BOT_INBOUND_FORWARDING_FIELD = 'inboundForwarding';

export type ClinicBotChannel = 'telegram' | 'max';

/** Owner default is «игнорировать»; enabling requires an explicit destination chat id. */
export type ClinicBotInboundForwarding = Readonly<{
  enabled: boolean;
  destinationChatId: string;
}>;

export type ClinicBotPublicConfig = Readonly<{
  /** Public @username (Telegram) / nickname (MAX). Never the numeric bot id, never the token. */
  botPublicId: string | null;
  inboundForwarding: ClinicBotInboundForwarding | null;
}>;

export const CLINIC_BOT_INBOUND_FORWARDING_OFF: ClinicBotInboundForwarding = {
  enabled: false,
  destinationChatId: '',
};

/** Neither a public handle nor forwarding declared — the shape a clinic starts from. */
export const CLINIC_BOT_PUBLIC_CONFIG_NONE: ClinicBotPublicConfig = {
  botPublicId: null,
  inboundForwarding: null,
};

/** Telegram usernames and MAX nicknames share this safe public-handle alphabet. */
const PUBLIC_ID_RE = /^[A-Za-z0-9_]{3,64}$/;
/** Exact chat id: Telegram groups/channels are negative, private chats positive; MAX is positive. */
const DESTINATION_CHAT_ID_RE = /^-?[0-9]{1,32}$/;

function envelope(valueJson: unknown): Record<string, unknown> | null {
  return valueJson !== null && typeof valueJson === 'object' && !Array.isArray(valueJson)
    ? (valueJson as Record<string, unknown>)
    : null;
}

/** Accepts a bare handle, `@handle` or a full `https://t.me/…` / `https://max.ru/…` link. */
export function normalizeClinicBotPublicId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./i, '').toLowerCase();
      if (host !== 't.me' && host !== 'telegram.me' && host !== 'max.ru') return null;
      value = url.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] ?? '';
      value = value ? decodeURIComponent(value) : '';
    } catch {
      return null;
    }
  }
  value = value.replace(/^@/, '').trim();
  return PUBLIC_ID_RE.test(value) ? value : null;
}

export function normalizeClinicBotDestinationChatId(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  return DESTINATION_CHAT_ID_RE.test(value) ? value : null;
}

export function parseClinicBotPublicConfig(valueJson: unknown): ClinicBotPublicConfig {
  const record = envelope(valueJson);
  if (!record) return CLINIC_BOT_PUBLIC_CONFIG_NONE;
  const botPublicId = normalizeClinicBotPublicId(record[CLINIC_BOT_PUBLIC_ID_FIELD]);
  const rawForwarding = record[CLINIC_BOT_INBOUND_FORWARDING_FIELD];
  const forwardingRecord = envelope(rawForwarding);
  if (!forwardingRecord) {
    return { botPublicId, inboundForwarding: null };
  }
  const destinationChatId = normalizeClinicBotDestinationChatId(
    forwardingRecord.destinationChatId,
  );
  // Fail closed: «включено» without an exact destination is not forwarding, it is a dropped
  // message. Owner 20.08: «без него пересылку включить нельзя».
  const enabled = forwardingRecord.enabled === true && destinationChatId !== null;
  return {
    botPublicId,
    inboundForwarding: { enabled, destinationChatId: destinationChatId ?? '' },
  };
}

/**
 * Writes the public half back into the envelope, preserving `value` (the credential) and every
 * other sibling (`deliveryReadiness`). Never invents a credential and never drops one.
 */
export function withClinicBotPublicConfig(
  valueJson: unknown,
  config: ClinicBotPublicConfig,
): Record<string, unknown> {
  const current = envelope(valueJson) ?? {};
  const next: Record<string, unknown> = { ...current };
  if (config.botPublicId) {
    next[CLINIC_BOT_PUBLIC_ID_FIELD] = config.botPublicId;
  } else {
    delete next[CLINIC_BOT_PUBLIC_ID_FIELD];
  }
  if (config.inboundForwarding) {
    next[CLINIC_BOT_INBOUND_FORWARDING_FIELD] = {
      enabled: config.inboundForwarding.enabled,
      destinationChatId: config.inboundForwarding.destinationChatId,
    };
  } else {
    delete next[CLINIC_BOT_INBOUND_FORWARDING_FIELD];
  }
  return next;
}
