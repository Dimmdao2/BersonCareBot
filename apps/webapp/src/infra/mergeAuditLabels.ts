import type { Pool } from 'pg';
import { runPgPoolPgText } from '@/infra/db/runWebappSql';
import { FIO, USER_IDENTITY_FIO_JOIN } from '@/infra/repos/userIdentityFioSql';

const EMPTY = 'Имя не указано';

/**
 * Loads `display_name` for two platform users (merge target / duplicate) for audit `details`.
 */
export async function fetchMergePartyDisplayLabels(
  pool: Pool,
  targetId: string,
  duplicateId: string,
): Promise<{ targetDisplayName: string; duplicateDisplayName: string }> {
  const r = await runPgPoolPgText<{ id: string; display_name: string | null }>(
    pool,
    `SELECT pu.id::text AS id, ${FIO.displayName} AS display_name
     FROM platform_users pu
     ${USER_IDENTITY_FIO_JOIN}
     WHERE pu.id IN ($1::uuid, $2::uuid)`,
    [targetId, duplicateId],
  );
  const norm = (s: string | null | undefined) => {
    const t = s?.trim() ?? '';
    return t !== '' ? t : EMPTY;
  };
  const map = new Map(r.rows.map((row) => [row.id, norm(row.display_name)]));
  return {
    targetDisplayName: map.get(targetId) ?? EMPTY,
    duplicateDisplayName: map.get(duplicateId) ?? EMPTY,
  };
}
