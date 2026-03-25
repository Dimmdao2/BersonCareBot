import { getPool } from "@/infra/db/client";
import type { SystemSettingsPort } from "@/modules/system-settings/ports";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";

type SystemSettingRow = {
  key: string;
  scope: string;
  value_json: unknown;
  updated_at: Date;
  updated_by: string | null;
};

function rowToSetting(row: SystemSettingRow): SystemSetting {
  return {
    key: row.key as SystemSettingKey,
    scope: row.scope as SystemSettingScope,
    valueJson: row.value_json,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

export function createPgSystemSettingsPort(): SystemSettingsPort {
  return {
    async getByKey(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null> {
      const pool = getPool();
      const r = await pool.query<SystemSettingRow>(
        `SELECT key, scope, value_json, updated_at, updated_by
         FROM system_settings WHERE key = $1 AND scope = $2`,
        [key, scope]
      );
      if (!r.rows[0]) return null;
      return rowToSetting(r.rows[0]);
    },

    async getByScope(scope: SystemSettingScope): Promise<SystemSetting[]> {
      const pool = getPool();
      const r = await pool.query<SystemSettingRow>(
        `SELECT key, scope, value_json, updated_at, updated_by
         FROM system_settings WHERE scope = $1 ORDER BY key`,
        [scope]
      );
      return r.rows.map(rowToSetting);
    },

    async upsert(
      key: SystemSettingKey,
      scope: SystemSettingScope,
      valueJson: unknown,
      updatedBy: string | null
    ): Promise<SystemSetting> {
      const pool = getPool();
      const r = await pool.query<SystemSettingRow>(
        `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, now(), $4)
         ON CONFLICT (key, scope) DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, scope, value_json, updated_at, updated_by`,
        [key, scope, JSON.stringify(valueJson), updatedBy]
      );
      return rowToSetting(r.rows[0]!);
    },
  };
}
