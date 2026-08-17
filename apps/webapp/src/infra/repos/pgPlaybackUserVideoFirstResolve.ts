import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { PlaybackUserVideoFirstResolvePort } from '@/modules/media/ports';
import { mediaPlaybackUserVideoFirstResolve } from '../../../db/schema';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export function createPgPlaybackUserVideoFirstResolvePort(): PlaybackUserVideoFirstResolvePort {
  return {
    async record(input) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const result = await runWebappNamedRoot<{ inserted: boolean }>(
          getWebappSqlDb(),
          'app.record_current_patient_playback_first_resolve(uuid)',
          [input.mediaId],
          sql`SELECT app.record_current_patient_playback_first_resolve(
            ${input.mediaId}::uuid
          ) AS inserted`,
        );
        return result.rows[0]?.inserted === true;
      }

      const rows = await getDrizzle()
        .insert(mediaPlaybackUserVideoFirstResolve)
        .values(input)
        .onConflictDoNothing({
          target: [
            mediaPlaybackUserVideoFirstResolve.userId,
            mediaPlaybackUserVideoFirstResolve.mediaId,
          ],
        })
        .returning({ mediaId: mediaPlaybackUserVideoFirstResolve.mediaId });

      return rows.length > 0;
    },
  };
}
