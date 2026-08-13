import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * Transitional resolver for signed M2M payloads that still carry the old integrator id.
 * Removed together with those payloads before `integrator.users` is dropped.
 */
export type ResolvedIntegratorUserTenant = {
  platformUserId: string;
  organizationId: string;
};

export async function resolveActiveTenantForIntegratorUserId(
  db: DbPort,
  integratorUserId: string,
): Promise<ResolvedIntegratorUserTenant | null> {
  const res = await runIntegratorNamedRoot<{
    platform_user_id: string;
    organization_id: string;
  }>(
    db,
    'app.resolve_active_organization_for_integrator_user_id(bigint)',
    [integratorUserId],
    sql`SELECT platform_user_id::text, organization_id::text
        FROM app.resolve_active_organization_for_integrator_user_id(
          ${integratorUserId}::bigint
        )`,
  );
  const row = res.rows[0];
  return row
    ? { platformUserId: row.platform_user_id, organizationId: row.organization_id }
    : null;
}
