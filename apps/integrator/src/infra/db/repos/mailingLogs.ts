import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { mailingLogs } from '../schema/integratorPublicProduct.js';

export type InsertMailingLogParams = {
  userId: number;
  mailingId: number;
  status: string;
  sentAt: string;
  error: string | null;
};

/** Вставляет запись в лог рассылки (идемпотентно по (user_id, mailing_id) через ON CONFLICT). */
export async function insertMailingLog(db: DbPort, params: InsertMailingLogParams): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(mailingLogs)
    .values({
      userId: params.userId,
      mailingId: params.mailingId,
      status: params.status,
      sentAt: params.sentAt,
      error: params.error,
    })
    .onConflictDoUpdate({
      target: [mailingLogs.userId, mailingLogs.mailingId],
      set: {
        status: params.status,
        sentAt: params.sentAt,
        error: params.error,
      },
    });
}
