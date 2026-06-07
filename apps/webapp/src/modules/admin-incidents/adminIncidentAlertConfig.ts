/**
 * Admin relay toggles for identity incidents (channel-link, auto-merge, messenger phone bind).
 * Stored in system_settings key `admin_incident_alert_config` (scope admin).
 *
 * Без Node-only импортов: клиентские компоненты настроек импортируют константы/типы из этого файла.
 * Dedup-хеш для integrator — {@link integratorAutoMergeAnomalyDedupKey}.
 */

export const ADMIN_INCIDENT_ALERT_CONFIG_KEY = "admin_incident_alert_config" as const;

export const ADMIN_INCIDENT_V1_TOPIC_KEYS = [
  "channel_link",
  "auto_merge_conflict",
  "auto_merge_conflict_anomaly",
  "messenger_phone_bind_blocked",
  "messenger_phone_bind_anomaly",
  "system_health_db_guard",
] as const;

export type AdminIncidentTopicKey = (typeof ADMIN_INCIDENT_V1_TOPIC_KEYS)[number];

export type AdminIncidentAlertChannels = {
  telegram: boolean;
  max: boolean;
  web_push: boolean;
};

export type AdminIncidentAlertConfig = {
  topics: Record<AdminIncidentTopicKey, boolean>;
  channels: AdminIncidentAlertChannels;
};

const DEFAULT_TOPICS: Record<AdminIncidentTopicKey, boolean> = {
  channel_link: true,
  auto_merge_conflict: true,
  auto_merge_conflict_anomaly: true,
  messenger_phone_bind_blocked: true,
  messenger_phone_bind_anomaly: true,
  system_health_db_guard: false,
};

export const ADMIN_INCIDENT_TOPIC_LABELS: Record<AdminIncidentTopicKey, string> = {
  channel_link: "Конфликт привязки канала",
  auto_merge_conflict: "Новый открытый конфликт автомержа",
  auto_merge_conflict_anomaly: "Аномалия автомержа (пустые кандидаты)",
  messenger_phone_bind_blocked: "Блокировка привязки телефона (мессенджер)",
  messenger_phone_bind_anomaly: "Аномалия привязки телефона (мессенджер)",
  system_health_db_guard: "Очередь синка в integrator (system health)",
};

const DEFAULT_CHANNELS: AdminIncidentAlertChannels = {
  telegram: true,
  max: true,
  web_push: true,
};

function defaultConfig(): AdminIncidentAlertConfig {
  return {
    topics: { ...DEFAULT_TOPICS },
    channels: { ...DEFAULT_CHANNELS },
  };
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/**
 * Parse `value_json` from DB (full row or `{ value: ... }` inner). Broken → defaults (all true).
 */
export function parseAdminIncidentAlertConfig(valueJson: unknown): AdminIncidentAlertConfig {
  const out = defaultConfig();
  if (valueJson === null || valueJson === undefined) return out;
  let root: unknown = valueJson;
  if (typeof valueJson === "object" && valueJson !== null && "value" in (valueJson as Record<string, unknown>)) {
    root = (valueJson as Record<string, unknown>).value;
  }
  if (root === null || typeof root !== "object") return out;
  const o = root as Record<string, unknown>;
  if (typeof o.topics === "object" && o.topics !== null && !Array.isArray(o.topics)) {
    const t = o.topics as Record<string, unknown>;
    for (const k of ADMIN_INCIDENT_V1_TOPIC_KEYS) {
      if (k in t && isBool(t[k])) {
        out.topics[k] = t[k]!;
      }
    }
  }
  if (typeof o.channels === "object" && o.channels !== null && !Array.isArray(o.channels)) {
    const c = o.channels as Record<string, unknown>;
    if (isBool(c.telegram)) out.channels.telegram = c.telegram;
    if (isBool(c.max)) out.channels.max = c.max;
    if (isBool(c.web_push)) out.channels.web_push = c.web_push;
  }
  return out;
}

export function isAdminIncidentTopicEnabled(cfg: AdminIncidentAlertConfig, topic: AdminIncidentTopicKey): boolean {
  return cfg.topics[topic] === true;
}

/**
 * PATCH `/api/admin/settings`: strip unknown `topics` / `channels` keys; missing v1 topic flags → default true;
 * missing `telegram` / `max` → default true. Reject only invalid types for known keys we read.
 */
export function normalizeAdminIncidentAlertConfigForAdminPatch(
  inner: unknown,
): { ok: true; value: AdminIncidentAlertConfig } | { ok: false } {
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
    return { ok: false };
  }
  const o = inner as Record<string, unknown>;
  const topicsIn = typeof o.topics === "object" && o.topics !== null && !Array.isArray(o.topics) ? o.topics : null;
  const channelsIn =
    typeof o.channels === "object" && o.channels !== null && !Array.isArray(o.channels) ? o.channels : null;
  if (!topicsIn || !channelsIn) return { ok: false };

  const topics: Record<AdminIncidentTopicKey, boolean> = { ...DEFAULT_TOPICS };
  const tObj = topicsIn as Record<string, unknown>;
  for (const k of ADMIN_INCIDENT_V1_TOPIC_KEYS) {
    if (!(k in tObj)) continue;
    const v = tObj[k];
    if (!isBool(v)) return { ok: false };
    topics[k] = v;
  }

  const channels: AdminIncidentAlertChannels = { ...DEFAULT_CHANNELS };
  const cObj = channelsIn as Record<string, unknown>;
  for (const k of Object.keys(cObj)) {
    if (k === "telegram") {
      if (!isBool(cObj.telegram)) return { ok: false };
      channels.telegram = cObj.telegram;
    } else if (k === "max") {
      if (!isBool(cObj.max)) return { ok: false };
      channels.max = cObj.max;
    } else if (k === "web_push") {
      if (!isBool(cObj.web_push)) return { ok: false };
      channels.web_push = cObj.web_push;
    }
  }

  return {
    ok: true,
    value: {
      topics,
      channels,
    },
  };
}
