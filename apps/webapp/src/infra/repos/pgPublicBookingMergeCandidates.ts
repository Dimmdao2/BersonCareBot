import type { Pool } from "pg";
import { runPgPoolPgText } from "@/infra/db/runWebappSql";

export async function findPublicBookingNameCollisionCandidates(input: {
  pool: Pool;
  anchorUserId: string;
  contactName: string;
}): Promise<string[]> {
  const result = await runPgPoolPgText<{ id: string }>(
    input.pool,
    `SELECT id
       FROM platform_users
      WHERE merged_into_id IS NULL
        AND role = 'client'
        AND id <> $1::uuid
        AND (phone_normalized IS NULL OR trim(phone_normalized) = '')
        AND lower(trim(display_name)) = lower(trim($2))
      LIMIT 5`,
    [input.anchorUserId, input.contactName],
  );
  return result.rows.map((row) => row.id);
}
