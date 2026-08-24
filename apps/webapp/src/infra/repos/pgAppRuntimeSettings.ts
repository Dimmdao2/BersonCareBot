import { sql } from 'drizzle-orm';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import type {
  RuntimeConfigAudience,
  RuntimeSettingRow,
} from '@/modules/system-settings/runtimeConfig';
import type { RuntimeSettingsRepository } from '@/modules/system-settings/ports';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { SYSTEM_SETTING_REGISTRY } from '@/modules/system-settings/registry';
import type { SystemSettingKey } from '@/modules/system-settings/types';

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

function runtimeDefinition(key: string, allowedAudiences: readonly RuntimeConfigAudience[]) {
  const definition = SYSTEM_SETTING_REGISTRY[key as SystemSettingKey];
  if (!definition || definition.storage !== 'runtime' || !allowedAudiences.includes(definition.audience)) {
    return null;
  }
  return definition;
}

export function createPgAppRuntimeSettingsPort(): RuntimeSettingsRepository {
  return {
    async getClinicPlatformIntegrationAvailability() {
      const result = await runWithWebappDbOperationFamily(
        'clinic_platform_integration_availability',
        () =>
          runWebappNamedRoot<RuntimeSettingDbRow>(
            getWebappSqlDb(),
            'app.read_clinic_platform_integration_availability()',
            [],
            sql`SELECT 'platform_integration_availability'::text AS key,
                       'admin'::text AS scope,
                       NULL::uuid AS organization_id,
                       'server'::text AS audience,
                       app.read_clinic_platform_integration_availability() AS value_json`,
          ),
      );
      const row = result.rows[0];
      return row?.value_json == null ? null : toRuntimeSetting(row);
    },
    async getEffective(input) {
      const definition = runtimeDefinition(input.key, input.allowedAudiences);
      if (!definition || definition.scope !== input.scope) return null;
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
             FROM app.read_authenticated_runtime_setting($1, $2, $3::uuid, $4::boolean)`,
          [
            input.key,
            input.scope,
            input.organizationId,
            input.allowGlobalFallback !== false,
          ],
        ),
      );
      return result.rows[0] ? toRuntimeSetting(result.rows[0]) : null;
    },
    async getSnapshotRows(input) {
      const allowedKeys = Object.entries(SYSTEM_SETTING_REGISTRY)
        .filter(([, definition]) =>
          definition.storage === 'runtime'
          && definition.scope === input.scope
          && input.allowedAudiences.includes(definition.audience))
        .map(([key]) => key);
      if (allowedKeys.length === 0) return [];
      const result = await runWebappPgText<RuntimeSettingDbRow>(
        `SELECT DISTINCT ON (key) key, scope, organization_id,
                CASE
                  WHEN key = ANY($4::text[]) THEN 'public'
                  WHEN key = ANY($5::text[]) THEN 'authenticated_client'
                  ELSE 'server'
                END AS audience,
                value_json, updated_at, updated_by
           FROM public.system_settings
          WHERE scope = $1
            AND key = ANY($2::text[])
            AND (organization_id = $3::uuid OR organization_id IS NULL)
          ORDER BY key, organization_id IS NULL ASC`,
        [
          input.scope,
          allowedKeys,
          input.organizationId,
          allowedKeys.filter((key) => SYSTEM_SETTING_REGISTRY[key as SystemSettingKey].audience === 'public'),
          allowedKeys.filter((key) => SYSTEM_SETTING_REGISTRY[key as SystemSettingKey].audience === 'authenticated_client'),
        ],
      );
      return result.rows.map(toRuntimeSetting);
    },
    async upsert(input) {
      const definition = runtimeDefinition(input.key, [input.audience]);
      if (!definition || definition.scope !== input.scope) throw new Error(`invalid_runtime_setting: ${input.key}`);
      const result = input.organizationId
        ? await runWebappPgText<RuntimeSettingDbRow>(
            `INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
             VALUES ($1, $2, $3::uuid, $4::jsonb, now(), $5)
             ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO UPDATE
               SET value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by
             RETURNING key, scope, organization_id, $6::text AS audience, value_json, updated_at, updated_by`,
            [input.key, input.scope, input.organizationId, JSON.stringify(input.valueJson), input.updatedBy, input.audience],
          )
        : await runWebappPgText<RuntimeSettingDbRow>(
            `INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
             VALUES ($1, $2, NULL, $3::jsonb, now(), $4)
             ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
               SET value_json = EXCLUDED.value_json, updated_at = now(), updated_by = EXCLUDED.updated_by
             RETURNING key, scope, organization_id, $5::text AS audience, value_json, updated_at, updated_by`,
            [input.key, input.scope, JSON.stringify(input.valueJson), input.updatedBy, input.audience],
          );
      return toRuntimeSetting(result.rows[0]!);
    },
  };
}
