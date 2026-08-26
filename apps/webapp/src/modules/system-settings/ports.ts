import type { SystemSetting, SystemSettingKey, SystemSettingScope } from './types';
import type {
  RuntimeConfigAudience,
  RuntimeConfigOperationFamily,
  RuntimeSettingRow,
} from './runtimeConfig';

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
  /** Platform operations only: bounded exception for keys with an intentional global fallback row. */
  allowPlatformGlobalFallbackWrite?: true;
};
export type SystemSettingsDeleteOptions = SystemSettingsWriteOptions;

export type SystemSettingsPort = {
  getByKey(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    options?: SystemSettingsReadOptions,
  ): Promise<SystemSetting | null>;
  getByScope(
    scope: SystemSettingScope,
    options?: SystemSettingsReadOptions,
  ): Promise<SystemSetting[]>;
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
    options?: SystemSettingsWriteOptions,
  ): Promise<SystemSetting>;
  /** Exact-row optimistic write. `null` means the row changed since it was read. */
  compareAndSwap?(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    valueJson: unknown,
    updatedBy: string | null,
    expectedUpdatedAt: string | null,
    options?: SystemSettingsWriteOptions,
  ): Promise<SystemSetting | null>;
  /** All rows committed atomically (single transaction on Postgres). */
  upsertManyInTransaction(rows: SystemSettingsUpsertRow[]): Promise<SystemSetting[]>;
  delete?(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    updatedBy: string | null,
    options?: SystemSettingsDeleteOptions,
  ): Promise<boolean>;
};

/** Restricted `public.system_settings` repository. Kept under its historical name for callers. */
export type RestrictedSettingsRepository = SystemSettingsPort;

export type RuntimeSettingsRepository = {
  /**
   * Fixed clinic-facing projection of the global integration registry. The PostgreSQL
   * implementation uses a staff-context named root and never exposes general platform settings.
   */
  getClinicPlatformIntegrationAvailability(): Promise<RuntimeSettingRow | null>;
  getEffective(input: {
    key: string;
    scope: string;
    organizationId: string | null;
    allowedAudiences: readonly RuntimeConfigAudience[];
    operationFamily: RuntimeConfigOperationFamily;
    allowGlobalFallback?: boolean;
  }): Promise<RuntimeSettingRow | null>;
};

export type SettingsWriteUnitOfWork = {
  /** Commits canonical rows and system_settings_audit entries in one transaction. */
  write(input: { rows: SystemSettingsUpsertRow[] }): Promise<SystemSetting[]>;
  /** Same canonical transaction, but only when the exact row still matches the read token. */
  compareAndSwap?(input: {
    row: SystemSettingsUpsertRow;
    expectedUpdatedAt: string | null;
  }): Promise<SystemSetting | null>;
};

/** Public-login capabilities derived in Postgres without exposing channel credentials. */
export type PublicAuthChannelCapability = 'email' | 'sms' | 'telegram' | 'max';
