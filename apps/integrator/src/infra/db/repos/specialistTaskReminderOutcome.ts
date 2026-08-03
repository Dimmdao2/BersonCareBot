import { and, eq, isNull } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { specialistTasks } from '../schema/specialistTasks.js';

/** First successful channel wins the canonical timestamp; later channel successes are no-ops. */
export async function markSpecialistTaskReminderSent(
  db: DbPort,
  input: { taskId: string; sentAt: string },
): Promise<void> {
  await getIntegratorDrizzleSession(db)
    .update(specialistTasks)
    .set({ reminderSentAt: input.sentAt })
    .where(and(eq(specialistTasks.id, input.taskId), isNull(specialistTasks.reminderSentAt)));
}
