import { getPool } from "@/infra/db/client";
import type { Pool } from "pg";
import type { ChannelBindings, SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import { channelToBindingKey } from "@/modules/auth/channelContext";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import { findCanonicalUserIdByPhone, resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import { mergePlatformUsersInTransaction, pickMergeTargetId } from "@/infra/repos/pgPlatformUserMerge";
import type { PoolClient } from "pg";

import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";

function rowToBindings(rows: { channel_code: string; external_id: string }[]): ChannelBindings {
  const bindings: ChannelBindings = {};
  for (const row of rows) {
    const key = row.channel_code === "telegram" ? "telegramId" : row.channel_code === "max" ? "maxId" : "vkId";
    (bindings as Record<string, string>)[key] = row.external_id;
  }
  return bindings;
}

type PuMergeRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: Date;
};

async function loadPuRowForMerge(client: PoolClient, id: string): Promise<PuMergeRow | null> {
  const r = await client.query<PuMergeRow>(
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, merged_into_id,
            display_name, first_name, last_name, email, created_at
     FROM platform_users WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

async function loadSessionUser(pool: Pool, userId: string): Promise<SessionUser> {
  const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
  const userRow = await pool.query(
    "SELECT id, display_name, role, phone_normalized FROM platform_users WHERE id = $1",
    [canonicalId],
  );
  if (userRow.rows.length === 0) {
    throw new Error(`loadSessionUser: user ${userId} missing after canonical resolve`);
  }
  const u = userRow.rows[0];
  const bindingsRows = await pool.query(
    "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
    [canonicalId],
  );
  const bindings = rowToBindings(bindingsRows.rows as { channel_code: string; external_id: string }[]);
  return {
    userId: canonicalId,
    role: u.role as SessionUser["role"],
    displayName: u.display_name ?? "",
    phone: u.phone_normalized,
    bindings,
  };
}

export const pgUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(pool, userId)) ?? userId;
    const res = await pool.query<{ phone_normalized: string | null }>(
      "SELECT phone_normalized FROM platform_users WHERE id = $1",
      [canonical],
    );
    const p = res.rows[0]?.phone_normalized;
    return typeof p === "string" && p.trim() ? p : null;
  },

  async getVerifiedEmailForUser(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(pool, userId)) ?? userId;
    const res = await pool.query<{ email: string | null }>(
      "SELECT email FROM platform_users WHERE id = $1 AND email_verified_at IS NOT NULL",
      [canonical],
    );
    const e = res.rows[0]?.email;
    return typeof e === "string" && e.trim() ? e.trim() : null;
  },

  async findByUserId(userId: string): Promise<SessionUser | null> {
    const pool = getPool();
    const canonicalId = await resolveCanonicalUserId(pool, userId);
    if (!canonicalId) return null;
    const userRow = await pool.query(
      "SELECT id, display_name, role, phone_normalized FROM platform_users WHERE id = $1",
      [canonicalId],
    );
    if (userRow.rows.length === 0) return null;
    const u = userRow.rows[0];
    const bindingsRows = await pool.query(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [canonicalId],
    );
    const bindings = rowToBindings(bindingsRows.rows as { channel_code: string; external_id: string }[]);
    return {
      userId: u.id,
      role: u.role as SessionUser["role"],
      displayName: u.display_name ?? "",
      phone: u.phone_normalized,
      bindings,
    };
  },

  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    const pool = getPool();
    const canonicalId = await findCanonicalUserIdByPhone(pool, normalizedPhone);
    if (!canonicalId) return null;
    return loadSessionUser(pool, canonicalId);
  },

  async createOrBind(phone: string, context: ChannelContext): Promise<SessionUser> {
    const normalized = normalizeRuPhoneE164(phone);
    const pool = getPool();
    const key = channelToBindingKey(context.channel);
    const channelCode = context.channel;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
      );

      const bindingLock = await client.query<{ user_id: string }>(
        `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
        [channelCode, context.chatId],
      );

      if (bindingLock.rows.length > 0) {
        let userId = bindingLock.rows[0]!.user_id;
        const canonicalId = (await resolveCanonicalUserId(client, userId)) ?? userId;
        userId = canonicalId;
        const displayName = context.displayName ?? normalized;
        await client.query("UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2", [
          displayName,
          userId,
        ]);
        trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind);
        await client.query(
          "UPDATE platform_users SET patient_phone_trust_at = now(), updated_at = now() WHERE id = $1::uuid",
          [userId],
        );
        await client.query("COMMIT");
        return loadSessionUser(pool, userId);
      }

      const phoneRow = await client.query<{ id: string; display_name: string; role: string }>(
        `SELECT id, display_name, role FROM platform_users
         WHERE phone_normalized = $1 AND merged_into_id IS NULL
         FOR UPDATE`,
        [normalized],
      );

      let userId: string;
      let displayName: string;

      if (phoneRow.rows.length > 0) {
        const u = phoneRow.rows[0]!;
        userId = u.id;
        displayName = context.displayName ?? u.display_name ?? normalized;
        await client.query("UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2", [
          displayName,
          userId,
        ]);
      } else {
        const insert = await client.query<{ id: string; display_name: string }>(
          `INSERT INTO platform_users (phone_normalized, display_name, role)
           VALUES ($1, $2, 'client') RETURNING id, display_name`,
          [normalized, context.displayName ?? normalized],
        );
        userId = insert.rows[0]!.id;
        displayName = insert.rows[0]!.display_name;
      }

      if (key) {
        const insB = await client.query<{ user_id: string }>(
          `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (channel_code, external_id) DO NOTHING
           RETURNING user_id`,
          [userId, channelCode, context.chatId],
        );
        if (insB.rows.length > 0) {
          await upsertBroadcastDefaultsAfterChannelBind(client, userId, channelCode);
        } else {
          const o = await client.query<{ user_id: string }>(
            `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
            [channelCode, context.chatId],
          );
          const other = o.rows[0]?.user_id;
          if (!other) {
            throw new MergeConflictError("createOrBind: binding row missing after conflict", [userId]);
          }
          if (other !== userId) {
            const a = await loadPuRowForMerge(client, userId);
            const b = await loadPuRowForMerge(client, other);
            if (!a || !b) throw new MergeConflictError("createOrBind: row load failed", [userId, other]);
            const { target, duplicate } = pickMergeTargetId(a, b);
            try {
              await mergePlatformUsersInTransaction(client, target, duplicate, "phone_bind");
            } catch (e) {
              if (e instanceof MergeDependentConflictError || e instanceof MergeConflictError) throw e;
              throw e;
            }
            userId = target;
          }
        }
      }

      trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind);
      await client.query(
        "UPDATE platform_users SET patient_phone_trust_at = now(), updated_at = now() WHERE id = $1::uuid",
        [userId],
      );
      await client.query("COMMIT");
      return loadSessionUser(pool, userId);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
