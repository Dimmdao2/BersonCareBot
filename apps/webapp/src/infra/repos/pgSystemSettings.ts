import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type { SystemSettingsPort, SystemSettingsUpsertRow } from "@/modules/system-settings/ports";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";

type SystemSettingRow = {
  key: string;
  scope: string;
  value_json: unknown;
  updated_at: Date | string;
  updated_by: string | null;
};

function rowToSetting(row: SystemSettingRow): SystemSetting {
  return {
    key: row.key as SystemSettingKey,
    scope: row.scope as SystemSettingScope,
    valueJson: row.value_json,
    updatedAt: toIsoStringSafe(row.updated_at),
    updatedBy: row.updated_by,
  };
}

export function createPgSystemSettingsPort(): SystemSettingsPort {
  return {
    async getByKey(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null> {
      const r = await runWebappPgText<SystemSettingRow>(
        `SELECT key, scope, value_json, updated_at, updated_by
         FROM system_settings WHERE key = $1 AND scope = $2`,
        [key, scope],
      );
      if (!r.rows[0]) return null;
      return rowToSetting(r.rows[0]);
    },

    async getByScope(scope: SystemSettingScope): Promise<SystemSetting[]> {
      const r = await runWebappPgText<SystemSettingRow>(
        `SELECT key, scope, value_json, updated_at, updated_by
         FROM system_settings WHERE scope = $1 ORDER BY key`,
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
      const r = await runWebappPgText<SystemSettingRow>(
        `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, now(), $4)
         ON CONFLICT (key, scope) DO UPDATE
           SET value_json = EXCLUDED.value_json,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, scope, value_json, updated_at, updated_by`,
        [key, scope, JSON.stringify(valueJson), updatedBy],
      );
      return rowToSetting(r.rows[0]!);
    },

    async upsertManyInTransaction(rows: SystemSettingsUpsertRow[]) {
      if (rows.length === 0) return [];
      return runWebappTransaction(async (tx) => {
        const out: SystemSetting[] = [];
        for (const row of rows) {
          const r = await runWebappPgText<SystemSettingRow>(
            `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
             VALUES ($1, $2, $3::jsonb, now(), $4)
             ON CONFLICT (key, scope) DO UPDATE
               SET value_json = EXCLUDED.value_json,
                   updated_at = now(),
                   updated_by = EXCLUDED.updated_by
             RETURNING key, scope, value_json, updated_at, updated_by`,
            [row.key, row.scope, JSON.stringify(row.valueJson), row.updatedBy],
            tx,
          );
          out.push(rowToSetting(r.rows[0]!));
        }
        return out;
      });
    },
  };
}
