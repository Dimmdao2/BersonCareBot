import { sql } from 'drizzle-orm';
import type { PatientDailyWarmupVideoViewPort } from '@/modules/patient-home/dailyWarmupVideoViewPorts';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export function createPgPatientDailyWarmupVideoViewPort(): PatientDailyWarmupVideoViewPort {
  return {
    async recordView(userId, contentPageId) {
      const result = await runWebappNamedRoot<{ recorded: boolean }>(
        getWebappSqlDb(),
        'app.record_current_patient_daily_warmup_video_view(uuid)',
        [contentPageId],
        sql`SELECT app.record_current_patient_daily_warmup_video_view(
          ${contentPageId}::uuid
        ) AS recorded`,
      );
      void userId;
      if (result.rows[0]?.recorded !== true) throw new Error('daily_warmup_video_view_rejected');
    },
  };
}
