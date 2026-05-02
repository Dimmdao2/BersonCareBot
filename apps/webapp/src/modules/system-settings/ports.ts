import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "./types";

export type SystemSettingsUpsertRow = {
  key: SystemSettingKey;
  scope: SystemSettingScope;
  valueJson: unknown;
  updatedBy: string | null;
};

export type SystemSettingsPort = {
  getByKey(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null>;
  getByScope(scope: SystemSettingScope): Promise<SystemSetting[]>;
  upsert(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    valueJson: unknown,
    updatedBy: string | null
  ): Promise<SystemSetting>;
  /** All rows committed atomically (single transaction on Postgres). */
  upsertManyInTransaction(rows: SystemSettingsUpsertRow[]): Promise<SystemSetting[]>;
};
