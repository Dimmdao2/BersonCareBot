import { getPool } from "@/infra/db/client";

export type UserProjectionPort = {
  upsertFromProjection: (params: {
    integratorUserId: string;
    phoneNormalized?: string;
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    channelCode?: string;
    externalId?: string;
  }) => Promise<{ platformUserId: string }>;
  findByIntegratorId: (integratorUserId: string) => Promise<{ platformUserId: string } | null>;
  updatePhone: (platformUserId: string, phoneNormalized: string) => Promise<void>;
  updateDisplayName: (platformUserId: string, displayName: string) => Promise<void>;
  /** Update profile (first_name, last_name, email, display_name) by phone; no-op if no user found. */
  updateProfileByPhone: (params: {
    phoneNormalized: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    displayName?: string | null;
  }) => Promise<void>;
  upsertNotificationTopics: (params: {
    platformUserId: string;
    topics: { topicCode: string; isEnabled: boolean }[];
  }) => Promise<void>;
  updateRole: (platformUserId: string, role: string) => Promise<void>;
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
      if (params.firstName !== undefined) {
        sets.push(`first_name = $${++idx}`);
        vals.push(params.firstName);
      }
      if (params.lastName !== undefined) {
        sets.push(`last_name = $${++idx}`);
        vals.push(params.lastName);
      }
      if (params.email !== undefined) {
        sets.push(`email = $${++idx}`);
        vals.push(params.email);
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
        if (params.firstName !== undefined) {
          sets.push(`first_name = $${vals.length + 1}`);
          vals.push(params.firstName);
        }
        if (params.lastName !== undefined) {
          sets.push(`last_name = $${vals.length + 1}`);
          vals.push(params.lastName);
        }
        if (params.email !== undefined) {
          sets.push(`email = $${vals.length + 1}`);
          vals.push(params.email);
        }
        await pool.query(
          `UPDATE platform_users SET ${sets.join(", ")} WHERE id = $1`,
          vals,
        );
      }
    }

    if (!userId) {
      const displayName = params.displayName ?? "";
      const firstName = params.firstName ?? null;
      const lastName = params.lastName ?? null;
      const email = params.email ?? null;
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO platform_users (integrator_user_id, phone_normalized, display_name, first_name, last_name, email)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [params.integratorUserId, params.phoneNormalized ?? null, displayName, firstName, lastName, email],
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

  async updateDisplayName(platformUserId, displayName) {
    const pool = getPool();
    await pool.query(
      "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2",
      [displayName, platformUserId],
    );
  },

  async updateProfileByPhone(params) {
    const pool = getPool();
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [];
    let idx = 0;
    if (params.firstName !== undefined) {
      sets.push(`first_name = $${++idx}`);
      vals.push(params.firstName);
    }
    if (params.lastName !== undefined) {
      sets.push(`last_name = $${++idx}`);
      vals.push(params.lastName);
    }
    if (params.email !== undefined) {
      sets.push(`email = $${++idx}`);
      vals.push(params.email);
    }
    if (params.displayName !== undefined) {
      sets.push(`display_name = $${++idx}`);
      vals.push(params.displayName);
    }
    if (vals.length === 0) return;
    vals.push(params.phoneNormalized);
    await pool.query(
      `UPDATE platform_users SET ${sets.join(", ")} WHERE phone_normalized = $${idx + 1}`,
      vals,
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

  async updateRole(platformUserId, role) {
    const pool = getPool();
    await pool.query(
      "UPDATE platform_users SET role = $1, updated_at = now() WHERE id = $2",
      [role, platformUserId],
    );
  },
};

export const inMemoryUserProjectionPort: UserProjectionPort = {
  upsertFromProjection: async () => ({ platformUserId: "" }),
  findByIntegratorId: async () => null,
  updatePhone: async () => {},
  updateDisplayName: async () => {},
  updateProfileByPhone: async () => {},
  upsertNotificationTopics: async () => {},
  updateRole: async () => {},
};
