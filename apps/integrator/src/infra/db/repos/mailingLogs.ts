import type { DbPort } from '../../../kernel/contracts/index.js';

export type InsertMailingLogParams = {
  userId: number;
  mailingId: number;
  status: string;
  sentAt: string;
  error: string | null;
};

/** Вставляет запись в лог рассылки (идемпотентно по (user_id, mailing_id) через ON CONFLICT). */
export async function insertMailingLog(db: DbPort, params: InsertMailingLogParams): Promise<void> {
  await db.query(
    `INSERT INTO mailing_logs (user_id, mailing_id, status, sent_at, error)
     VALUES ($1, $2, $3, $4::timestamptz, $5)
     ON CONFLICT (user_id, mailing_id) DO UPDATE SET
       status = EXCLUDED.status,
       sent_at = EXCLUDED.sent_at,
       error = EXCLUDED.error`,
    [params.userId, params.mailingId, params.status, params.sentAt, params.error],
  );
}
