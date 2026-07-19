import { ALLOWED_KEYS, SYSTEM_SETTING_REGISTRY, type SystemSettingKey } from "./registry";

/** Compatibility view derived from the S5-0 single setting registry. */
export type SystemSettingsOrgScope = "per_org" | "global";

export const SYSTEM_SETTINGS_ORG_SCOPE: Readonly<Record<SystemSettingKey, SystemSettingsOrgScope>> =
  Object.freeze(
    Object.fromEntries(
      ALLOWED_KEYS.map((key) => [
        key,
        SYSTEM_SETTING_REGISTRY[key].ownership === "per_org" ? "per_org" : "global",
      ]),
    ) as Record<SystemSettingKey, SystemSettingsOrgScope>,
  );

export function isPerOrgSettingKey(key: string): boolean {
  return SYSTEM_SETTING_REGISTRY[key as SystemSettingKey]?.ownership === "per_org";
}

/**
 * Thrown by the existing write service when a per-org key has no proven org context.
 * It never falls back to a platform-global write.
 */
export class SystemSettingsOrgContextRequiredError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`organization_context_required: per-org setting "${key}" was written without an organizationId`);
    this.name = "SystemSettingsOrgContextRequiredError";
    this.key = key;
  }
}
