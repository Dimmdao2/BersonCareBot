import type { DbPort } from '../../../kernel/contracts/index.js';

export type Topic = { id: number; code: string; key: string; title: string; is_active?: boolean };

/** Возвращает список активных тем рассылок. */
export async function listActiveTopics(db: DbPort): Promise<Topic[]> {
  const res = await db.query(
    `SELECT id, code, key, title, is_active FROM mailing_topics WHERE is_active = true ORDER BY id`,
  );
  return res.rows as Topic[];
}

/** Ищет тему рассылки по ключу. */
export async function getTopicByKey(db: DbPort, key: string): Promise<Topic | null> {
  const res = await db.query(
    `SELECT id, code, key, title, is_active FROM mailing_topics WHERE key = $1`,
    [key],
  );
  return res.rows[0] ? (res.rows[0] as Topic) : null;
}

export type UpsertMailingTopicParams = {
  id: number;
  code: string;
  title: string;
  key: string;
  isActive: boolean;
};

/** Создаёт или обновляет тему рассылки (для writePort и проекции). */
export async function upsertMailingTopic(db: DbPort, params: UpsertMailingTopicParams): Promise<void> {
  await db.query(
    `INSERT INTO mailing_topics (id, code, title, key, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       code = EXCLUDED.code,
       title = EXCLUDED.title,
       key = EXCLUDED.key,
       is_active = EXCLUDED.is_active`,
    [params.id, params.code, params.title, params.key, params.isActive],
  );
}