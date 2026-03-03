import { db } from '../client.js';

export type Topic = { id: number; key: string; title: string; is_active?: boolean };

/** Возвращает список активных тем рассылок. */
export async function listActiveTopics(): Promise<Topic[]> {
  const res = await db.query(
    `SELECT id, key, title FROM mailing_topics WHERE is_active = true ORDER BY id`,
  );
  return res.rows as Topic[];
}

/** Ищет тему рассылки по ключу. */
export async function getTopicByKey(key: string): Promise<Topic | null> {
  const res = await db.query(
    `SELECT id, key, title, is_active FROM mailing_topics WHERE key = $1`,
    [key],
  );
  return res.rows[0] ? (res.rows[0] as Topic) : null;
}