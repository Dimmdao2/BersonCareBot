import type { SystemSettingsPort, SystemSettingsUpsertRow } from "@/modules/system-settings/ports";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";

export function createInMemorySystemSettingsPort(): SystemSettingsPort {
  const store = new Map<string, SystemSetting>();

  function makeKey(key: string, scope: string) {
    return `${scope}:${key}`;
  }

  return {
    async getByKey(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null> {
      return store.get(makeKey(key, scope)) ?? null;
    },

    async getByScope(scope: SystemSettingScope): Promise<SystemSetting[]> {
      return Array.from(store.values()).filter((s) => s.scope === scope);
    },

    async upsert(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      valueJson: unknown,
      updatedBy: string | null
    ): Promise<SystemSetting> {
      const setting: SystemSetting = {
        key,
        scope,
        valueJson,
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
      store.set(makeKey(key, scope), setting);
      return setting;
    },

    async upsertManyInTransaction(rows: SystemSettingsUpsertRow[]): Promise<SystemSetting[]> {
      const out: SystemSetting[] = [];
      for (const row of rows) {
        const setting: SystemSetting = {
          key: row.key,
          scope: row.scope,
          valueJson: row.valueJson,
          updatedAt: new Date().toISOString(),
          updatedBy: row.updatedBy,
        };
        store.set(makeKey(row.key, row.scope), setting);
        out.push(setting);
      }
      return out;
    },
  };
}

export const inMemorySystemSettingsPort = createInMemorySystemSettingsPort();
