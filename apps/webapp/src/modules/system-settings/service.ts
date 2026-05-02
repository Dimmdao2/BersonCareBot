import { ALLOWED_KEYS, type SystemSettingKey, type SystemSettingScope, type SystemSetting } from "./types";
import type { SystemSettingsPort } from "./ports";
import type { ModesFormKey } from "./modesFormKeys";
import { invalidateConfigKey } from "./configAdapter";
import {
  normalizeStoredValueJsonForIntegratorSync,
  syncSettingToIntegrator,
} from "./syncToIntegrator";
import {
  normalizeTestAccountIdentifiersValue,
  relayRecipientAllowedInDevMode,
  sessionMatchesTestAccountIdentifiers,
  type TestAccountIdentifiers,
} from "./testAccounts";

async function readTestAccountIdentifiersFromPort(port: SystemSettingsPort): Promise<TestAccountIdentifiers | null> {
  const row = await port.getByKey("test_account_identifiers", "admin");
  if (!row?.valueJson || typeof row.valueJson !== "object") return null;
  const inner = (row.valueJson as Record<string, unknown>).value;
  const parsed = normalizeTestAccountIdentifiersValue(inner);
  return parsed;
}

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

    /**
     * Persists a pre-normalized «Режимы» batch (one DB transaction), then syncs each key to integrator and invalidates config cache.
     */
    async persistAdminModesBatch(
      rows: Array<{ key: ModesFormKey; valueJson: { value: unknown } }>,
      updatedBy: string | null
    ): Promise<SystemSetting[]> {
      for (const r of rows) {
        if (!isAllowedKey(r.key)) {
          throw new Error(`unknown_setting_key: ${r.key}`);
        }
      }
      const upsertRows = rows.map((r) => ({
        key: r.key,
        scope: "admin" as const,
        valueJson: r.valueJson,
        updatedBy,
      }));
      const saved = await port.upsertManyInTransaction(upsertRows);
      for (const s of saved) {
        void syncSettingToIntegrator({
          key: s.key,
          scope: s.scope,
          valueJson: normalizeStoredValueJsonForIntegratorSync(s.valueJson),
          updatedBy: s.updatedBy,
        });
        invalidateConfigKey(s.key);
      }
      return saved;
    },

    /**
     * Dev-mode guard для relay-outbound: при `dev_mode` сравниваются `channel` и `recipient` с `test_account_identifiers`
     * (`telegramIds` / `maxIds` через `relayRecipientAllowedInDevMode`). Поле `phones` в том же ключе используется для
     * bypass техработ пациента (`isTestPatientSession`), не для этого метода, пока нет phone-based relay-вызовов.
     */
    async shouldDispatchRelayToRecipient(ctx: { channel: string; recipient: string }): Promise<boolean> {
      const devModeSetting = await port.getByKey("dev_mode", "admin");
      const devMode =
        devModeSetting?.valueJson !== null &&
        typeof devModeSetting?.valueJson === "object" &&
        (devModeSetting.valueJson as Record<string, unknown>).value === true;

      if (!devMode) return true;

      const spec = await readTestAccountIdentifiersFromPort(port);
      if (spec === null) return false;

      return relayRecipientAllowedInDevMode(ctx.channel, ctx.recipient, spec);
    },

    /**
     * Тестовый пациентский аккаунт для bypass техработ: совпадение по телефону (E.164) или Telegram/Max ID из сессии.
     * Fail-closed при отсутствии или некорректном `test_account_identifiers`.
     */
    async isTestPatientSession(session: {
      phone?: string | null;
      telegramId?: string | null;
      maxId?: string | null;
    }): Promise<boolean> {
      const spec = await readTestAccountIdentifiersFromPort(port);
      if (spec === null) return false;
      return sessionMatchesTestAccountIdentifiers(
        {
          phone: session.phone ?? undefined,
          telegramId: session.telegramId ?? undefined,
          maxId: session.maxId ?? undefined,
        },
        spec,
      );
    },
  };
}

export type SystemSettingsService = ReturnType<typeof createSystemSettingsService>;
