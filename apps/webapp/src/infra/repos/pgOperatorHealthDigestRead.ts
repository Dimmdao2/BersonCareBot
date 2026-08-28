import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  OperatorHealthDigestReadPort,
  OperatorHealthDigestWindow,
} from '@/modules/operator-health/digestPorts';

const digestWindowSchema = z
  .object({
    auditErrorCount: z.number().int().nonnegative(),
    hadResolveAll: z.boolean(),
    incidentsOpened: z.array(
      z.object({ integration: z.string(), errorClass: z.string() }).strict(),
    ),
    incidentsResolved: z.array(
      z.object({ integration: z.string(), errorClass: z.string() }).strict(),
    ),
    jobFailures: z.array(
      z
        .object({
          jobFamily: z.string(),
          jobKey: z.string(),
          lastFailureAt: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export function parseOperatorHealthDigestWindow(raw: unknown): OperatorHealthDigestWindow {
  return digestWindowSchema.parse(raw);
}

export const pgOperatorHealthDigestReadPort: OperatorHealthDigestReadPort = {
  async readWindow(windowStartIso: string, windowEndIso: string) {
    const result = await runWebappNamedRoot<{ snapshot: unknown }>(
      getWebappSqlDb(),
      'app.read_operator_health_digest_window(timestamp with time zone,timestamp with time zone)',
      [windowStartIso, windowEndIso],
      sql`SELECT app.read_operator_health_digest_window(
        ${windowStartIso}::timestamp with time zone,
        ${windowEndIso}::timestamp with time zone
      ) AS snapshot`,
    );
    return parseOperatorHealthDigestWindow(result.rows[0]?.snapshot);
  },
};
