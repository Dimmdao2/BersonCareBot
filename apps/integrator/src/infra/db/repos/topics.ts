import { asc, eq } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { mailingTopics } from '../schema/integratorPublicProduct.js';

export type Topic = { id: number; code: string; key: string; title: string; is_active?: boolean };

function rowToTopic(r: {
  id: number;
  code: string;
  key: string;
  title: string;
  isActive: boolean;
}): Topic {
  return {
    id: r.id,
    code: r.code,
    key: r.key,
    title: r.title,
    is_active: r.isActive,
  };
}

/** Возвращает список активных тем рассылок. */
export async function listActiveTopics(db: DbPort): Promise<Topic[]> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({
      id: mailingTopics.id,
      code: mailingTopics.code,
      key: mailingTopics.key,
      title: mailingTopics.title,
      isActive: mailingTopics.isActive,
    })
    .from(mailingTopics)
    .where(eq(mailingTopics.isActive, true))
    .orderBy(asc(mailingTopics.id));
  return rows.map(rowToTopic);
}

/** Ищет тему рассылки по ключу. */
export async function getTopicByKey(db: DbPort, key: string): Promise<Topic | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({
      id: mailingTopics.id,
      code: mailingTopics.code,
      key: mailingTopics.key,
      title: mailingTopics.title,
      isActive: mailingTopics.isActive,
    })
    .from(mailingTopics)
    .where(eq(mailingTopics.key, key))
    .limit(1);
  const r = rows[0];
  return r ? rowToTopic(r) : null;
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
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(mailingTopics)
    .values({
      id: params.id,
      code: params.code,
      title: params.title,
      key: params.key,
      isActive: params.isActive,
    })
    .onConflictDoUpdate({
      target: mailingTopics.id,
      set: {
        code: params.code,
        title: params.title,
        key: params.key,
        isActive: params.isActive,
      },
    });
}
