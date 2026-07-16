import { runWebappPgText } from "@/infra/db/runWebappSql";
import type {
  RuntimeConfigAudience,
  RuntimeConfigPort,
  RuntimeSettingRow,
} from "@/modules/system-settings/runtimeConfig";
import { runWithWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";

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
      if (
        input.organizationId === null
        && input.allowedAudiences.length === 1
        && input.allowedAudiences[0] === "public"
      ) {
        const result = await runWithWebappDbOperationFamily(input.operationFamily, () => runWebappPgText<RuntimeSettingDbRow>(
          `SELECT key, scope, organization_id, audience, value_json
             FROM app.read_public_runtime_setting($1, $2)`,
          [input.key, input.scope],
        ));
        return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
      }
      const result = await runWithWebappDbOperationFamily(input.operationFamily, () => runWebappPgText<RuntimeSettingDbRow>(
        `SELECT key, scope, organization_id, audience, value_json
           FROM public.app_runtime_settings
          WHERE key = $1
            AND scope = $2
            AND audience = ANY($3::text[])
            AND (organization_id = $4::uuid OR organization_id IS NULL)
          ORDER BY organization_id IS NULL ASC
          LIMIT 1`,
        [input.key, input.scope, [...input.allowedAudiences], input.organizationId],
      ));
      return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
    },
  };
}
