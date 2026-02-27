import { db } from '../client.js';

/** Возвращает активные topic_id подписок пользователя. */
export async function getUserSubscriptions(userId: number): Promise<Set<number>> {
  const res = await db.query(
    `SELECT topic_id FROM user_subscriptions WHERE user_id=$1 AND is_active=true`,
    [userId],
  );
  return new Set(res.rows.map((r: { topic_id: number }) => r.topic_id));
}

/** Создает или обновляет состояние подписки пользователя на тему. */
export async function upsertUserSubscription(
  userId: number,
  topicId: number,
  isActive: boolean,
): Promise<void> {
  await db.query(
    `INSERT INTO user_subscriptions(user_id, topic_id, is_active)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, topic_id) DO UPDATE SET is_active = EXCLUDED.is_active`,
    [userId, topicId, isActive],
  );
}

/** Переключает состояние подписки и возвращает новое значение. */
export async function toggleUserSubscription(
  userId: number,
  topicId: number,
): Promise<boolean> {
  const res = await db.query(
    `SELECT is_active FROM user_subscriptions WHERE user_id=$1 AND topic_id=$2`,
    [userId, topicId],
  );
  const current = res.rows[0]?.is_active === true;
  const newState = !current;
  await upsertUserSubscription(userId, topicId, newState);
  return newState;
}
