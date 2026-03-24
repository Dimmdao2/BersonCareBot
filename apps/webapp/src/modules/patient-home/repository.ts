/**
 * Данные для главной пациента: баннер из проекции рассылок, последние логи рассылок.
 */

import { getPool } from "@/infra/db/client";
import { env } from "@/config/env";

export type PatientHomeBanner = {
  title: string;
  variant: "info" | "important";
  key: string;
};

export type PatientHomeMailingRow = {
  id: string;
  label: string;
  sentAt: string;
  status: string;
};

/** Первая активная тема рассылки — как «новость» на главной (важность по key/code). */
export async function getPatientHomeBannerTopic(): Promise<PatientHomeBanner | null> {
  if (!env.DATABASE_URL) return null;
  try {
    const pool = getPool();
    const r = await pool.query<{ title: string; key: string; code: string }>(
      `SELECT title, key, code FROM mailing_topics_webapp WHERE is_active = true ORDER BY integrator_topic_id ASC LIMIT 1`
    );
    if (r.rows.length === 0) return null;
    const row = r.rows[0];
    const important =
      row.key.toLowerCase().includes("important") || row.code.toLowerCase() === "important";
    return { title: row.title, variant: important ? "important" : "info", key: row.key };
  } catch {
    return null;
  }
}

export async function listRecentMailingLogsForPlatformUser(platformUserId: string): Promise<PatientHomeMailingRow[]> {
  if (!env.DATABASE_URL) return [];
  try {
    const pool = getPool();
    const r = await pool.query<{ integrator_mailing_id: string; status: string; sent_at: Date }>(
      `SELECT m.integrator_mailing_id, m.status, m.sent_at
       FROM mailing_logs_webapp m
       INNER JOIN platform_users pu ON pu.id = $1 AND pu.integrator_user_id IS NOT NULL
         AND pu.integrator_user_id = m.integrator_user_id
       ORDER BY m.sent_at DESC
       LIMIT 8`,
      [platformUserId]
    );
    return r.rows.map((row) => ({
      id: `ml-${row.integrator_mailing_id}`,
      label: `Рассылка №${row.integrator_mailing_id}`,
      sentAt: row.sent_at.toISOString(),
      status: row.status,
    }));
  } catch {
    return [];
  }
}
