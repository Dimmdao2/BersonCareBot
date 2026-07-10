import { sql } from 'drizzle-orm';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';

export function organizationIdForIntegratorUserSql(integratorUserId: string | number) {
  const currentOrganizationId = getCurrentOrganizationPrincipalId() ?? null;
  return sql`COALESCE(
    ${currentOrganizationId}::uuid,
    (
      SELECT (array_agg(DISTINCT active_user_orgs.organization_id))[1]
      FROM public.platform_users platform_user
      INNER JOIN (
        SELECT platform_user_id, organization_id
        FROM public.org_enrollments
        WHERE status = 'active'
        UNION
        SELECT platform_user_id, organization_id
        FROM public.be_organization_members
        WHERE status = 'active'
      ) active_user_orgs
        ON active_user_orgs.platform_user_id = platform_user.id
      WHERE platform_user.integrator_user_id = ${String(integratorUserId)}::bigint
      HAVING count(DISTINCT active_user_orgs.organization_id) = 1
    )
  )`;
}
