/**
 * Subscription/mailing projection (Stage 11).
 * Idempotent by integrator ids; used for product reads and ingest from integrator events.
 * API returns ids as strings (bigint-safe).
 */

import { getPool } from "@/infra/db/client";

export type MailingTopicRow = {
  integratorTopicId: string;
  code: string;
  title: string;
  key: string;
  isActive: boolean;
};

export type UserSubscriptionRow = {
  integratorTopicId: string;
  topicCode: string;
  isActive: boolean;
};

export type SubscriptionMailingProjectionPort = {
  upsertTopicFromProjection(params: {
    integratorTopicId: number;
    code: string;
    title: string;
    key: string;
    isActive: boolean;
    updatedAt: string;
  }): Promise<void>;
  upsertUserSubscriptionFromProjection(params: {
    integratorUserId: number;
    integratorTopicId: number;
    isActive: boolean;
    updatedAt: string;
  }): Promise<void>;
  appendMailingLogFromProjection(params: {
    integratorUserId: number;
    integratorMailingId: number;
    status: string;
    sentAt: string;
    errorText: string | null;
  }): Promise<void>;
  listTopics(): Promise<MailingTopicRow[]>;
  listSubscriptionsByIntegratorUserId(integratorUserId: string): Promise<UserSubscriptionRow[]>;
};

export function createPgSubscriptionMailingProjectionPort(): SubscriptionMailingProjectionPort {
  return {
    async upsertTopicFromProjection(params) {
      const pool = getPool();
      await pool.query(
        `INSERT INTO mailing_topics_webapp (
          integrator_topic_id, code, title, key, is_active, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        ON CONFLICT (integrator_topic_id) DO UPDATE SET
          code = EXCLUDED.code,
          title = EXCLUDED.title,
          key = EXCLUDED.key,
          is_active = EXCLUDED.is_active,
          updated_at = EXCLUDED.updated_at`,
        [
          params.integratorTopicId,
          params.code,
          params.title,
          params.key,
          params.isActive,
          params.updatedAt,
        ]
      );
    },

    async upsertUserSubscriptionFromProjection(params) {
      const pool = getPool();
      await pool.query(
        `INSERT INTO user_subscriptions_webapp (
          integrator_user_id, integrator_topic_id, is_active, updated_at
        ) VALUES ($1, $2, $3, $4::timestamptz)
        ON CONFLICT (integrator_user_id, integrator_topic_id) DO UPDATE SET
          is_active = EXCLUDED.is_active,
          updated_at = EXCLUDED.updated_at`,
        [
          params.integratorUserId,
          params.integratorTopicId,
          params.isActive,
          params.updatedAt,
        ]
      );
    },

    async appendMailingLogFromProjection(params) {
      const pool = getPool();
      await pool.query(
        `INSERT INTO mailing_logs_webapp (
          integrator_user_id, integrator_mailing_id, status, sent_at, error_text
        ) VALUES ($1, $2, $3, $4::timestamptz, $5)
        ON CONFLICT (integrator_user_id, integrator_mailing_id) DO NOTHING`,
        [
          params.integratorUserId,
          params.integratorMailingId,
          params.status,
          params.sentAt,
          params.errorText,
        ]
      );
    },

    async listTopics(): Promise<MailingTopicRow[]> {
      const pool = getPool();
      const result = await pool.query<{
        integrator_topic_id: string;
        code: string;
        title: string;
        key: string;
        is_active: boolean;
      }>(
        `SELECT integrator_topic_id, code, title, key, is_active
         FROM mailing_topics_webapp WHERE is_active = true ORDER BY integrator_topic_id`
      );
      return result.rows.map((r) => ({
        integratorTopicId: String(r.integrator_topic_id),
        code: r.code,
        title: r.title,
        key: r.key,
        isActive: r.is_active,
      }));
    },

    async listSubscriptionsByIntegratorUserId(integratorUserId: string): Promise<UserSubscriptionRow[]> {
      const pool = getPool();
      const result = await pool.query<{
        integrator_topic_id: string;
        code: string;
        is_active: boolean;
      }>(
        `SELECT s.integrator_topic_id, t.code, s.is_active
         FROM user_subscriptions_webapp s
         JOIN mailing_topics_webapp t ON t.integrator_topic_id = s.integrator_topic_id
         WHERE s.integrator_user_id = $1 AND s.is_active = true
         ORDER BY s.integrator_topic_id`,
        [integratorUserId]
      );
      return result.rows.map((r) => ({
        integratorTopicId: String(r.integrator_topic_id),
        topicCode: r.code,
        isActive: r.is_active,
      }));
    },
  };
}
