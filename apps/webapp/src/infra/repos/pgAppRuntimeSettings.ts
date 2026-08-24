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
import {
  SYSTEM_SETTING_REGISTRY,
  type SystemSettingScope,
} from '@/modules/system-settings/registry';
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

function runtimeScope(
  key: string,
  allowedAudiences: readonly RuntimeConfigAudience[],
): SystemSettingScope | null {
  const definition = SYSTEM_SETTING_REGISTRY[key as SystemSettingKey];
  if (
    definition
    && definition.storage === 'runtime'
    && allowedAudiences.includes(definition.audience)
  ) {
    return definition.scope;
  }

  const projectionSource = Object.values(SYSTEM_SETTING_REGISTRY).find(
    (candidate) =>
      candidate.clientSerialization === 'derived'
      && candidate.safeProjection === key,
  );
  return projectionSource && allowedAudiences.includes('public') ? 'admin' : null;
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
      if (runtimeScope(input.key, input.allowedAudiences) !== input.scope) return null;
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
  };
}
