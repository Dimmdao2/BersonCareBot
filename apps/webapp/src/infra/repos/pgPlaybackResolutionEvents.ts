import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import { sql } from 'drizzle-orm';

export async function insertPlaybackResolutionEvent(input: {
  userId: string;
  mediaId: string;
  delivery: 'hls' | 'mp4' | 'file';
  fallbackUsed: boolean;
}): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.record_media_playback_resolution_event(${input.userId}::uuid, ${input.mediaId}::uuid, ${input.delivery}, ${input.fallbackUsed})`,
  );
}
