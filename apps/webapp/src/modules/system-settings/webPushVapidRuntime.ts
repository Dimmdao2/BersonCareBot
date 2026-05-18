import type { SystemSettingsService } from "./service";

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
