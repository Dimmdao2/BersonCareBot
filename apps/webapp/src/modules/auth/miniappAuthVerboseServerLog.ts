import type { SystemSetting } from "@/modules/system-settings/types";

function readBooleanValueJson(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== "object") return false;
  const v = (valueJson as Record<string, unknown>).value;
  return v === true || v === "true";
}

/**
 * Админ-флаг `max_debug_page_enabled`: полный сырой `initData` в логах webapp (journalctl)
 * при POST `/api/auth/max-init` и `/api/auth/telegram-init`. Только для кратковременной отладки на сервере.
 */
export async function isMiniappAuthVerboseServerLogEnabled(deps: {
  systemSettings: {
    getSetting(key: "max_debug_page_enabled", scope: "admin"): Promise<SystemSetting | null>;
  };
}): Promise<boolean> {
  const row = await deps.systemSettings.getSetting("max_debug_page_enabled", "admin");
  return row != null && readBooleanValueJson(row.valueJson);
}
