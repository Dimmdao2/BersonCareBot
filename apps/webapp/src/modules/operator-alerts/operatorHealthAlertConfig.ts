/**
 * Операторские уведомления админу (Wave 2): `operator_health_alert_config` в `system_settings`.
 * Lazy merge из legacy `admin_incident_alert_config` при отсутствии нового ключа.
 */

import {
  ADMIN_INCIDENT_V1_TOPIC_KEYS,
  parseAdminIncidentAlertConfig,
  type AdminIncidentAlertConfig,
  type AdminIncidentTopicKey,
} from "@/modules/admin-incidents/adminIncidentAlertConfig";

export const OPERATOR_HEALTH_ALERT_CONFIG_KEY = "operator_health_alert_config" as const;

export const OPERATOR_ALERT_BLOCKS = ["critical", "digest", "account_conflicts"] as const;
export type OperatorAlertBlock = (typeof OPERATOR_ALERT_BLOCKS)[number];

export type OperatorAlertChannels = {
  telegram: boolean;
  max: boolean;
  web_push: boolean;
};

export type OperatorHealthAlertConfig = {
  topics: {
    critical_enabled: boolean;
    digest_enabled: boolean;
    account_conflicts: boolean;
  };
  digestTime: string;
  channels: Record<OperatorAlertBlock, OperatorAlertChannels>;
};

const IDENTITY_LEGACY_TOPICS: AdminIncidentTopicKey[] = [
  "channel_link",
  "auto_merge_conflict",
  "auto_merge_conflict_anomaly",
  "messenger_phone_bind_blocked",
  "messenger_phone_bind_anomaly",
];

const DEFAULT_CHANNELS: OperatorAlertChannels = {
  telegram: true,
  max: true,
  web_push: true,
};

export function defaultOperatorHealthAlertConfig(): OperatorHealthAlertConfig {
  return {
    topics: {
      critical_enabled: true,
      digest_enabled: true,
      account_conflicts: true,
    },
    digestTime: "09:00",
    channels: {
      critical: { ...DEFAULT_CHANNELS },
      digest: { ...DEFAULT_CHANNELS },
      account_conflicts: { ...DEFAULT_CHANNELS },
    },
  };
}

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function parseChannelsBlock(raw: unknown, fallback: OperatorAlertChannels): OperatorAlertChannels {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const o = raw as Record<string, unknown>;
  return {
    telegram: isBool(o.telegram) ? o.telegram : fallback.telegram,
    max: isBool(o.max) ? o.max : fallback.max,
    web_push: isBool(o.web_push) ? o.web_push : fallback.web_push,
  };
}

function normalizeDigestTime(raw: unknown): string {
  if (typeof raw !== "string") return "09:00";
  const t = raw.trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return "09:00";
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function unwrapValueJson(valueJson: unknown): unknown {
  if (valueJson === null || valueJson === undefined) return null;
  if (typeof valueJson === "object" && valueJson !== null && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value;
  }
  return valueJson;
}

/** Парсит сохранённый `operator_health_alert_config` (без legacy merge). */
export function parseOperatorHealthAlertConfig(valueJson: unknown): OperatorHealthAlertConfig {
  const out = defaultOperatorHealthAlertConfig();
  const root = unwrapValueJson(valueJson);
  if (root === null || typeof root !== "object" || Array.isArray(root)) return out;
  const o = root as Record<string, unknown>;

  if (typeof o.topics === "object" && o.topics !== null && !Array.isArray(o.topics)) {
    const t = o.topics as Record<string, unknown>;
    if (isBool(t.critical_enabled)) out.topics.critical_enabled = t.critical_enabled;
    if (isBool(t.digest_enabled)) out.topics.digest_enabled = t.digest_enabled;
    if (isBool(t.account_conflicts)) out.topics.account_conflicts = t.account_conflicts;
  }

  if ("digestTime" in o) {
    out.digestTime = normalizeDigestTime(o.digestTime);
  }

  if (typeof o.channels === "object" && o.channels !== null && !Array.isArray(o.channels)) {
    const c = o.channels as Record<string, unknown>;
    for (const block of OPERATOR_ALERT_BLOCKS) {
      if (block in c) {
        out.channels[block] = parseChannelsBlock(c[block], out.channels[block]);
      }
    }
  }

  return out;
}

function legacyAccountConflictsEnabled(legacy: AdminIncidentAlertConfig): boolean {
  return IDENTITY_LEGACY_TOPICS.some((k) => legacy.topics[k] === true);
}

/** Lazy merge: новый ключ приоритетнее; иначе вывод из `admin_incident_alert_config`. */
export function mergeOperatorHealthAlertConfigFromLegacy(
  operatorRaw: unknown | null | undefined,
  legacyRaw: unknown | null | undefined,
): OperatorHealthAlertConfig {
  const hasOperator =
    operatorRaw !== null &&
    operatorRaw !== undefined &&
    unwrapValueJson(operatorRaw) !== null &&
    typeof unwrapValueJson(operatorRaw) === "object";
  if (hasOperator) {
    return parseOperatorHealthAlertConfig(operatorRaw);
  }

  const legacy = parseAdminIncidentAlertConfig(legacyRaw ?? null);
  const out = defaultOperatorHealthAlertConfig();
  out.topics.account_conflicts = legacyAccountConflictsEnabled(legacy);
  out.topics.critical_enabled = legacy.topics.system_health_db_guard === true || out.topics.critical_enabled;
  out.channels.account_conflicts = {
    telegram: legacy.channels.telegram,
    max: legacy.channels.max,
    web_push: legacy.channels.web_push ?? true,
  };
  return out;
}

export function isOperatorAlertBlockEnabled(cfg: OperatorHealthAlertConfig, block: OperatorAlertBlock): boolean {
  if (block === "critical") return cfg.topics.critical_enabled;
  if (block === "digest") return cfg.topics.digest_enabled;
  return cfg.topics.account_conflicts;
}

/** Legacy identity topic → block `account_conflicts`; `system_health_db_guard` → `critical`. */
export function adminIncidentTopicToAlertBlock(topic: AdminIncidentTopicKey): OperatorAlertBlock | null {
  if (topic === "system_health_db_guard") return "critical";
  if ((IDENTITY_LEGACY_TOPICS as readonly string[]).includes(topic)) return "account_conflicts";
  return null;
}

export function normalizeOperatorHealthAlertConfigForAdminPatch(
  inner: unknown,
): { ok: true; value: OperatorHealthAlertConfig } | { ok: false } {
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
    return { ok: false };
  }
  const o = inner as Record<string, unknown>;
  const topicsIn = typeof o.topics === "object" && o.topics !== null && !Array.isArray(o.topics) ? o.topics : null;
  const channelsIn =
    typeof o.channels === "object" && o.channels !== null && !Array.isArray(o.channels) ? o.channels : null;
  if (!topicsIn || !channelsIn) return { ok: false };

  const defaults = defaultOperatorHealthAlertConfig();
  const topics = { ...defaults.topics };
  const tObj = topicsIn as Record<string, unknown>;
  for (const k of ["critical_enabled", "digest_enabled", "account_conflicts"] as const) {
    if (!(k in tObj)) continue;
    const v = tObj[k];
    if (!isBool(v)) return { ok: false };
    topics[k] = v;
  }

  const channels = { ...defaults.channels };
  const cObj = channelsIn as Record<string, unknown>;
  for (const block of OPERATOR_ALERT_BLOCKS) {
    if (!(block in cObj)) continue;
    const blockRaw = cObj[block];
    if (blockRaw === null || typeof blockRaw !== "object" || Array.isArray(blockRaw)) return { ok: false };
    const b = blockRaw as Record<string, unknown>;
    for (const ch of ["telegram", "max", "web_push"] as const) {
      if (!(ch in b)) continue;
      if (!isBool(b[ch])) return { ok: false };
      channels[block][ch] = b[ch]!;
    }
  }

  let digestTime = defaults.digestTime;
  if ("digestTime" in o) {
    const s = typeof o.digestTime === "string" ? o.digestTime.trim() : "";
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(s)) return { ok: false };
    const [hs, ms] = s.split(":");
    digestTime = `${hs!.padStart(2, "0")}:${ms}`;
  }

  return {
    ok: true,
    value: { topics, digestTime, channels },
  };
}

/** @deprecated Используйте merge; оставлено для тестов legacy. */
export function legacyIdentityTopicKeys(): readonly AdminIncidentTopicKey[] {
  return IDENTITY_LEGACY_TOPICS;
}

/** @deprecated */
export function allLegacyTopicKeys(): readonly AdminIncidentTopicKey[] {
  return ADMIN_INCIDENT_V1_TOPIC_KEYS;
}
