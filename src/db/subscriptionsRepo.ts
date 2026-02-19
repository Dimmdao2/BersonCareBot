import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getUserSubscriptions(userId: number): Promise<Set<number>> {
  const res = await pool.query(
    `SELECT topic_id FROM user_subscriptions WHERE user_id=$1 AND is_active=true`,
    [userId]
  );
  return new Set(res.rows.map((r: { topic_id: number }) => r.topic_id));
}

export async function upsertUserSubscription(userId: number, topicId: number, isActive: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO user_subscriptions(user_id, topic_id, is_active)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, topic_id) DO UPDATE SET is_active = EXCLUDED.is_active`,
    [userId, topicId, isActive]
  );
}

export async function toggleUserSubscription(userId: number, topicId: number): Promise<boolean> {
  const res = await pool.query(
    `SELECT is_active FROM user_subscriptions WHERE user_id=$1 AND topic_id=$2`,
    [userId, topicId]
  );
  const current = res.rows[0]?.is_active === true;
  const newState = !current;
  await upsertUserSubscription(userId, topicId, newState);
  return newState;
}
