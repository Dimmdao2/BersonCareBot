import {
  ALLOWED_KEYS,
  type SystemSettingKey,
  type SystemSettingScope,
  type SystemSetting,
} from './types';
import type {
  RuntimeSettingsRepository,
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
import { mergeBookingPaymentProvidersSecretsRetain } from '@/modules/payments/bookingPaymentSettings';
import { mergeSaasBillingPaymentProviderSecretsRetain } from '@/modules/saas-billing/settings';
import {
  parsePlatformIntegrationAvailabilityEnvelope,
  type PlatformIntegrationAvailability,
} from './platformIntegrationAvailability';

type SystemSettingsServiceDependencies = {
  runtimeRepository?: RuntimeSettingsRepository;
  writeUnitOfWork?: SettingsWriteUnitOfWork;
};

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
): Promise<{ value: unknown; deliveryReadiness?: unknown }> {
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
  return key === 'clinic_smtp_outbound' && 'deliveryReadiness' in env
    ? { value: o, deliveryReadiness: env.deliveryReadiness }
    : { value: o };
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
    return dependencies.writeUnitOfWork.write({ rows });
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
        row,
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

  async function getSettingFromCanonicalRoot(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    options: SystemSettingsReadOptions = {},
  ): Promise<SystemSetting | null> {
    return port.getByKey(key, scope, options);
  }

  return {
    async getClinicPlatformIntegrationAvailability(): Promise<PlatformIntegrationAvailability> {
      const row = await dependencies.runtimeRepository?.getClinicPlatformIntegrationAvailability();
      return parsePlatformIntegrationAvailabilityEnvelope(row?.valueJson);
    },

    getSetting(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options?: SystemSettingsReadOptions,
    ): Promise<SystemSetting | null> {
      return getSettingFromCanonicalRoot(key, scope, options);
    },

    async listSettingsByScope(
      scope: SystemSettingScope,
      options?: SystemSettingsReadOptions,
    ): Promise<SystemSetting[]> {
      return port.getByScope(scope, options);
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

    /** Validates and commits one organization settings form as a single write unit. */
    async persistSettingsBatch(
      rows: Array<{ key: string; scope: SystemSettingScope; value: unknown }>,
      updatedBy: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<SystemSetting[]> {
      const normalizedRows = [];
      for (const row of rows) {
        if (!isAllowedKey(row.key)) throw new Error(`unknown_setting_key: ${row.key}`);
        normalizedRows.push({
          key: row.key,
          scope: row.scope,
          organizationId: resolveWriteOrganizationId(row.key, options),
          valueJson: await valueForWrite(row.key, row.scope, row.value, options),
          updatedBy,
        });
      }
      const saved = await writeRows(normalizedRows);
      for (const setting of saved) invalidateConfigKey(setting.key);
      return saved;
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
