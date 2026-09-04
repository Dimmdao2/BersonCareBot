import { redactSettingValueForAudit } from '@/modules/system-settings/auditRedaction';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappSql,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import { sql, type SQL } from 'drizzle-orm';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type {
  PublicAuthChannelCapability,
  SettingsWriteUnitOfWork,
  SystemSettingsPort,
  SystemSettingsReadOptions,
  SystemSettingsUpsertRow,
  SystemSettingsWriteOptions,
} from '@/modules/system-settings/ports';
import type {
  SystemSetting,
  SystemSettingKey,
  SystemSettingScope,
} from '@/modules/system-settings/types';
import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import {
  getCurrentDbPrincipal,
  isWebappLockedMediaCronSource,
  runWithDbBootstrapPrincipal,
} from '@bersoncare/db-principal';

type SystemSettingRow = {
  key: string;
  scope: string;
  organization_id: string | null;
  value_json: unknown;
  updated_at: Date | string;
  updated_by: string | null;
};

function rowToSetting(row: SystemSettingRow): SystemSetting {
  return {
    key: row.key as SystemSettingKey,
    scope: row.scope as SystemSettingScope,
    organizationId: row.organization_id,
    valueJson: row.value_json,
    updatedAt: toIsoStringSafe(row.updated_at),
    updatedBy: row.updated_by,
  };
}

type SystemSettingValueRow = {
  scope: string;
  organization_id?: string | null;
  value_json: unknown;
};

export type MediaWorkerRuntimeSettingKey =
  | 'video_hls_pipeline_enabled'
  | 'video_hls_reconcile_enabled'
  | 'video_hls_new_uploads_auto_transcode'
  | 'video_watermark_enabled';

const MEDIA_WORKER_RUNTIME_SETTING_KEYS: ReadonlySet<string> = new Set([
  'video_hls_pipeline_enabled',
  'video_hls_reconcile_enabled',
  'video_hls_new_uploads_auto_transcode',
  'video_watermark_enabled',
]);

/**
 * Keys `app.read_webapp_preauth_provider_setting(text)` (migration 0343) exposes to the bare
 * bootstrap/nonstaff login, which has no SELECT on `system_settings` at all (TEST owner findings
 * 2026-08-03, D1: `oauth/start` 500'd empty-bodied on a raw table read under that principal).
 */
const PREAUTH_PROVIDER_SETTING_KEYS: ReadonlySet<string> = new Set([
  'yandex_oauth_client_id',
  'yandex_oauth_client_secret',
  'yandex_oauth_redirect_uri',
  'google_client_id',
  'google_client_secret',
  'google_oauth_login_redirect_uri',
  'apple_oauth_client_id',
  'apple_oauth_redirect_uri',
  'apple_oauth_team_id',
  'apple_oauth_key_id',
  'apple_oauth_private_key',
  'vk_id_application_id',
  'vk_id_client_secret',
  'vk_id_redirect_uri',
  'telegram_bot_token',
]);

const CURRENT_PATIENT_UI_SETTING_KEYS: ReadonlySet<SystemSettingKey> = new Set([
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_practice_target',
  'notifications_topics',
  'patient_default_promo_treatment_program_template_id',
  'booking_lifecycle_notifications',
]);

/**
 * The two booking-payment keys, read by two different principals through two different named roots.
 *
 * The patient reads them to be shown a checkout; the acquiring callback reads them to learn which
 * provider this clinic runs and with which webhook secret. Same keys, same `admin` scope, different
 * walls — so the key set is one constant and only the door differs below.
 */
const BOOKING_PAYMENT_SETTING_KEYS: ReadonlySet<SystemSettingKey> = new Set([
  'booking_payment_enabled',
  'booking_payment_providers',
]);

function parseSettingEnvelopeValue(valueJson: unknown): unknown | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const envelope = valueJson as Record<string, unknown>;
  return 'value' in envelope ? envelope.value : null;
}

export async function readMediaWorkerRuntimeSettingInnerValue(
  key: MediaWorkerRuntimeSettingKey,
): Promise<unknown | null> {
  const result = await runWebappSql<{ value_json: unknown }>(
    getWebappSqlDb(),
    sql`SELECT app.read_media_worker_runtime_setting(${key}) AS value_json`,
  );
  return parseSettingEnvelopeValue(result.rows[0]?.value_json ?? null);
}

export async function readSystemSettingInnerValueByScopes(
  key: string,
  scopes: readonly SystemSettingScope[],
  options: SystemSettingsReadOptions = {},
): Promise<unknown | null> {
  if (scopes.length === 0) return null;
  const organizationId = options.organizationId?.trim() || null;
  const r = organizationId
    ? await runWebappSql<SystemSettingValueRow>(
        getWebappSqlDb(),
        sql`SELECT DISTINCT ON (scope) scope, organization_id, value_json
           FROM system_settings
          WHERE key = ${key}
            AND scope = ANY(${sql.param([...scopes])}::text[])
            AND (organization_id = ${organizationId}::uuid OR organization_id IS NULL)
          ORDER BY scope, organization_id IS NULL ASC`,
      )
    : await runWebappSql<SystemSettingValueRow>(
        getWebappSqlDb(),
        sql`SELECT scope, organization_id, value_json
           FROM system_settings
          WHERE key = ${key} AND scope = ANY(${sql.param([...scopes])}::text[])
            AND organization_id IS NULL`,
      );
  for (const scope of scopes) {
    const row = r.rows.find((candidate) => candidate.scope === scope);
    if (!row) continue;
    const value = parseSettingEnvelopeValue(row.value_json);
    if (value !== null) return value;
  }
  return null;
}

export function systemSettingInnerValueToString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => String(item).trim()).filter(Boolean);
    return JSON.stringify(normalized);
  }
  return null;
}

async function readPreAuthProviderSettingInnerValue(key: string): Promise<unknown | null> {
  const r = await runWebappNamedRoot<{ value_json: unknown }>(
    getWebappSqlDb(),
    'app.read_webapp_preauth_provider_setting(text)',
    [key],
    sql`SELECT app.read_webapp_preauth_provider_setting(${key}::text) AS value_json`,
  );
  return parseSettingEnvelopeValue(r.rows[0]?.value_json ?? null);
}

export async function readAdminSystemSettingInnerValue(
  key: string,
  options: SystemSettingsReadOptions = {},
): Promise<unknown | null> {
  // The bootstrap principal never SET ROLEs (it only clears GUCs — see packages/db-principal), so
  // it stays on the bare login for the whole pre-auth request, which has no table SELECT on
  // system_settings at all. For the fixed OAuth/Telegram keys those routes need, go through the
  // narrow SECURITY DEFINER accessor instead; every other principal keeps the direct table read
  // unchanged (getByKey's patient-UI branch above is the same shape, one seam, split by key set).
  if (getCurrentDbPrincipal()?.kind === 'bootstrap' && PREAUTH_PROVIDER_SETTING_KEYS.has(key)) {
    return readPreAuthProviderSettingInnerValue(key);
  }
  const principal = getCurrentDbPrincipal();
  if (
    principal?.kind === 'infra' &&
    isWebappLockedMediaCronSource(principal.source) &&
    MEDIA_WORKER_RUNTIME_SETTING_KEYS.has(key)
  ) {
    return readMediaWorkerRuntimeSettingInnerValue(key as MediaWorkerRuntimeSettingKey);
  }
  return readSystemSettingInnerValueByScopes(key, ['admin'], options);
}

export async function readAdminSystemSettingString(
  key: string,
  options: SystemSettingsReadOptions = {},
): Promise<string | null> {
  return systemSettingInnerValueToString(await readAdminSystemSettingInnerValue(key, options));
}

/**
 * Reads only the exact clinic row. Connection credentials must not inherit an old global
 * value: that would direct two clinics' appointments into one calendar.
 */
export async function readExactOrganizationAdminSystemSettingString(
  key: string,
  organizationId: string,
): Promise<string | null> {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) return null;
  const result = await runWebappSql<SystemSettingValueRow>(
    getWebappSqlDb(),
    sql`SELECT scope, organization_id, value_json
       FROM system_settings
      WHERE key = ${key} AND scope = 'admin' AND organization_id = ${normalizedOrganizationId}::uuid
      LIMIT 1`,
  );
  return systemSettingInnerValueToString(parseSettingEnvelopeValue(result.rows[0]?.value_json));
}

export async function readAdminSystemSettingBoolean(
  key: string,
  defaultValue: boolean,
  options: SystemSettingsReadOptions = {},
): Promise<boolean> {
  const value = await readAdminSystemSettingInnerValue(key, options);
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return defaultValue;
}

export async function readPublicConfigBoolean(key: string): Promise<boolean | null> {
  const result = await runWebappSql<{ value: boolean | null }>(
    getWebappSqlDb(),
    sql`SELECT app.get_public_config_bool(${key}) AS value`,
  );
  return result.rows[0]?.value ?? null;
}

/**
 * Fixed-key credential capability for the platform SaaS payment provider (migration 0318).
 * Clinic billing and the bootstrap webhook can execute this function without receiving SELECT on
 * the shared credential table or a caller-controlled setting key.
 */
export async function readSaasBillingPaymentProviderValue(): Promise<unknown | null> {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind === 'bootstrap') {
    const result = await runWebappNamedRoot<{ value_json: unknown | null }>(
      getWebappSqlDb(),
      'app.read_saas_billing_payment_provider_preauth()',
      [],
      sql`SELECT app.read_saas_billing_payment_provider_preauth() AS value_json`,
    );
    return result.rows[0]?.value_json ?? null;
  }
  if (principal?.kind === 'clinicBilling') {
    const result = await runWebappNamedRoot<{ value_json: unknown | null }>(
      getWebappSqlDb(),
      'app.read_saas_billing_payment_provider_clinic()',
      [],
      sql`SELECT app.read_saas_billing_payment_provider_clinic() AS value_json`,
    );
    return result.rows[0]?.value_json ?? null;
  }
  if (principal?.kind === 'platform') {
    const result = await runWebappNamedRoot<{ value_json: unknown | null }>(
      getWebappSqlDb(),
      'app.read_saas_billing_payment_provider_platform()',
      [],
      sql`SELECT app.read_saas_billing_payment_provider_platform() AS value_json`,
    );
    return result.rows[0]?.value_json ?? null;
  }
  throw new Error(
    'SaaS billing payment provider requires bootstrap, clinic billing, or platform principal',
  );
}

/**
 * Boolean-only "is outbound SMTP configured?" read via `app.is_smtp_outbound_configured()`
 * (migration 0240) — never returns host/user/password/from, only their presence. Available to the
 * unauthenticated bootstrap login pool, unlike a direct `SELECT ... FROM system_settings`, which
 * that pool has no table privilege for (see authChannelPolicy.ts:isSmtpConfigured header).
 */
export async function readPublicAuthChannelConfigured(
  channel: PublicAuthChannelCapability,
): Promise<boolean> {
  const result = await runWithDbBootstrapPrincipal({ source: 'webapp-public-smtp-config' }, () => {
    switch (channel) {
      case 'email':
        return runWebappNamedRoot<{ configured: boolean | null }>(
          getWebappSqlDb(),
          'app.is_smtp_outbound_configured()',
          [],
          sql`SELECT app.is_smtp_outbound_configured() AS configured`,
        );
      case 'sms':
        return runWebappNamedRoot<{ configured: boolean | null }>(
          getWebappSqlDb(),
          'app.is_sms_provider_configured()',
          [],
          sql`SELECT app.is_sms_provider_configured() AS configured`,
        );
      case 'telegram':
        return runWebappNamedRoot<{ configured: boolean | null }>(
          getWebappSqlDb(),
          'app.is_telegram_login_configured()',
          [],
          sql`SELECT app.is_telegram_login_configured() AS configured`,
        );
      case 'max':
        return runWebappNamedRoot<{ configured: boolean | null }>(
          getWebappSqlDb(),
          'app.is_max_bot_configured()',
          [],
          sql`SELECT app.is_max_bot_configured() AS configured`,
        );
    }
  });
  return result.rows[0]?.configured === true;
}

/**
 * Single chokepoint for all system_settings writes.
 * Reads the current value, performs the upsert, and records an audit row —
 * all within the same executor (transaction-safe when `tx` is supplied).
 */
async function upsertWithAudit(
  key: string,
  scope: string,
  organizationId: string | null,
  valueJson: unknown,
  updatedBy: string | null,
  tx: WebappSqlExecutor,
): Promise<SystemSettingRow> {
  // 1. Read the current value (old state, NULL if first-set)
  const prevResult = organizationId
    ? await runWebappSql<{ value_json: unknown }>(
        tx,
        sql`SELECT value_json FROM system_settings WHERE key = ${key} AND scope = ${scope} AND organization_id = ${organizationId}::uuid`,
      )
    : await runWebappSql<{ value_json: unknown }>(
        tx,
        sql`SELECT value_json FROM system_settings WHERE key = ${key} AND scope = ${scope} AND organization_id IS NULL`,
      );
  const oldValueJson = prevResult.rows[0]?.value_json ?? null;

  // 2. Upsert the new value
  const r = organizationId
    ? await runWebappSql<SystemSettingRow>(
        tx,
        sql`INSERT INTO system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
         VALUES (${key}, ${scope}, ${organizationId}::uuid, ${JSON.stringify(valueJson)}::jsonb, now(), ${updatedBy})
         ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, scope, organization_id, value_json, updated_at, updated_by`,
      )
    : await runWebappSql<SystemSettingRow>(
        tx,
        sql`INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
         VALUES (${key}, ${scope}, ${JSON.stringify(valueJson)}::jsonb, now(), ${updatedBy})
         ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, scope, organization_id, value_json, updated_at, updated_by`,
      );

  // 3. Write audit row (same tx — both or neither)
  await runWebappSql(
    tx,
    sql`INSERT INTO system_settings_audit
       (key, scope, organization_id, old_value_json, new_value_json, changed_by, source)
     VALUES (${key}, ${scope}, ${organizationId}::uuid, ${oldValueJson !== null ? JSON.stringify(redactSettingValueForAudit(key, oldValueJson)) : null}::jsonb, ${JSON.stringify(redactSettingValueForAudit(key, valueJson))}::jsonb, ${updatedBy}, ${'system_settings_repo'})`,
  );

  return r.rows[0]!;
}

async function exactRowUpdatedAtForCompareAndSwap(
  key: string,
  scope: string,
  organizationId: string | null,
  tx: WebappSqlExecutor,
): Promise<string | null> {
  const identity = `${organizationId ?? 'global'}:${scope}:${key}`;
  await runWebappSql(tx, sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`);
  const current = organizationId
    ? await runWebappSql<{ updated_at: Date | string }>(
        tx,
        sql`SELECT updated_at FROM system_settings
          WHERE key = ${key} AND scope = ${scope} AND organization_id = ${organizationId}::uuid
          FOR UPDATE`,
      )
    : await runWebappSql<{ updated_at: Date | string }>(
        tx,
        sql`SELECT updated_at FROM system_settings
          WHERE key = ${key} AND scope = ${scope} AND organization_id IS NULL
          FOR UPDATE`,
      );
  return current.rows[0] ? toIsoStringSafe(current.rows[0].updated_at) : null;
}

/**
 * The two booking-payment keys reach `system_settings` through the door of the principal that asks,
 * because neither asking principal may read the table directly.
 *
 * `patient` — the checkout screen; the door checks an active enrolment.
 * `organization` — the acquiring callback, i.e. the port's `tenant_service` class. That class has no
 * through-relation capability at all («сквозной `purpose: 'relation'` этому классу не выдают»), so
 * the ordinary read below threw on the missing capability before any SQL was issued: the clinic's
 * own provider secret was unreachable, the callback could not be verified, and a charged patient's
 * ledger row stayed `pending` while the acquirer retried forever. Its door is the tenant twin of the
 * patient one — same two keys, tenant taken from the accepted context instead of an enrolment.
 *
 * Returns `undefined` when this principal has no such door and the ordinary read applies.
 */
async function readBookingPaymentSettingThroughItsOwnDoor(
  key: SystemSettingKey,
): Promise<unknown | null | undefined> {
  const principalKind = getCurrentDbPrincipal()?.kind;
  if (principalKind === 'patient') {
    const result = await runWebappNamedRoot<{ value_json: unknown | null }>(
      getWebappSqlDb(),
      'app.read_current_patient_booking_payment_setting(text)',
      [key],
      sql`SELECT app.read_current_patient_booking_payment_setting(${key}::text) AS value_json`,
    );
    return result.rows[0]?.value_json ?? null;
  }
  if (principalKind === 'organization') {
    const result = await runWebappNamedRoot<{ value_json: unknown | null }>(
      getWebappSqlDb(),
      'app.read_acquiring_webhook_booking_payment_setting(text)',
      [key],
      sql`SELECT app.read_acquiring_webhook_booking_payment_setting(${key}::text) AS value_json`,
    );
    return result.rows[0]?.value_json ?? null;
  }
  return undefined;
}

export function createPgSystemSettingsPort(): SystemSettingsPort {
  return {
    async getByKey(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting | null> {
      const bookingPaymentValueJson =
        scope === 'admin' && BOOKING_PAYMENT_SETTING_KEYS.has(key)
          ? await readBookingPaymentSettingThroughItsOwnDoor(key)
          : undefined;
      if (bookingPaymentValueJson !== undefined) {
        if (bookingPaymentValueJson === null) return null;
        return {
          key,
          scope,
          organizationId: options.organizationId?.trim() || null,
          valueJson: bookingPaymentValueJson,
          updatedAt: '',
          updatedBy: null,
        };
      }
      if (getCurrentDbPrincipal()?.kind === 'patient' && CURRENT_PATIENT_UI_SETTING_KEYS.has(key)) {
        const result = await runWithWebappDbOperationFamily('patient_ui_config', () =>
          runWebappSql<SystemSettingRow>(
            getWebappSqlDb(),
            sql`SELECT key, scope, organization_id, value_json, updated_at, updated_by
               FROM app.read_current_patient_ui_setting(${key}, ${scope})`,
          ),
        );
        return result.rows[0] ? rowToSetting(result.rows[0]) : null;
      }
      const organizationId = options.organizationId?.trim() || null;
      const r = organizationId
        ? await runWebappSql<SystemSettingRow>(
            getWebappSqlDb(),
            sql`SELECT key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings
             WHERE key = ${key}
               AND scope = ${scope}
               AND (organization_id = ${organizationId}::uuid OR organization_id IS NULL)
             ORDER BY organization_id IS NULL ASC
             LIMIT 1`,
          )
        : await runWebappSql<SystemSettingRow>(
            getWebappSqlDb(),
            sql`SELECT key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings WHERE key = ${key} AND scope = ${scope} AND organization_id IS NULL`,
          );
      if (!r.rows[0]) return null;
      return rowToSetting(r.rows[0]);
    },

    async getWebPushVapidPublicKeyOnly(): Promise<string | null> {
      const r = await runWebappNamedRoot<{ public_key: string | null }>(
        getWebappSqlDb(),
        'app.get_web_push_vapid_public_key()',
        [],
        sql`SELECT app.get_web_push_vapid_public_key() AS public_key`,
      );
      const v = r.rows[0]?.public_key;
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    },

    async getByScope(
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting[]> {
      const organizationId = options.organizationId?.trim() || null;
      const r = organizationId
        ? await runWebappSql<SystemSettingRow>(
            getWebappSqlDb(),
            sql`SELECT DISTINCT ON (key) key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings
             WHERE scope = ${scope}
               AND (organization_id = ${organizationId}::uuid OR organization_id IS NULL)
             ORDER BY key, organization_id IS NULL ASC`,
          )
        : await runWebappSql<SystemSettingRow>(
            getWebappSqlDb(),
            sql`SELECT key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings WHERE scope = ${scope} AND organization_id IS NULL ORDER BY key`,
          );
      return r.rows.map(rowToSetting);
    },

    async upsert(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      valueJson: unknown,
      updatedBy: string | null,
      options: SystemSettingsWriteOptions = {},
    ): Promise<SystemSetting> {
      return runWebappTransaction(async (tx) => {
        const organizationId = options.organizationId?.trim() || null;
        const row = await upsertWithAudit(key, scope, organizationId, valueJson, updatedBy, tx);
        return rowToSetting(row);
      });
    },

    async compareAndSwap(key, scope, valueJson, updatedBy, expectedUpdatedAt, options = {}) {
      return runWebappTransaction(async (tx) => {
        const organizationId = options.organizationId?.trim() || null;
        const currentToken = await exactRowUpdatedAtForCompareAndSwap(
          key,
          scope,
          organizationId,
          tx,
        );
        if (currentToken !== expectedUpdatedAt) return null;
        const persisted = await upsertWithAudit(
          key,
          scope,
          organizationId,
          valueJson,
          updatedBy,
          tx,
        );
        return rowToSetting(persisted);
      });
    },

    async upsertManyInTransaction(rows: SystemSettingsUpsertRow[]) {
      if (rows.length === 0) return [];
      return runWebappTransaction(async (tx) => {
        const out: SystemSetting[] = [];
        for (const row of rows) {
          const organizationId = row.organizationId?.trim() || null;
          const r = await upsertWithAudit(
            row.key,
            row.scope,
            organizationId,
            row.valueJson,
            row.updatedBy,
            tx,
          );
          out.push(rowToSetting(r));
        }
        return out;
      });
    },
    async delete(key, scope, updatedBy, options = {}) {
      return runWebappTransaction(async (tx) => {
        const organizationId = options.organizationId?.trim() || null;
        const deleted = organizationId
          ? await runWebappSql<{ value_json: unknown }>(
              tx,
              sql`DELETE FROM system_settings WHERE key = ${key} AND scope = ${scope} AND organization_id = ${organizationId}::uuid RETURNING value_json`,
            )
          : await runWebappSql<{ value_json: unknown }>(
              tx,
              sql`DELETE FROM system_settings WHERE key = ${key} AND scope = ${scope} AND organization_id IS NULL RETURNING value_json`,
            );
        if (!deleted.rows[0]) return false;
        await runWebappSql(
          tx,
          sql`INSERT INTO system_settings_audit (key, scope, organization_id, old_value_json, new_value_json, changed_by, source) VALUES (${key}, ${scope}, ${organizationId}::uuid, ${JSON.stringify(redactSettingValueForAudit(key, deleted.rows[0].value_json))}::jsonb, NULL, ${updatedBy}, ${'system_settings_repo_delete'})`,
        );
        return true;
      });
    },
  };
}

/** One transaction for canonical system_settings writes and its canonical audit. */
export function createPgSystemSettingsWriteUnitOfWork(): SettingsWriteUnitOfWork {
  return {
    async write(input) {
      return runWebappTransaction(async (tx) => {
        const saved: SystemSetting[] = [];
        for (const row of input.rows) {
          const organizationId = row.organizationId?.trim() || null;
          const persisted = await upsertWithAudit(
            row.key,
            row.scope,
            organizationId,
            row.valueJson,
            row.updatedBy,
            tx,
          );
          saved.push(rowToSetting(persisted));
        }
        return saved;
      });
    },

    async compareAndSwap(input) {
      return runWebappTransaction(async (tx) => {
        const row = input.row;
        const organizationId = row.organizationId?.trim() || null;
        const currentToken = await exactRowUpdatedAtForCompareAndSwap(
          row.key,
          row.scope,
          organizationId,
          tx,
        );
        if (currentToken !== input.expectedUpdatedAt) return null;

        const persisted = await upsertWithAudit(
          row.key,
          row.scope,
          organizationId,
          row.valueJson,
          row.updatedBy,
          tx,
        );
        return rowToSetting(persisted);
      });
    },
  };
}
