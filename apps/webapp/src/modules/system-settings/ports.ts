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
  /** Boolean-only current-patient capability; never exposes the restricted identifier list. */
  isCurrentPatientTestAccount(): Promise<boolean>;
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
  getEffective(input: {
    key: string;
    scope: string;
    organizationId: string | null;
    allowedAudiences: readonly RuntimeConfigAudience[];
    operationFamily: RuntimeConfigOperationFamily;
    allowGlobalFallback?: boolean;
  }): Promise<RuntimeSettingRow | null>;
  getSnapshotRows(input: {
    scope: string;
    organizationId: string | null;
    allowedAudiences: readonly RuntimeConfigAudience[];
  }): Promise<RuntimeSettingRow[]>;
  upsert(input: {
    key: string;
    scope: string;
    organizationId: string | null;
    audience: RuntimeConfigAudience;
    valueJson: unknown;
    updatedBy: string | null;
  }): Promise<RuntimeSettingRow>;
};

export type RuntimeWrite = {
  key: string;
  scope: string;
  organizationId: string | null;
  audience: RuntimeConfigAudience;
  valueJson: unknown;
  updatedBy: string | null;
};

export type SettingsWriteUnitOfWork = {
  /** Commits public legacy/restricted rows and runtime rows/audits as one transaction. */
  write(input: {
    legacyRows: SystemSettingsUpsertRow[];
    authoritativeRuntimeRows: RuntimeWrite[];
  }): Promise<SystemSetting[]>;
  /** Same dual-write transaction, but only when the exact legacy row still matches the read token. */
  compareAndSwap?(input: {
    legacyRow: SystemSettingsUpsertRow;
    authoritativeRuntimeRows: RuntimeWrite[];
    expectedUpdatedAt: string | null;
  }): Promise<SystemSetting | null>;
  delete?(input: {
    key: SystemSettingKey;
    scope: SystemSettingScope;
    organizationId: string | null;
    updatedBy: string | null;
    deleteRuntime: boolean;
  }): Promise<boolean>;
};

export type RuntimeReadTelemetry = {
  record(input: { key: string; source: 'runtime' | 'legacy_fallback' | 'mismatch' }): void;
};

/** Public-login capabilities derived in Postgres without exposing channel credentials. */
export type PublicAuthChannelCapability = 'email' | 'sms' | 'telegram' | 'max';
