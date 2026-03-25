import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "./types";

export type SystemSettingsPort = {
  getByKey(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null>;
  getByScope(scope: SystemSettingScope): Promise<SystemSetting[]>;
  upsert(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    valueJson: unknown,
    updatedBy: string | null
  ): Promise<SystemSetting>;
};
