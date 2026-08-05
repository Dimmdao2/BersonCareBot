import type { Pool } from 'pg';
import { runPgPoolPgText } from '@/infra/db/runWebappSql';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';

export async function findPublicBookingNameCollisionCandidates(input: {
  pool: Pool;
  anchorUserId: string;
  contactName: string;
}): Promise<string[]> {
  const result = await runPgPoolPgText<{ id: string }>(
    input.pool,
    `SELECT pu.id
       FROM platform_users pu
       ${USER_IDENTITY_FIO_JOIN}
      WHERE pu.merged_into_id IS NULL
        AND pu.role = 'client'
        AND pu.id <> $1::uuid
        AND (pu.phone_normalized IS NULL OR trim(pu.phone_normalized) = '')
        AND lower(trim(${FIO.displayName})) = lower(trim($2))
      LIMIT 5`,
    [input.anchorUserId, input.contactName],
  );
  return result.rows.map((row) => row.id);
}
