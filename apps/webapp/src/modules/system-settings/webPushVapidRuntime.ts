import type { SystemSettingsService } from "./service";
import type { SystemSetting } from "./types";

export type WebPushVapidKeyPair = {
  publicKey: string;
  privateKey: string;
};

/**
 * Reads VAPID key pair from `system_settings` (`web_push_vapid`, scope `admin`).
 * Returns `null` if missing or malformed. Prefer this over `getConfigValue` (nested object).
 */
export async function getWebPushVapidKeyPair(
  systemSettings: Pick<SystemSettingsService, "getSetting">,
): Promise<WebPushVapidKeyPair | null> {
  const row = await systemSettings.getSetting("web_push_vapid", "admin");
  const vj = row?.valueJson;
  if (vj === null || typeof vj !== "object" || !("value" in (vj as Record<string, unknown>))) return null;
  const inner = (vj as Record<string, unknown>).value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return null;
  const o = inner as Record<string, unknown>;
  const publicKey = typeof o.publicKey === "string" ? o.publicKey.trim() : "";
  const privateKey = typeof o.privateKey === "string" ? o.privateKey.trim() : "";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

/**
 * Strips `privateKey` from `web_push_vapid` for any HTTP/SSR surface exposed to the browser.
 * Replaces with `hasPrivateKey` so admins can tell whether a secret is stored without reading it.
 */
export function redactWebPushVapidSettingForClient(row: SystemSetting): SystemSetting {
  if (row.key !== "web_push_vapid") return row;
  const vj = row.valueJson;
  if (vj === null || typeof vj !== "object" || !("value" in (vj as Record<string, unknown>))) {
    return row;
  }
  const inner = (vj as Record<string, unknown>).value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
    return row;
  }
  const o = inner as Record<string, unknown>;
  const publicKey = typeof o.publicKey === "string" ? o.publicKey.trim() : "";
  const hasPrivateKey = typeof o.privateKey === "string" && o.privateKey.trim().length > 0;
  return {
    ...row,
    valueJson: {
      ...(vj as Record<string, unknown>),
      value: { publicKey, hasPrivateKey },
    },
  };
}

export function redactAdminSettingsForClient(settings: SystemSetting[]): SystemSetting[] {
  return settings.map((s) => (s.key === "web_push_vapid" ? redactWebPushVapidSettingForClient(s) : s));
}
