import { sql } from 'drizzle-orm';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
  runWebappTransaction,
} from '@/infra/db/runWebappSql';
import type {
  RuntimeConfigAudience,
  RuntimeSettingRow,
} from '@/modules/system-settings/runtimeConfig';
import type { RuntimeSettingsRepository } from '@/modules/system-settings/ports';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';

type RuntimeSettingDbRow = {
  key: string;
  scope: string;
  organization_id: string | null;
  audience: RuntimeConfigAudience;
  value_json: unknown;
  updated_at?: Date | string;
  updated_by?: string | null;
};

function toRuntimeSetting(row: RuntimeSettingDbRow): RuntimeSettingRow {
  return {
    key: row.key,
    scope: row.scope,
    organizationId: row.organization_id,
    audience: row.audience,
    valueJson: row.value_json,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

export function createPgAppRuntimeSettingsPort(): RuntimeSettingsRepository {
  return {
    async getEffective(input) {
      if (
        input.organizationId === null &&
        input.allowedAudiences.length === 1 &&
        input.allowedAudiences[0] === 'public'
      ) {
        const result = await runWithWebappDbOperationFamily(input.operationFamily, () =>
          runWithDbBootstrapPrincipal({ source: 'webapp-public-runtime-config' }, () =>
            runWebappNamedRoot<RuntimeSettingDbRow>(
              getWebappSqlDb(),
              'app.read_public_runtime_setting(text,text)',
              [input.key, input.scope],
              sql`SELECT key, scope, organization_id, audience, value_json
                    FROM app.read_public_runtime_setting(${input.key}, ${input.scope})`,
            ),
          ),
        );
        return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
      }
      if (
        input.organizationId === null &&
        input.allowedAudiences.length === 1 &&
        input.allowedAudiences[0] === 'server'
      ) {
        const result = await runWithWebappDbOperationFamily(input.operationFamily, () =>
          runWithDbBootstrapPrincipal({ source: 'webapp-server-runtime-config' }, () =>
            runWebappNamedRoot<RuntimeSettingDbRow>(
              getWebappSqlDb(),
              'app.read_webapp_server_runtime_setting(text,text)',
              [input.key, input.scope],
              sql`SELECT key, scope, organization_id, audience, value_json
                    FROM app.read_webapp_server_runtime_setting(${input.key}, ${input.scope})`,
            ),
          ),
        );
        return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
      }
      const result = await runWithWebappDbOperationFamily(input.operationFamily, () =>
        runWebappPgText<RuntimeSettingDbRow>(
          `SELECT key, scope, organization_id, audience, value_json
           FROM public.app_runtime_settings
          WHERE key = $1
            AND scope = $2
            AND audience = ANY($3::text[])
            AND (
              organization_id = $4::uuid
              OR ($5::boolean AND organization_id IS NULL)
            )
          ORDER BY organization_id IS NULL ASC
          LIMIT 1`,
          [
            input.key,
            input.scope,
            [...input.allowedAudiences],
            input.organizationId,
            input.allowGlobalFallback !== false,
          ],
        ),
      );
      return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
    },
    async getSnapshotRows(input) {
      const result = await runWebappPgText<RuntimeSettingDbRow>(
        `SELECT DISTINCT ON (key) key, scope, organization_id, audience, value_json, updated_at, updated_by
           FROM public.app_runtime_settings
          WHERE scope = $1
            AND audience = ANY($2::text[])
            AND (organization_id = $3::uuid OR organization_id IS NULL)
          ORDER BY key, organization_id IS NULL ASC`,
        [input.scope, [...input.allowedAudiences], input.organizationId],
      );
      return result.rows.map(toRuntimeSetting);
    },
    async upsert(input) {
      return runWebappTransaction(async (tx) => {
        await runWebappPgText(
          "SELECT set_config('app.runtime_settings_audit_source', 'runtime_repository_write', true)",
          [],
          tx,
        );
        const result = input.organizationId
          ? await runWebappPgText<RuntimeSettingDbRow>(
              `INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by)
               VALUES ($1, $2, $3::uuid, $4, $5::jsonb, now(), $6)
               ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
                 SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by
               RETURNING key, scope, organization_id, audience, value_json, updated_at, updated_by`,
              [
                input.key,
                input.scope,
                input.organizationId,
                input.audience,
                JSON.stringify(input.valueJson),
                input.updatedBy,
              ],
              tx,
            )
          : await runWebappPgText<RuntimeSettingDbRow>(
              `INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by)
               VALUES ($1, $2, NULL, $3, $4::jsonb, now(), $5)
               ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
                 SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by
               RETURNING key, scope, organization_id, audience, value_json, updated_at, updated_by`,
              [
                input.key,
                input.scope,
                input.audience,
                JSON.stringify(input.valueJson),
                input.updatedBy,
              ],
              tx,
            );
        return toRuntimeSetting(result.rows[0]!);
      });
    },
  };
}
