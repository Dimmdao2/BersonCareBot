import { ALLOWED_KEYS, type SystemSettingKey, type SystemSettingScope, type SystemSetting } from "./types";
import type { SystemSettingsPort, SystemSettingsReadOptions, SystemSettingsWriteOptions } from "./ports";
import type { ModesFormKey } from "./modesFormKeys";
import { isPerOrgSettingKey, SystemSettingsOrgContextRequiredError } from "./orgScopedKeys";
import { normalizeValueJson } from "./adminSettingsPatchNormalize";
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
import { mergeBookingPaymentProvidersSecretsRetain } from "@/modules/payments/bookingPaymentSettings";

async function mergeWebPushVapidPrivateRetain(
  port: SystemSettingsPort,
  incoming: unknown,
  options: SystemSettingsReadOptions,
): Promise<{ value: unknown }> {
  const env = normalizeValueJson(incoming);
  const inner = env.value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return env;

  const o = { ...(inner as Record<string, unknown>) };
  const privRaw = typeof o.privateKey === "string" ? o.privateKey.trim() : "";
  if (privRaw === "") {
    const prev = await port.getByKey("web_push_vapid", "admin", options);
    let prevPriv = "";
    const prevVj = prev?.valueJson;
    if (
      prevVj !== null &&
      typeof prevVj === "object" &&
      "value" in (prevVj as Record<string, unknown>)
    ) {
      const pv = (prevVj as Record<string, unknown>).value;
      if (pv !== null && typeof pv === "object" && !Array.isArray(pv)) {
        const p = (pv as Record<string, unknown>).privateKey;
        if (typeof p === "string") prevPriv = p.trim();
      }
    }
    o.privateKey = prevPriv;
  } else {
    o.privateKey = privRaw;
  }
  const pubRaw = typeof o.publicKey === "string" ? o.publicKey.trim() : "";
  o.publicKey = pubRaw;
  return { value: o };
}

async function mergeSmtpOutboundPasswordRetain(
  port: SystemSettingsPort,
  incoming: unknown,
  options: SystemSettingsReadOptions,
): Promise<{ value: unknown }> {
  const env = normalizeValueJson(incoming);
  const inner = env.value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return env;

  const o = { ...(inner as Record<string, unknown>) };
  const pwdRaw = typeof o.password === "string" ? o.password.trim() : "";
  if (pwdRaw === "") {
    const prev = await port.getByKey("smtp_outbound", "admin", options);
    let prevPwd = "";
    const prevVj = prev?.valueJson;
    if (
      prevVj !== null &&
      typeof prevVj === "object" &&
      "value" in (prevVj as Record<string, unknown>)
    ) {
      const pv = (prevVj as Record<string, unknown>).value;
      if (pv !== null && typeof pv === "object" && !Array.isArray(pv)) {
        const p = (pv as Record<string, unknown>).password;
        if (typeof p === "string") prevPwd = p;
      }
    }
    o.password = prevPwd;
  } else {
    o.password = pwdRaw;
  }
  return { value: o };
}

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

  /**
   * P0.11.3 single chokepoint: resolves the `organizationId` that actually reaches the port for a
   * write. GLOBAL keys are forced to `null` regardless of what the caller passed (defense — a route
   * handler threading a stale/wrong org never contaminates a platform-wide default). PER-ORG keys
   * require a resolvable `organizationId`; writing one without it throws rather than silently falling
   * back to a global row (which would overwrite the platform default for every clinic).
   * See `orgScopedKeys.ts` for the classification map.
   */
  function resolveWriteOrganizationId(key: string, options: SystemSettingsWriteOptions): string | null {
    if (!isPerOrgSettingKey(key)) return null;
    const organizationId = options.organizationId?.trim() || null;
    if (!organizationId) {
      throw new SystemSettingsOrgContextRequiredError(key);
    }
    return organizationId;
  }

  async function readRelayDevContext(): Promise<{
    devMode: boolean;
    testAccounts: TestAccountIdentifiers | null;
  }> {
    const devModeSetting = await port.getByKey("dev_mode", "admin");
    const devMode =
      devModeSetting?.valueJson !== null &&
      typeof devModeSetting?.valueJson === "object" &&
      (devModeSetting.valueJson as Record<string, unknown>).value === true;

    if (!devMode) {
      return { devMode: false, testAccounts: null };
    }
    const testAccounts = await readTestAccountIdentifiersFromPort(port);
    return { devMode: true, testAccounts };
  }

  return {
    getSetting(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options?: SystemSettingsReadOptions
    ): Promise<SystemSetting | null> {
      return port.getByKey(key, scope, options);
    },

    listSettingsByScope(scope: SystemSettingScope, options?: SystemSettingsReadOptions): Promise<SystemSetting[]> {
      return port.getByScope(scope, options);
    },

    async updateSetting(
      key: string,
      scope: SystemSettingScope,
      value: unknown,
      updatedBy: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<SystemSetting> {
      if (!isAllowedKey(key)) {
        throw new Error(`unknown_setting_key: ${key}`);
      }
      const valueToStore =
        key === "smtp_outbound" && scope === "admin"
          ? await mergeSmtpOutboundPasswordRetain(port, value, options)
          : key === "web_push_vapid" && scope === "admin"
            ? await mergeWebPushVapidPrivateRetain(port, value, options)
            : key === "booking_payment_providers" && scope === "admin"
              ? await mergeBookingPaymentProvidersSecretsRetain(
                  () => port.getByKey("booking_payment_providers", "admin", options).then((r) => r?.valueJson ?? null),
                  value,
                )
              : value;
      const organizationId = resolveWriteOrganizationId(key, options);
      const result = await port.upsert(key, scope, valueToStore, updatedBy, { organizationId });
      void syncSettingToIntegrator({
        key,
        scope,
        organizationId: result.organizationId ?? null,
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
      updatedBy: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<SystemSetting[]> {
      for (const r of rows) {
        if (!isAllowedKey(r.key)) {
          throw new Error(`unknown_setting_key: ${r.key}`);
        }
      }
      const upsertRows = rows.map((r) => ({
        key: r.key,
        scope: "admin" as const,
        organizationId: resolveWriteOrganizationId(r.key, options),
        valueJson: r.valueJson,
        updatedBy,
      }));
      const saved = await port.upsertManyInTransaction(upsertRows);
      for (const s of saved) {
        void syncSettingToIntegrator({
          key: s.key,
          scope: s.scope,
          organizationId: s.organizationId ?? null,
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
      const { devMode, testAccounts } = await readRelayDevContext();
      if (!devMode) return true;
      if (testAccounts === null) return false;
      return relayRecipientAllowedInDevMode(ctx.channel, ctx.recipient, testAccounts);
    },

    /**
     * Снимок admin `dev_mode` + `test_account_identifiers` для оценки доставки (рассылки, предпросмотр relay).
     */
    getRelayDevContext: readRelayDevContext,

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

    /**
     * UUID шаблона промо-программы (`patient_default_promo_treatment_program_template_id`, admin, PER-ORG).
     * Пусто → null. `options.organizationId` — org-first-then-global fallback (см. `orgScopedKeys.ts`).
     */
    async getPatientDefaultPromoTreatmentProgramTemplateId(
      options: SystemSettingsReadOptions = {},
    ): Promise<string | null> {
      const row = await port.getByKey("patient_default_promo_treatment_program_template_id", "admin", options);
      if (row?.valueJson === null || row?.valueJson === undefined || typeof row.valueJson !== "object") {
        return null;
      }
      const inner = (row.valueJson as Record<string, unknown>).value;
      if (typeof inner !== "string") return null;
      const t = inner.trim();
      return t.length > 0 ? t : null;
    },
  };
}

export type SystemSettingsService = ReturnType<typeof createSystemSettingsService>;
