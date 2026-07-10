import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

export async function resolveBroadcastAuditOrganizationId(
  db: DbPort,
  broadcastAuditId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ organization_id: string | null }>(
    db,
    sql`
      SELECT organization_id::text AS organization_id
      FROM public.broadcast_audit
      WHERE id = ${broadcastAuditId}::uuid
      LIMIT 1
    `,
  );
  const organizationId = res.rows[0]?.organization_id;
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId.trim()
    : null;
}
