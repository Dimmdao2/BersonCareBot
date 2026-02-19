import { Pool } from "pg";

export type MailingTopic = {
  id: number;
  key: string;
  title: string;
  is_active: boolean;
  created_at: string;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getActiveTopics(): Promise<MailingTopic[]> {
  const res = await pool.query(
    `SELECT id, key, title, is_active, created_at FROM mailing_topics WHERE is_active = true ORDER BY id`
  );
  return res.rows as MailingTopic[];
}

export async function seedTopics(): Promise<void> {
  const topics = [
    { key: "news", title: "Новости" },
    { key: "moscow", title: "Москва" },
    { key: "spb", title: "Санкт-Петербург" },
    { key: "online", title: "Онлайн" },
  ];
  for (const t of topics) {
    await pool.query(
      `INSERT INTO mailing_topics(key, title) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [t.key, t.title]
    );
  }
}
