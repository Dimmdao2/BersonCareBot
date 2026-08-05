import type { Pool } from 'pg';
import { runPgPoolPgText } from '@/infra/db/runWebappSql';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';
import {
  CONTACTS_NO_PHONE,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';

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
       ${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
      WHERE pu.merged_into_id IS NULL
        AND pu.role = 'client'
        AND pu.id <> $1::uuid
        AND ${CONTACTS_NO_PHONE}
        AND lower(trim(${FIO.displayName})) = lower(trim($2))
      LIMIT 5`,
    [input.anchorUserId, input.contactName],
  );
  return result.rows.map((row) => row.id);
}
