import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

function singleOrganizationId(rows: { organization_id: string }[]): string | null {
  return rows.length === 1 && rows[0]?.organization_id ? rows[0].organization_id : null;
}

/** Current single-clinic deployment fallback; ambiguity fails closed. */
export async function resolveDeploymentSingleActiveOrganizationId(
  db: DbPort,
): Promise<string | null> {
  try {
    const res = await runIntegratorSql<{ organization_id: string }>(
      db,
      sql`SELECT id::text AS organization_id
          FROM public.be_organizations
          WHERE is_active = true
          ORDER BY id
          LIMIT 2`,
    );
    return singleOrganizationId(res.rows);
  } catch (err) {
    logger.error({ err }, 'resolveDeploymentSingleActiveOrganizationId error');
    return null;
  }
}

/**
 * Transitional resolver for signed M2M payloads that still carry the old integrator id.
 * Removed together with those payloads before `integrator.users` is dropped.
 */
export async function resolveActiveOrganizationIdForIntegratorUserId(
  db: DbPort,
  integratorUserId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ organization_id: string }>(
    db,
    sql`WITH active_user_orgs AS (
          SELECT platform_user_id, organization_id
          FROM public.org_enrollments
          WHERE status = 'active'
          UNION
          SELECT platform_user_id, organization_id
          FROM public.be_organization_members
          WHERE status = 'active'
        )
        SELECT DISTINCT active_user_orgs.organization_id::text AS organization_id
        FROM public.platform_users platform_user
        INNER JOIN active_user_orgs
          ON active_user_orgs.platform_user_id = platform_user.id
        WHERE platform_user.integrator_user_id = ${integratorUserId}::bigint
        ORDER BY organization_id
        LIMIT 2`,
  );
  return singleOrganizationId(res.rows);
}
