import { getPool } from "@/infra/db/client";

export type UserProjectionPort = {
  upsertFromProjection: (params: {
    integratorUserId: string;
    phoneNormalized?: string;
    displayName?: string;
    channelCode?: string;
    externalId?: string;
  }) => Promise<{ platformUserId: string }>;
  findByIntegratorId: (integratorUserId: string) => Promise<{ platformUserId: string } | null>;
  updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
  upsertNotificationTopics: (params: {
    platformUserId: string;
    topics: { topicCode: string; isEnabled: boolean }[];
  }) => Promise<void>;
};

export const pgUserProjectionPort: UserProjectionPort = {
  async upsertFromProjection(params) {
    const pool = getPool();
    let userId: string | null = null;

    const byIntegrator = await pool.query<{ id: string }>(
      "SELECT id FROM platform_users WHERE integrator_user_id = $1",
      [params.integratorUserId],
    );
    if (byIntegrator.rows.length > 0) {
      userId = byIntegrator.rows[0].id;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (params.displayName != null) {
        sets.push(`display_name = $${++idx}`);
        vals.push(params.displayName);
      }
      if (params.phoneNormalized != null) {
        sets.push(`phone_normalized = $${++idx}`);
        vals.push(params.phoneNormalized);
      }
      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        await pool.query(
          `UPDATE platform_users SET ${sets.join(", ")} WHERE id = $1`,
          [userId, ...vals],
        );
      }
    } else if (params.phoneNormalized) {
      const byPhone = await pool.query<{ id: string }>(
        "SELECT id FROM platform_users WHERE phone_normalized = $1",
        [params.phoneNormalized],
      );
      if (byPhone.rows.length > 0) {
        userId = byPhone.rows[0].id;
        const sets = ["integrator_user_id = $2", "updated_at = now()"];
        const vals: unknown[] = [userId, params.integratorUserId];
        if (params.displayName != null) {
          sets.push(`display_name = $${vals.length + 1}`);
          vals.push(params.displayName);
        }
        await pool.query(
          `UPDATE platform_users SET ${sets.join(", ")} WHERE id = $1`,
          vals,
        );
      }
    }

    if (!userId) {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO platform_users (integrator_user_id, phone_normalized, display_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [params.integratorUserId, params.phoneNormalized ?? null, params.displayName ?? ""],
      );
      userId = ins.rows[0].id;
    }

    if (params.channelCode && params.externalId) {
      await pool.query(
        `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
        [userId, params.channelCode, params.externalId],
      );
    }

    return { platformUserId: userId };
  },

  async findByIntegratorId(integratorUserId) {
    const pool = getPool();
    const result = await pool.query<{ id: string }>(
      "SELECT id FROM platform_users WHERE integrator_user_id = $1",
      [integratorUserId],
    );
    return result.rows.length > 0 ? { platformUserId: result.rows[0].id } : null;
  },

  async updatePhone(platformUserId, phoneNormalized) {
    const pool = getPool();
    await pool.query(
      "UPDATE platform_users SET phone_normalized = $1, updated_at = now() WHERE id = $2",
      [phoneNormalized, platformUserId],
    );
  },

  async upsertNotificationTopics(params) {
    const pool = getPool();
    for (const topic of params.topics) {
      await pool.query(
        `INSERT INTO user_notification_topics (user_id, topic_code, is_enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, topic_code) DO UPDATE SET
           is_enabled = EXCLUDED.is_enabled, updated_at = now()`,
        [params.platformUserId, topic.topicCode, topic.isEnabled],
      );
    }
  },
};

export const inMemoryUserProjectionPort: UserProjectionPort = {
  upsertFromProjection: async () => ({ platformUserId: "" }),
  findByIntegratorId: async () => null,
  updatePhone: async () => {},
  upsertNotificationTopics: async () => {},
};
