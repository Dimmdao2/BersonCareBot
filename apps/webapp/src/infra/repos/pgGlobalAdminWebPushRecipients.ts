import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { GlobalAdminWebPushRecipientsPort } from '@/modules/operator-health/globalAdminWebPushRecipientsPort';

function parseGlobalAdminIds(payload: unknown): string[] {
  if (!Array.isArray(payload)) throw new Error('operator_health_digest_push_audience_invalid');
  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const userId = (entry as Record<string, unknown>).userId;
    return typeof userId === 'string' ? [userId] : [];
  });
}

/** Global operator audience is derived only from the canonical platform role. */
export function createPgGlobalAdminWebPushRecipientsPort(): GlobalAdminWebPushRecipientsPort {
  return {
    async listEligibleGlobalAdminUserIds() {
      const result = await runWebappNamedRoot<{ recipients: unknown }>(
        getWebappSqlDb(),
        'app.list_operator_web_push_recipients(text)',
        ['global_admin'],
        sql`SELECT app.list_operator_web_push_recipients('global_admin'::text) AS recipients`,
      );
      return parseGlobalAdminIds(result.rows[0]?.recipients);
    },
  };
}
