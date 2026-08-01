import { redactSettingValueForAudit } from '@/modules/system-settings/auditRedaction';
import {
  getWebappSqlDb,
  runWebappPgText,
  runWebappSql,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import { sql, type SQL } from 'drizzle-orm';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type {
  PublicAuthChannelCapability,
  RuntimeWrite,
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

const CURRENT_PATIENT_UI_SETTING_KEYS: ReadonlySet<SystemSettingKey> = new Set([
  'patient_home_mood_icons',
  'patient_home_daily_warmup_repeat_cooldown_minutes',
  'patient_home_daily_warmup_rotation_enabled',
  'patient_home_daily_warmup_rotation_times',
  'patient_home_daily_practice_target',
  'notifications_topics',
  'patient_default_promo_treatment_program_template_id',
]);

function parseSettingEnvelopeValue(valueJson: unknown): unknown | null {
  if (valueJson === null || typeof valueJson !== 'object' || Array.isArray(valueJson)) return null;
  const envelope = valueJson as Record<string, unknown>;
  return 'value' in envelope ? envelope.value : null;
}

export async function readSystemSettingInnerValueByScopes(
  key: string,
  scopes: readonly SystemSettingScope[],
  options: SystemSettingsReadOptions = {},
): Promise<unknown | null> {
  if (scopes.length === 0) return null;
  const organizationId = options.organizationId?.trim() || null;
  const r = organizationId
    ? await runWebappPgText<SystemSettingValueRow>(
        `SELECT DISTINCT ON (scope) scope, organization_id, value_json
           FROM system_settings
          WHERE key = $1
            AND scope = ANY($2::text[])
            AND (organization_id = $3::uuid OR organization_id IS NULL)
          ORDER BY scope, organization_id IS NULL ASC`,
        [key, [...scopes], organizationId],
      )
    : await runWebappPgText<SystemSettingValueRow>(
        `SELECT scope, organization_id, value_json
           FROM system_settings
          WHERE key = $1 AND scope = ANY($2::text[])
            AND organization_id IS NULL`,
        [key, [...scopes]],
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

export async function readAdminSystemSettingInnerValue(
  key: string,
  options: SystemSettingsReadOptions = {},
): Promise<unknown | null> {
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
  const result = await runWebappPgText<SystemSettingValueRow>(
    `SELECT scope, organization_id, value_json
       FROM system_settings
      WHERE key = $1 AND scope = 'admin' AND organization_id = $2::uuid
      LIMIT 1`,
    [key, normalizedOrganizationId],
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
  const result = await runWebappPgText<{ value: boolean | null }>(
    'SELECT app.get_public_config_bool($1) AS value',
    [key],
  );
  return result.rows[0]?.value ?? null;
}

/**
 * Boolean-only "is outbound SMTP configured?" read via `app.is_smtp_outbound_configured()`
 * (migration 0240) — never returns host/user/password/from, only their presence. Available to the
 * unauthenticated bootstrap login pool, unlike a direct `SELECT ... FROM system_settings`, which
 * that pool has no table privilege for (see authChannelPolicy.ts:isSmtpConfigured header).
 */
const AUTH_CHANNEL_CONFIGURED_QUERY = {
  email: sql`SELECT app.is_smtp_outbound_configured() AS configured`,
  sms: sql`SELECT app.is_sms_provider_configured() AS configured`,
  telegram: sql`SELECT app.is_telegram_login_configured() AS configured`,
  max: sql`SELECT app.is_max_bot_configured() AS configured`,
} as const satisfies Record<PublicAuthChannelCapability, SQL>;

export async function readPublicAuthChannelConfigured(
  channel: PublicAuthChannelCapability,
): Promise<boolean> {
  const result = await runWithDbBootstrapPrincipal(
    { source: 'webapp-public-smtp-config' },
    () =>
      runWebappSql<{ configured: boolean | null }>(
        getWebappSqlDb(),
        AUTH_CHANNEL_CONFIGURED_QUERY[channel],
      ),
  );
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
    ? await runWebappPgText<{ value_json: unknown }>(
        `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2 AND organization_id = $3::uuid`,
        [key, scope, organizationId],
        tx,
      )
    : await runWebappPgText<{ value_json: unknown }>(
        `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2 AND organization_id IS NULL`,
        [key, scope],
        tx,
      );
  const oldValueJson = prevResult.rows[0]?.value_json ?? null;

  // 2. Upsert the new value
  const r = organizationId
    ? await runWebappPgText<SystemSettingRow>(
        `INSERT INTO system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
         VALUES ($1, $2, $3::uuid, $4::jsonb, now(), $5)
         ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, scope, organization_id, value_json, updated_at, updated_by`,
        [key, scope, organizationId, JSON.stringify(valueJson), updatedBy],
        tx,
      )
    : await runWebappPgText<SystemSettingRow>(
        `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, now(), $4)
         ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, scope, organization_id, value_json, updated_at, updated_by`,
        [key, scope, JSON.stringify(valueJson), updatedBy],
        tx,
      );

  // 3. Write audit row (same tx — both or neither)
  await runWebappPgText(
    `INSERT INTO system_settings_audit
       (key, scope, organization_id, old_value_json, new_value_json, changed_by, source)
     VALUES ($1, $2, $3::uuid, $4::jsonb, $5::jsonb, $6, $7)`,
    [
      key,
      scope,
      organizationId,
      oldValueJson !== null ? JSON.stringify(redactSettingValueForAudit(key, oldValueJson)) : null,
      JSON.stringify(redactSettingValueForAudit(key, valueJson)),
      updatedBy,
      'system_settings_repo',
    ],
    tx,
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
  await runWebappPgText('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity], tx);
  const current = organizationId
    ? await runWebappPgText<{ updated_at: Date | string }>(
        `SELECT updated_at FROM system_settings
          WHERE key = $1 AND scope = $2 AND organization_id = $3::uuid
          FOR UPDATE`,
        [key, scope, organizationId],
        tx,
      )
    : await runWebappPgText<{ updated_at: Date | string }>(
        `SELECT updated_at FROM system_settings
          WHERE key = $1 AND scope = $2 AND organization_id IS NULL
          FOR UPDATE`,
        [key, scope],
        tx,
      );
  return current.rows[0] ? toIsoStringSafe(current.rows[0].updated_at) : null;
}

export function createPgSystemSettingsPort(): SystemSettingsPort {
  return {
    async getByKey(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting | null> {
      if (getCurrentDbPrincipal()?.kind === 'patient' && CURRENT_PATIENT_UI_SETTING_KEYS.has(key)) {
        const result = await runWithWebappDbOperationFamily('patient_ui_config', () =>
          runWebappPgText<SystemSettingRow>(
            `SELECT key, scope, organization_id, value_json, updated_at, updated_by
               FROM app.read_current_patient_ui_setting($1, $2)`,
            [key, scope],
          ),
        );
        return result.rows[0] ? rowToSetting(result.rows[0]) : null;
      }
      const organizationId = options.organizationId?.trim() || null;
      const r = organizationId
        ? await runWebappPgText<SystemSettingRow>(
            `SELECT key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings
             WHERE key = $1
               AND scope = $2
               AND (organization_id = $3::uuid OR organization_id IS NULL)
             ORDER BY organization_id IS NULL ASC
             LIMIT 1`,
            [key, scope, organizationId],
          )
        : await runWebappPgText<SystemSettingRow>(
            `SELECT key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings WHERE key = $1 AND scope = $2 AND organization_id IS NULL`,
            [key, scope],
          );
      if (!r.rows[0]) return null;
      return rowToSetting(r.rows[0]);
    },

    async getWebPushVapidPublicKeyOnly(): Promise<string | null> {
      const r = await runWebappPgText<{ public_key: string | null }>(
        `SELECT app.get_web_push_vapid_public_key() AS public_key`,
      );
      const v = r.rows[0]?.public_key;
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    },

    async isCurrentPatientTestAccount(): Promise<boolean> {
      const r = await runWithWebappDbOperationFamily('patient_identity_exception_check', () =>
        runWebappPgText<{ allowed: boolean }>(
          `SELECT app.is_current_patient_test_account() AS allowed`,
        ),
      );
      return r.rows[0]?.allowed === true;
    },

    async getByScope(
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting[]> {
      const organizationId = options.organizationId?.trim() || null;
      const r = organizationId
        ? await runWebappPgText<SystemSettingRow>(
            `SELECT DISTINCT ON (key) key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings
             WHERE scope = $1
               AND (organization_id = $2::uuid OR organization_id IS NULL)
             ORDER BY key, organization_id IS NULL ASC`,
            [scope, organizationId],
          )
        : await runWebappPgText<SystemSettingRow>(
            `SELECT key, scope, organization_id, value_json, updated_at, updated_by
             FROM system_settings WHERE scope = $1 AND organization_id IS NULL ORDER BY key`,
            [scope],
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
          ? await runWebappPgText<{ value_json: unknown }>(
              `DELETE FROM system_settings WHERE key = $1 AND scope = $2 AND organization_id = $3::uuid RETURNING value_json`,
              [key, scope, organizationId],
              tx,
            )
          : await runWebappPgText<{ value_json: unknown }>(
              `DELETE FROM system_settings WHERE key = $1 AND scope = $2 AND organization_id IS NULL RETURNING value_json`,
              [key, scope],
              tx,
            );
        if (!deleted.rows[0]) return false;
        await runWebappPgText(
          `DELETE FROM public.app_runtime_settings WHERE key = $1 AND scope = $2 AND organization_id IS NOT DISTINCT FROM $3::uuid`,
          [key, scope, organizationId],
          tx,
        );
        await runWebappPgText(
          `INSERT INTO system_settings_audit (key, scope, organization_id, old_value_json, new_value_json, changed_by, source) VALUES ($1, $2, $3::uuid, $4::jsonb, NULL, $5, $6)`,
          [
            key,
            scope,
            organizationId,
            JSON.stringify(redactSettingValueForAudit(key, deleted.rows[0].value_json)),
            updatedBy,
            'system_settings_repo_delete',
          ],
          tx,
        );
        return true;
      });
    },
  };
}

type RuntimeSettingWriteRow = {
  key: string;
  scope: string;
  organization_id: string | null;
  audience: string;
  value_json: unknown;
  updated_at: Date | string;
  updated_by: string | null;
};

async function upsertRuntimeInTransaction(row: RuntimeWrite, tx: WebappSqlExecutor): Promise<void> {
  await runWebappPgText(
    "SELECT set_config('app.runtime_settings_audit_source', 'system_settings_dual_write', true)",
    [],
    tx,
  );
  const result = row.organizationId
    ? await runWebappPgText<RuntimeSettingWriteRow>(
        `INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by)
         VALUES ($1, $2, $3::uuid, $4, $5::jsonb, now(), $6)
         ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
           SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by
         RETURNING key, scope, organization_id, audience, value_json, updated_at, updated_by`,
        [
          row.key,
          row.scope,
          row.organizationId,
          row.audience,
          JSON.stringify(row.valueJson),
          row.updatedBy,
        ],
        tx,
      )
    : await runWebappPgText<RuntimeSettingWriteRow>(
        `INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by)
         VALUES ($1, $2, NULL, $3, $4::jsonb, now(), $5)
         ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
           SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by
         RETURNING key, scope, organization_id, audience, value_json, updated_at, updated_by`,
        [row.key, row.scope, row.audience, JSON.stringify(row.valueJson), row.updatedBy],
        tx,
      );
  if (!result.rows[0]) throw new Error('runtime_settings_write_failed');
}

/**
 * S5-3 transaction boundary. Runtime rows are authoritative; their legacy rows are
 * written only for compatibility and carry a transaction-local trigger bypass. The
 * legacy trigger remains active for restricted/manual/ops writers and their derived projections.
 */
export function createPgSystemSettingsWriteUnitOfWork(): SettingsWriteUnitOfWork {
  return {
    async write(input) {
      return runWebappTransaction(async (tx) => {
        const runtimeByIdentity = new Map(
          input.authoritativeRuntimeRows.map((row) => [
            `${row.organizationId ?? 'global'}:${row.scope}:${row.key}`,
            row,
          ]),
        );
        const saved: SystemSetting[] = [];
        for (const legacyRow of input.legacyRows) {
          const organizationId = legacyRow.organizationId?.trim() || null;
          const identity = `${organizationId ?? 'global'}:${legacyRow.scope}:${legacyRow.key}`;
          const runtimeRow = runtimeByIdentity.get(identity);
          if (runtimeRow) {
            await upsertRuntimeInTransaction(runtimeRow, tx);
            await runWebappPgText(
              "SELECT set_config('app.runtime_settings_explicit_dual_write', 'on', true)",
              [],
              tx,
            );
          }
          const persisted = await upsertWithAudit(
            legacyRow.key,
            legacyRow.scope,
            organizationId,
            legacyRow.valueJson,
            legacyRow.updatedBy,
            tx,
          );
          saved.push(rowToSetting(persisted));
          if (runtimeRow) {
            await runWebappPgText(
              "SELECT set_config('app.runtime_settings_explicit_dual_write', 'off', true)",
              [],
              tx,
            );
            runtimeByIdentity.delete(identity);
          }
        }
        // Only registry runtime rows reach this fallback path. Mixed/restricted
        // envelopes never enter authoritativeRuntimeRows: their legacy trigger
        // owns VAPID/payment/OAuth/SMS safe derived projections.
        for (const row of runtimeByIdentity.values()) {
          await upsertRuntimeInTransaction(row, tx);
        }
        return saved;
      });
    },

    async compareAndSwap(input) {
      return runWebappTransaction(async (tx) => {
        const legacyRow = input.legacyRow;
        const organizationId = legacyRow.organizationId?.trim() || null;
        const currentToken = await exactRowUpdatedAtForCompareAndSwap(
          legacyRow.key,
          legacyRow.scope,
          organizationId,
          tx,
        );
        if (currentToken !== input.expectedUpdatedAt) return null;

        for (const runtimeRow of input.authoritativeRuntimeRows) {
          await upsertRuntimeInTransaction(runtimeRow, tx);
          await runWebappPgText(
            "SELECT set_config('app.runtime_settings_explicit_dual_write', 'on', true)",
            [],
            tx,
          );
        }
        const persisted = await upsertWithAudit(
          legacyRow.key,
          legacyRow.scope,
          organizationId,
          legacyRow.valueJson,
          legacyRow.updatedBy,
          tx,
        );
        if (input.authoritativeRuntimeRows.length > 0) {
          await runWebappPgText(
            "SELECT set_config('app.runtime_settings_explicit_dual_write', 'off', true)",
            [],
            tx,
          );
        }
        return rowToSetting(persisted);
      });
    },
  };
}
