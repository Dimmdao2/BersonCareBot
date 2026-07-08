import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "./types";

export type SystemSettingsUpsertRow = {
  key: SystemSettingKey;
  scope: SystemSettingScope;
  organizationId?: string | null;
  valueJson: unknown;
  updatedBy: string | null;
};

export type SystemSettingsReadOptions = {
  organizationId?: string | null;
};

export type SystemSettingsWriteOptions = {
  organizationId?: string | null;
};

export type SystemSettingsPort = {
  getByKey(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    options?: SystemSettingsReadOptions
  ): Promise<SystemSetting | null>;
  getByScope(scope: SystemSettingScope, options?: SystemSettingsReadOptions): Promise<SystemSetting[]>;
  upsert(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    valueJson: unknown,
    updatedBy: string | null,
    options?: SystemSettingsWriteOptions
  ): Promise<SystemSetting>;
  /** All rows committed atomically (single transaction on Postgres). */
  upsertManyInTransaction(rows: SystemSettingsUpsertRow[]): Promise<SystemSetting[]>;
};
