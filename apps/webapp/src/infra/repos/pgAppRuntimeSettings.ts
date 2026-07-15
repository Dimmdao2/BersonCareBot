import { runWebappPgText } from "@/infra/db/runWebappSql";
import type {
  RuntimeConfigAudience,
  RuntimeConfigPort,
  RuntimeSettingRow,
} from "@/modules/system-settings/runtimeConfig";

type RuntimeSettingDbRow = {
  key: string;
  scope: string;
  organization_id: string | null;
  audience: RuntimeConfigAudience;
  value_json: unknown;
};

function toRuntimeSetting(row: RuntimeSettingDbRow): RuntimeSettingRow {
  return {
    key: row.key,
    scope: row.scope,
    organizationId: row.organization_id,
    audience: row.audience,
    valueJson: row.value_json,
  };
}

export function createPgAppRuntimeSettingsPort(): RuntimeConfigPort {
  return {
    async getEffective(input) {
      const result = await runWebappPgText<RuntimeSettingDbRow>(
        `SELECT key, scope, organization_id, audience, value_json
           FROM app_runtime_settings
          WHERE key = $1
            AND scope = $2
            AND audience = ANY($3::text[])
            AND (organization_id = $4::uuid OR organization_id IS NULL)
          ORDER BY organization_id IS NULL ASC
          LIMIT 1`,
        [input.key, input.scope, [...input.allowedAudiences], input.organizationId],
      );
      return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
    },
  };
}
