import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type {
  SystemSettingsPort,
  SystemSettingsReadOptions,
  SystemSettingsUpsertRow,
} from "@/modules/system-settings/ports";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";
import type { WebappSqlExecutor } from "@/infra/db/runWebappSql";

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

function parseSettingEnvelopeValue(valueJson: unknown): unknown | null {
  if (valueJson === null || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const envelope = valueJson as Record<string, unknown>;
  return "value" in envelope ? envelope.value : null;
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
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    const normalized = value.map((item) => String(item).trim()).filter(Boolean);
    return normalized.length > 0 ? JSON.stringify(normalized) : null;
  }
  return null;
}

export async function readAdminSystemSettingInnerValue(
  key: string,
  options: SystemSettingsReadOptions = {},
): Promise<unknown | null> {
  return readSystemSettingInnerValueByScopes(key, ["admin"], options);
}

export async function readAdminSystemSettingString(
  key: string,
  options: SystemSettingsReadOptions = {},
): Promise<string | null> {
  return systemSettingInnerValueToString(await readAdminSystemSettingInnerValue(key, options));
}

export async function readAdminSystemSettingBoolean(
  key: string,
  defaultValue: boolean,
  options: SystemSettingsReadOptions = {},
): Promise<boolean> {
  const value = await readAdminSystemSettingInnerValue(key, options);
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return defaultValue;
}

/**
 * Single chokepoint for all system_settings writes.
 * Reads the current value, performs the upsert, and records an audit row —
 * all within the same executor (transaction-safe when `tx` is supplied).
 */
async function upsertWithAudit(
  key: string,
  scope: string,
  valueJson: unknown,
  updatedBy: string | null,
  tx: WebappSqlExecutor,
): Promise<SystemSettingRow> {
  // 1. Read the current value (old state, NULL if first-set)
  const prevResult = await runWebappPgText<{ value_json: unknown }>(
    `SELECT value_json FROM system_settings WHERE key = $1 AND scope = $2 AND organization_id IS NULL`,
    [key, scope],
    tx,
  );
  const oldValueJson = prevResult.rows[0]?.value_json ?? null;

  // 2. Upsert the new value
  const r = await runWebappPgText<SystemSettingRow>(
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
       (key, scope, old_value_json, new_value_json, changed_by, source)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
    [
      key,
      scope,
      oldValueJson !== null ? JSON.stringify(oldValueJson) : null,
      JSON.stringify(valueJson),
      updatedBy,
      "system_settings_repo",
    ],
    tx,
  );

  return r.rows[0]!;
}

export function createPgSystemSettingsPort(): SystemSettingsPort {
  return {
    async getByKey(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      options: SystemSettingsReadOptions = {},
    ): Promise<SystemSetting | null> {
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

    async getByScope(scope: SystemSettingScope, options: SystemSettingsReadOptions = {}): Promise<SystemSetting[]> {
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
    ): Promise<SystemSetting> {
      return runWebappTransaction(async (tx) => {
        const row = await upsertWithAudit(key, scope, valueJson, updatedBy, tx);
        return rowToSetting(row);
      });
    },

    async upsertManyInTransaction(rows: SystemSettingsUpsertRow[]) {
      if (rows.length === 0) return [];
      return runWebappTransaction(async (tx) => {
        const out: SystemSetting[] = [];
        for (const row of rows) {
          const r = await upsertWithAudit(row.key, row.scope, row.valueJson, row.updatedBy, tx);
          out.push(rowToSetting(r));
        }
        return out;
      });
    },
  };
}
