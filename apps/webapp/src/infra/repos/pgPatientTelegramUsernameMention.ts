import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export async function loadPatientTelegramUsername(platformUserId: string): Promise<string | null> {
  const result = await runWebappNamedRoot<{ display_handle: string | null }>(
    getWebappSqlDb(),
    'app.read_patient_telegram_display_handle(uuid)',
    [platformUserId],
    sql`SELECT app.read_patient_telegram_display_handle(${platformUserId}::uuid) AS display_handle`,
  );
  return result.rows[0]?.display_handle ?? null;
}
