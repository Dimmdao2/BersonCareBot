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
  /**
   * Narrow, patient-safe accessor: ONLY the public half of the `web_push_vapid` envelope (never
   * `privateKey`). On Postgres this reads through a SECURITY DEFINER accessor
   * (`app.get_web_push_vapid_public_key()`, deploy/postgres/patient-web-push-vapid-public-key-
   * accessor.sql) so the `app_patient` DB role never needs a grant on `system_settings` itself
   * (which also holds admin allowlists/secrets). `null` if unset.
   */
  getWebPushVapidPublicKeyOnly(): Promise<string | null>;
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
