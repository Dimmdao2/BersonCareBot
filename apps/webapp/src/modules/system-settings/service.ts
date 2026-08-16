import {
  ALLOWED_KEYS,
  type SystemSettingKey,
  type SystemSettingScope,
  type SystemSetting,
} from './types';
import type {
  RuntimeReadTelemetry,
  RuntimeSettingsRepository,
  RuntimeWrite,
  SettingsWriteUnitOfWork,
  SystemSettingsPort,
  SystemSettingsReadOptions,
  SystemSettingsWriteOptions,
} from './ports';
import { SYSTEM_SETTING_REGISTRY } from './registry';
import {
  assertOperatorHealthProbeConfig,
  OPERATOR_HEALTH_PROBE_CONFIG_KEY,
} from './operatorHealthProbeConfig';
import type { ModesFormKey } from './modesFormKeys';
import {
  allowsPlatformGlobalFallbackWrite,
  isPerOrgSettingKey,
  SystemSettingsOrgContextRequiredError,
} from './orgScopedKeys';
import { normalizeValueJson } from './adminSettingsPatchNormalize';
import { invalidateConfigKey } from './configAdapter';
import {
  normalizeTestAccountIdentifiersValue,
  relayRecipientAllowedInDevMode,
  type TestAccountIdentifiers,
} from './testAccounts';
import { mergeBookingPaymentProvidersSecretsRetain } from '@/modules/payments/bookingPaymentSettings';
import { mergeSaasBillingPaymentProviderSecretsRetain } from '@/modules/saas-billing/settings';

type SystemSettingsServiceDependencies = {
  runtimeRepository?: RuntimeSettingsRepository;
  writeUnitOfWork?: SettingsWriteUnitOfWork;
  runtimeReadTelemetry?: RuntimeReadTelemetry;
  /**
   * Runtime rows are authoritative. Legacy parity reads are diagnostic only and must be skipped
   * for principals that deliberately have no access to the restricted legacy store.
   */
  shouldCompareRuntimeWithLegacy?: () => boolean;
};

type RuntimeReadTelemetryEvent = {
  key: string;
  source: 'runtime' | 'legacy_fallback' | 'mismatch';
  count: number;
};

/**
 * Emits a deliberately value-free, rate-bounded runtime-read signal. The Map is
 * bounded by key/source identities, and a given identity emits once initially
 * and then only at the configured interval. This is a diagnostic signal, not a
 * config store: it never accepts or retains setting values, actor, or org data.
 */
export function createBoundedRuntimeReadTelemetry(
  options: {
    maxEntries?: number;
    emitEvery?: number;
    emit?: (event: RuntimeReadTelemetryEvent) => void;
  } = {},
): RuntimeReadTelemetry {
  const maxEntries = options.maxEntries ?? 128;
  const emitEvery = options.emitEvery ?? 64;
  const emit =
    options.emit ??
    ((event: RuntimeReadTelemetryEvent) => {
      console.info('[system-settings] runtime-read', event);
    });
  const counts = new Map<string, number>();
  return {
    record(input: { key: string; source: 'runtime' | 'legacy_fallback' | 'mismatch' }) {
      const id = `${input.key}:${input.source}`;
      if (counts.size >= maxEntries && !counts.has(id)) return;
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      if (count === 1 || count % emitEvery === 0) {
        emit({ key: input.key, source: input.source, count });
      }
    },
  };
}

const boundedRuntimeTelemetry = createBoundedRuntimeReadTelemetry();

async function mergeWebPushVapidPrivateRetain(
  port: SystemSettingsPort,
  incoming: unknown,
  options: SystemSettingsReadOptions,
): Promise<{ value: unknown }> {
  const env = normalizeValueJson(incoming);
  const inner = env.value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return env;

  const o = { ...(inner as Record<string, unknown>) };
  const privRaw = typeof o.privateKey === 'string' ? o.privateKey.trim() : '';
  if (privRaw === '') {
    const prev = await port.getByKey('web_push_vapid', 'admin', options);
    let prevPriv = '';
    const prevVj = prev?.valueJson;
    if (
      prevVj !== null &&
      typeof prevVj === 'object' &&
      'value' in (prevVj as Record<string, unknown>)
    ) {
      const pv = (prevVj as Record<string, unknown>).value;
      if (pv !== null && typeof pv === 'object' && !Array.isArray(pv)) {
        const p = (pv as Record<string, unknown>).privateKey;
        if (typeof p === 'string') prevPriv = p.trim();
      }
    }
    o.privateKey = prevPriv;
  } else {
    o.privateKey = privRaw;
  }
  const pubRaw = typeof o.publicKey === 'string' ? o.publicKey.trim() : '';
  o.publicKey = pubRaw;
  return { value: o };
}

async function mergeSmtpOutboundPasswordRetain(
  port: SystemSettingsPort,
  key: 'smtp_outbound' | 'clinic_smtp_outbound',
  incoming: unknown,
  options: SystemSettingsReadOptions,
): Promise<{ value: unknown }> {
  const env = normalizeValueJson(incoming);
  const inner = env.value;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return env;

  const o = { ...(inner as Record<string, unknown>) };
  const pwdRaw = typeof o.password === 'string' ? o.password.trim() : '';
  if (pwdRaw === '') {
    const prev = await port.getByKey(key, 'admin', options);
    let prevPwd = '';
    const prevVj = prev?.valueJson;
    if (
      prevVj !== null &&
      typeof prevVj === 'object' &&
      'value' in (prevVj as Record<string, unknown>)
    ) {
      const pv = (prevVj as Record<string, unknown>).value;
      if (pv !== null && typeof pv === 'object' && !Array.isArray(pv)) {
        const p = (pv as Record<string, unknown>).password;
        if (typeof p === 'string') prevPwd = p;
      }
    }
    o.password = prevPwd;
  } else {
    o.password = pwdRaw;
  }
  return { value: o };
}

async function readTestAccountIdentifiersFromPort(
  port: SystemSettingsPort,
): Promise<TestAccountIdentifiers | null> {
  const row = await port.getByKey('test_account_identifiers', 'admin');
  if (!row?.valueJson || typeof row.valueJson !== 'object') return null;
  const inner = (row.valueJson as Record<string, unknown>).value;
  const parsed = normalizeTestAccountIdentifiersValue(inner);
  return parsed;
}

export function createSystemSettingsService(
  port: SystemSettingsPort,
  dependencies: SystemSettingsServiceDependencies = {},
) {
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
  function resolveWriteOrganizationId(
    key: string,
    options: SystemSettingsWriteOptions,
  ): string | null {
    if (!isPerOrgSettingKey(key)) return null;
    const organizationId = options.organizationId?.trim() || null;
    if (!organizationId) {
      if (
        options.allowPlatformGlobalFallbackWrite === true &&
        allowsPlatformGlobalFallbackWrite(key)
      ) {
        return null;
      }
      throw new SystemSettingsOrgContextRequiredError(key);
    }
    return organizationId;
  }

  async function readRelayDevContext(): Promise<{
    devMode: boolean;
    testAccounts: TestAccountIdentifiers | null;
  }> {
    const devModeSetting = await port.getByKey('dev_mode', 'admin');
    const devMode =
      devModeSetting?.valueJson !== null &&
      typeof devModeSetting?.valueJson === 'object' &&
      (devModeSetting.valueJson as Record<string, unknown>).value === true;

    if (!devMode) {
      return { devMode: false, testAccounts: null };
    }
    const testAccounts = await readTestAccountIdentifiersFromPort(port);
    return { devMode: true, testAccounts };
  }

  function runtimeWritesFor(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    organizationId: string | null,
    valueJson: unknown,
    updatedBy: string | null,
  ): RuntimeWrite[] {
    const definition = SYSTEM_SETTING_REGISTRY[key];
    if (definition.storage === 'runtime') {
      return [{ key, scope, organizationId, audience: definition.audience, valueJson, updatedBy }];
    }
    // Mixed/restricted envelopes remain legacy-authoritative. The legacy DB
    // trigger owns their VAPID/payment safe projections, so this path only
    // returns registry storage=runtime rows that receive the explicit bypass.
    return [];
  }

  async function writeRows(
    rows: Array<{
      key: SystemSettingKey;
      scope: SystemSettingScope;
      organizationId: string | null;
      valueJson: unknown;
      updatedBy: string | null;
    }>,
  ) {
    if (!dependencies.writeUnitOfWork) {
      return rows.length === 1
        ? [
            await port.upsert(
              rows[0]!.key,
              rows[0]!.scope,
              rows[0]!.valueJson,
              rows[0]!.updatedBy,
              { organizationId: rows[0]!.organizationId },
            ),
          ]
        : port.upsertManyInTransaction(rows);
    }
    return dependencies.writeUnitOfWork.write({
      legacyRows: rows,
      authoritativeRuntimeRows: rows.flatMap((row) =>
        runtimeWritesFor(row.key, row.scope, row.organizationId, row.valueJson, row.updatedBy),
      ),
    });
  }

  async function compareAndSwapRow(
    row: {
      key: SystemSettingKey;
      scope: SystemSettingScope;
      organizationId: string | null;
      valueJson: unknown;
      updatedBy: string | null;
    },
    expectedUpdatedAt: string | null,
  ): Promise<SystemSetting | null> {
    if (dependencies.writeUnitOfWork?.compareAndSwap) {
      return dependencies.writeUnitOfWork.compareAndSwap({
        legacyRow: row,
        authoritativeRuntimeRows: runtimeWritesFor(
          row.key,
          row.scope,
          row.organizationId,
          row.valueJson,
          row.updatedBy,
        ),
        expectedUpdatedAt,
      });
    }
    if (!port.compareAndSwap) throw new Error('system_settings_compare_and_swap_unavailable');
    return port.compareAndSwap(
      row.key,
      row.scope,
      row.valueJson,
      row.updatedBy,
      expectedUpdatedAt,
      { organizationId: row.organizationId },
    );
  }

  async function valueForWrite(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    value: unknown,
    options: SystemSettingsWriteOptions,
  ): Promise<unknown> {
    if (key === 'operator_health_imap' && scope === 'admin') {
      const env = normalizeValueJson(value);
      const inner = env.value;
      if (
        inner &&
        typeof inner === 'object' &&
        !Array.isArray(inner) &&
        !(inner as Record<string, unknown>).password
      ) {
        const previous = await port.getByKey('operator_health_imap', 'admin', options);
        const previousInner =
          previous?.valueJson &&
          typeof previous.valueJson === 'object' &&
          'value' in previous.valueJson
            ? (previous.valueJson as Record<string, unknown>).value
            : null;
        const password =
          previousInner && typeof previousInner === 'object'
            ? (previousInner as Record<string, unknown>).password
            : '';
        return { value: { ...(inner as Record<string, unknown>), password } };
      }
      return env;
    }
    return (key === 'smtp_outbound' || key === 'clinic_smtp_outbound') && scope === 'admin'
      ? mergeSmtpOutboundPasswordRetain(port, key, value, options)
      : key === 'web_push_vapid' && scope === 'admin'
        ? mergeWebPushVapidPrivateRetain(port, value, options)
        : key === 'booking_payment_providers' && scope === 'admin'
          ? mergeBookingPaymentProvidersSecretsRetain(
              () =>
                port
                  .getByKey('booking_payment_providers', 'admin', options)
                  .then((r) => r?.valueJson ?? null),
              value,
            )
          : key === 'saas_billing_payment_provider' && scope === 'admin'
            ? mergeSaasBillingPaymentProviderSecretsRetain(
                () =>
                  port
                    .getByKey('saas_billing_payment_provider', 'admin', options)
                    .then((row) => row?.valueJson ?? null),
                value,
              )
            : value;
  }

  async function getSettingWithRuntimeFirst(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    options: SystemSettingsReadOptions = {},
  ): Promise<SystemSetting | null> {
    const definition = SYSTEM_SETTING_REGISTRY[key];
    if (definition.storage !== 'runtime' || !dependencies.runtimeRepository) {
      return port.getByKey(key, scope, options);
    }
    const organizationId = options.organizationId?.trim() || null;
    const runtime = await dependencies.runtimeRepository.getEffective({
      key,
      scope,
      organizationId,
      allowedAudiences: [definition.audience],
      operationFamily: 'auth_role_config',
    });
    const telemetry = dependencies.runtimeReadTelemetry ?? boundedRuntimeTelemetry;
    if (!runtime) {
      telemetry.record({ key, source: 'legacy_fallback' });
      return port.getByKey(key, scope, options);
    }
    telemetry.record({ key, source: 'runtime' });
    if (dependencies.shouldCompareRuntimeWithLegacy?.() !== false) {
      const legacy = await port.getByKey(key, scope, options);
      if (legacy && JSON.stringify(legacy.valueJson) !== JSON.stringify(runtime.valueJson)) {
        telemetry.record({ key, source: 'mismatch' });
      }
    }
    return {
      key,
      scope,
      organizationId: runtime.organizationId,
      valueJson: runtime.valueJson,
      updatedAt: runtime.updatedAt ?? '',
      updatedBy: runtime.updatedBy ?? null,
    };
  }

  return {
    getSetting(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options?: SystemSettingsReadOptions,
    ): Promise<SystemSetting | null> {
      return getSettingWithRuntimeFirst(key, scope, options);
    },

    async listSettingsByScope(
      scope: SystemSettingScope,
      options?: SystemSettingsReadOptions,
    ): Promise<SystemSetting[]> {
      if (!dependencies.runtimeRepository) return port.getByScope(scope, options);
      const legacy = await port.getByScope(scope, options);
      const runtimeRows = await dependencies.runtimeRepository.getSnapshotRows({
        scope,
        organizationId: options?.organizationId?.trim() || null,
        allowedAudiences: ['server', 'authenticated_client', 'public'],
      });
      const byKey = new Map(legacy.map((row) => [row.key, row]));
      for (const row of runtimeRows) {
        const definition = SYSTEM_SETTING_REGISTRY[row.key as SystemSettingKey];
        if (!definition || definition.storage !== 'runtime') continue;
        byKey.set(row.key as SystemSettingKey, {
          key: row.key as SystemSettingKey,
          scope: row.scope as SystemSettingScope,
          organizationId: row.organizationId,
          valueJson: row.valueJson,
          updatedAt: row.updatedAt ?? '',
          updatedBy: row.updatedBy ?? null,
        });
      }
      return [...byKey.values()];
    },

    getWebPushVapidPublicKeyOnly(): Promise<string | null> {
      return port.getWebPushVapidPublicKeyOnly();
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
      if (key === OPERATOR_HEALTH_PROBE_CONFIG_KEY) assertOperatorHealthProbeConfig(value);
      const valueToStore = await valueForWrite(key, scope, value, options);
      const organizationId = resolveWriteOrganizationId(key, options);
      const [result] = await writeRows([
        { key, scope, valueJson: valueToStore, updatedBy, organizationId },
      ]);
      if (!result) throw new Error('system_settings_write_failed');
      invalidateConfigKey(key);
      return result;
    },

    async updateSettingIfUnchanged(
      key: string,
      scope: SystemSettingScope,
      value: unknown,
      updatedBy: string | null,
      expectedUpdatedAt: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<SystemSetting | null> {
      if (!isAllowedKey(key)) throw new Error(`unknown_setting_key: ${key}`);
      if (key === OPERATOR_HEALTH_PROBE_CONFIG_KEY) assertOperatorHealthProbeConfig(value);
      const valueToStore = await valueForWrite(key, scope, value, options);
      const organizationId = resolveWriteOrganizationId(key, options);
      const result = await compareAndSwapRow(
        { key, scope, valueJson: valueToStore, updatedBy, organizationId },
        expectedUpdatedAt,
      );
      if (!result) return null;
      invalidateConfigKey(key);
      return result;
    },
    async clearSetting(
      key: string,
      scope: SystemSettingScope,
      updatedBy: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<boolean> {
      if (!isAllowedKey(key)) throw new Error(`unknown_setting_key: ${key}`);
      const organizationId = resolveWriteOrganizationId(key, options);
      if (!port.delete) throw new Error('system_settings_delete_unavailable');
      const deleted = await port.delete(key, scope, updatedBy, { organizationId });
      if (deleted) invalidateConfigKey(key);
      return deleted;
    },

    /** Persists a pre-normalized «Режимы» batch (one DB transaction), then invalidates config cache. */
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
        scope: 'admin' as const,
        organizationId: resolveWriteOrganizationId(r.key, options),
        valueJson: r.valueJson,
        updatedBy,
      }));
      const saved = await writeRows(upsertRows);
      for (const s of saved) {
        invalidateConfigKey(s.key);
      }
      return saved;
    },

    /** Atomically commits the error-tracking opt-in and DSN projections. */
    async persistErrorTrackingConfig(
      input: Readonly<{ enabled: boolean; dsn: string }>,
      updatedBy: string | null,
    ): Promise<SystemSetting[]> {
      const rows = [
        { key: 'error_tracking_enabled' as const, valueJson: { value: input.enabled } },
        { key: 'error_tracking_dsn' as const, valueJson: { value: input.dsn } },
      ];
      const saved = await writeRows(
        rows.map((row) => ({
          ...row,
          scope: 'admin' as const,
          organizationId: null,
          updatedBy,
        })),
      );
      for (const setting of saved) {
        invalidateConfigKey(setting.key);
      }
      return saved;
    },

    /**
     * Dev-mode guard для relay-outbound: при `dev_mode` сравниваются `channel` и `recipient` с `test_account_identifiers`
     * (`telegramIds` / `maxIds` через `relayRecipientAllowedInDevMode`). Поле `phones` в том же ключе используется для
     * allowlist доставки relay; bypass техработ пациента проверяется отдельной boolean-only DB capability.
     */
    async shouldDispatchRelayToRecipient(ctx: {
      channel: string;
      recipient: string;
    }): Promise<boolean> {
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
    async isCurrentPatientTestAccount(): Promise<boolean> {
      return port.isCurrentPatientTestAccount();
    },

    /**
     * UUID шаблона промо-программы (`patient_default_promo_treatment_program_template_id`, admin, PER-ORG).
     * Пусто → null. `options.organizationId` — org-first-then-global fallback (см. `orgScopedKeys.ts`).
     */
    async getPatientDefaultPromoTreatmentProgramTemplateId(
      options: SystemSettingsReadOptions = {},
    ): Promise<string | null> {
      const row = await port.getByKey(
        'patient_default_promo_treatment_program_template_id',
        'admin',
        options,
      );
      if (
        row?.valueJson === null ||
        row?.valueJson === undefined ||
        typeof row.valueJson !== 'object'
      ) {
        return null;
      }
      const inner = (row.valueJson as Record<string, unknown>).value;
      if (typeof inner !== 'string') return null;
      const t = inner.trim();
      return t.length > 0 ? t : null;
    },
  };
}

export type SystemSettingsService = ReturnType<typeof createSystemSettingsService>;
