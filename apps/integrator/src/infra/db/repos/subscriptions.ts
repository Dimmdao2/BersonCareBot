import { and, eq } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { userSubscriptions } from '../schema/integratorPublicProduct.js';

/** Возвращает активные topic_id подписок пользователя (канонический user_id). */
export async function getUserSubscriptions(db: DbPort, userId: number): Promise<Set<number>> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ topicId: userSubscriptions.topicId })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.isActive, true)));
  return new Set(rows.map((r) => r.topicId));
}

/** Создает или обновляет состояние подписки пользователя на тему (канонический user_id). */
export async function upsertUserSubscription(
  db: DbPort,
  userId: number,
  topicId: number,
  isActive: boolean,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(userSubscriptions)
    .values({ userId, topicId, isActive })
    .onConflictDoUpdate({
      target: [userSubscriptions.userId, userSubscriptions.topicId],
      set: { isActive },
    });
}

/** Переключает состояние подписки и возвращает новое значение (канонический user_id). */
export async function toggleUserSubscription(
  db: DbPort,
  userId: number,
  topicId: number,
): Promise<boolean> {
  const d = getIntegratorDrizzleSession(db);
  const cur = await d
    .select({ isActive: userSubscriptions.isActive })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.topicId, topicId)))
    .limit(1);
  const current = cur[0]?.isActive === true;
  const newState = !current;
  await upsertUserSubscription(db, userId, topicId, newState);
  return newState;
}
