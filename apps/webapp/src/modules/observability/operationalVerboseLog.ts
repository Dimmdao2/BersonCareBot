import type { SystemSetting } from "@/modules/system-settings/types";

const TTL_MS = 30_000;

type CacheEntry = { value: boolean; expiresAt: number };
let cache: CacheEntry | null = null;

function readBooleanValueJson(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== "object") return false;
  const v = (valueJson as Record<string, unknown>).value;
  return v === true || v === "true";
}

/**
 * Admin-флаг `debug_forward_to_admin` управляет полнотой серверных логов (journalctl):
 * `false` (default) — только значимое (warn/error/DLQ/retry-fail); `true` — подробные operational `info`.
 * Verbose-логи не должны содержать сырые params/payload/PII. TTL-кэш (fail-safe `false`).
 *
 * NB: это deps-инъекционный путь для `modules/*`-флоу. Собственный кэш сбрасывается только по TTL
 * (≤30 c), без явной инвалидации при сохранении настройки. Для route-utils без `deps` используется
 * `configAdapter.getConfigBool("debug_forward_to_admin", false)` — он инвалидируется на сохранении
 * (`persistAdminModesBatch` → `invalidateConfigKey`). Оба пути читают тот же ключ и eventually-consistent.
 */
export async function isOperationalVerboseLogEnabled(deps: {
  systemSettings: {
    getSetting(key: "debug_forward_to_admin", scope: "admin"): Promise<SystemSetting | null>;
  };
}): Promise<boolean> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }
  try {
    const row = await deps.systemSettings.getSetting("debug_forward_to_admin", "admin");
    const value = row != null && readBooleanValueJson(row.valueJson);
    cache = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return false;
  }
}

/** @internal */
export function resetOperationalVerboseLogCacheForTests(): void {
  cache = null;
}
