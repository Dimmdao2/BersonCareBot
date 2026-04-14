import { ALLOWED_KEYS, type SystemSettingKey, type SystemSettingScope, type SystemSetting } from "./types";
import type { SystemSettingsPort } from "./ports";
import { invalidateConfigKey } from "./configAdapter";
import {
  normalizeStoredValueJsonForIntegratorSync,
  syncSettingToIntegrator,
} from "./syncToIntegrator";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";

export function createSystemSettingsService(port: SystemSettingsPort) {
  function isAllowedKey(key: string): key is SystemSettingKey {
    return (ALLOWED_KEYS as readonly string[]).includes(key);
  }

  return {
    getSetting(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null> {
      return port.getByKey(key, scope);
    },

    listSettingsByScope(scope: SystemSettingScope): Promise<SystemSetting[]> {
      return port.getByScope(scope);
    },

    async updateSetting(
      key: string,
      scope: SystemSettingScope,
      value: unknown,
      updatedBy: string | null
    ): Promise<SystemSetting> {
      if (!isAllowedKey(key)) {
        throw new Error(`unknown_setting_key: ${key}`);
      }
      const result = await port.upsert(key, scope, value, updatedBy);
      void syncSettingToIntegrator({
        key,
        scope,
        valueJson: normalizeStoredValueJsonForIntegratorSync(result.valueJson),
        updatedBy: result.updatedBy,
      });
      if (key === "app_base_url") {
        invalidateConfigKey("app_base_url");
      }
      return result;
    },

    /** Возвращает true если сообщения можно доставлять данному userId. */
    async shouldDispatch(userId: string): Promise<boolean> {
      const devModeSetting = await port.getByKey("dev_mode", "admin");
      const devMode =
        devModeSetting?.valueJson !== null &&
        typeof devModeSetting?.valueJson === "object" &&
        (devModeSetting.valueJson as Record<string, unknown>).value === true;

      if (!devMode) return true;

      const testIdsSetting = await port.getByKey("integration_test_ids", "admin");
      if (!testIdsSetting) return false;

      const raw = testIdsSetting.valueJson;
      const ids: unknown =
        raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>).value : null;
      const tokens = parseIdTokens(ids);
      return tokens.includes(userId);
    },
  };
}

export type SystemSettingsService = ReturnType<typeof createSystemSettingsService>;
