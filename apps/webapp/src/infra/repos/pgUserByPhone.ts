import type { Pool, PoolClient } from "pg";
/**
 * Wave 3 phase 12B — Class C transport: `client.query("BEGIN"|"COMMIT"|"ROLLBACK"|SET CONSTRAINTS)`.
 * Domain SQL — `runIdentityClientPgText` / `runIdentityPoolPgText`; row-shape — Zod in `identityPhoneRowSchemas`.
 */
import { getPool } from "@/infra/db/client";
import type { SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { UserByPhonePort, CreateOrBindResult } from "@/modules/auth/userByPhonePort";
import { channelToBindingKey } from "@/modules/auth/channelContext";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import { findCanonicalUserIdByPhone, resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import { mergePlatformUsersInTransaction, pickMergeTargetId, enrichPickMergeCandidatesWithBookingCounts } from "@/infra/repos/pgPlatformUserMerge";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";
import { MergeConflictError, MergeDependentConflictError } from "@/infra/repos/platformUserMergeErrors";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";
import {
  bindingsFromRows,
  emailVerifiedRowSchema,
  parseChannelContext,
  parseIdentityRow,
  parseUserRole,
  phoneOnlyRowSchema,
  platformUserInsertRowSchema,
  platformUserPhoneRoleRowSchema,
  platformUserSessionRowSchema,
  puMergeRowSchema,
  userIdRowSchema,
} from "@/infra/repos/identityPhoneRowSchemas";
import { runIdentityClientPgText, runIdentityPoolPgText } from "@/infra/repos/identityPhoneSql";

async function loadPuRowForMerge(client: PoolClient, id: string) {
  const r = await runIdentityClientPgText(
    client,
    `SELECT id, phone_normalized, integrator_user_id::text AS integrator_user_id, merged_into_id,
            display_name, first_name, last_name, email, created_at
     FROM platform_users WHERE id = $1`,
    [id],
  );
  return r.rows[0] ? parseIdentityRow(puMergeRowSchema, r.rows[0], "pu_merge_row") : null;
}

async function loadSessionUser(pool: Pool, userId: string): Promise<SessionUser> {
  const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;
  const userRow = await runIdentityPoolPgText(
    "SELECT id, display_name, first_name, role, phone_normalized FROM platform_users WHERE id = $1",
    [canonicalId],
  );
  if (userRow.rows.length === 0) {
    throw new Error(`loadSessionUser: user ${userId} missing after canonical resolve`);
  }
  const u = parseIdentityRow(platformUserSessionRowSchema, userRow.rows[0], "load_session_user");
  const firstName = u.first_name?.trim() || undefined;
  const bindingsRows = await runIdentityPoolPgText(
    "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
    [canonicalId],
  );
  const bindings = bindingsFromRows(bindingsRows.rows);
  return {
    userId: canonicalId,
    role: parseUserRole(u.role, "load_session_user.role"),
    displayName: u.display_name ?? "",
    ...(firstName ? { firstName } : {}),
    phone: u.phone_normalized ?? undefined,
    bindings,
  };
}

export const pgUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(pool, userId)) ?? userId;
    const res = await runIdentityPoolPgText(
      "SELECT phone_normalized FROM platform_users WHERE id = $1",
      [canonical],
    );
    const p = res.rows[0] ? parseIdentityRow(phoneOnlyRowSchema, res.rows[0], "get_phone").phone_normalized : null;
    return typeof p === "string" && p.trim() ? p : null;
  },

  async getVerifiedEmailForUser(userId: string): Promise<string | null> {
    const pool = getPool();
    const canonical = (await resolveCanonicalUserId(pool, userId)) ?? userId;
    const res = await runIdentityPoolPgText(
      "SELECT email FROM platform_users WHERE id = $1 AND email_verified_at IS NOT NULL",
      [canonical],
    );
    const e = res.rows[0] ? parseIdentityRow(emailVerifiedRowSchema, res.rows[0], "verified_email").email : null;
    return typeof e === "string" && e.trim() ? e.trim() : null;
  },

  async findByUserId(userId: string): Promise<SessionUser | null> {
    const pool = getPool();
    const canonicalId = await resolveCanonicalUserId(pool, userId);
    if (!canonicalId) return null;
    const userRow = await runIdentityPoolPgText(
      "SELECT id, display_name, first_name, role, phone_normalized FROM platform_users WHERE id = $1",
      [canonicalId],
    );
    if (userRow.rows.length === 0) return null;
    const u = parseIdentityRow(platformUserSessionRowSchema, userRow.rows[0], "find_by_user_id");
    const firstName = u.first_name?.trim() || undefined;
    const bindingsRows = await runIdentityPoolPgText(
      "SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1",
      [canonicalId],
    );
    const bindings = bindingsFromRows(bindingsRows.rows);
    return {
      userId: u.id,
      role: parseUserRole(u.role, "find_by_user_id.role"),
      displayName: u.display_name ?? "",
      ...(firstName ? { firstName } : {}),
      phone: u.phone_normalized ?? undefined,
      bindings,
    };
  },

  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    const pool = getPool();
    const canonicalId = await findCanonicalUserIdByPhone(pool, normalizedPhone);
    if (!canonicalId) return null;
    return loadSessionUser(pool, canonicalId);
  },

  async createOrBind(phone: string, context: ChannelContext): Promise<CreateOrBindResult> {
    const parsedContext = parseChannelContext(context);
    const normalized = normalizeRuPhoneE164(phone);
    const pool = getPool();
    const key = channelToBindingKey(parsedContext.channel);
    const channelCode = parsedContext.channel;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SET CONSTRAINTS platform_users_phone_normalized_key, platform_users_integrator_user_id_key DEFERRED`,
      );

      const bindingLock = await runIdentityClientPgText(
        client,
        `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
        [channelCode, parsedContext.chatId],
      );

      if (bindingLock.rows.length > 0) {
        let userId = parseIdentityRow(userIdRowSchema, bindingLock.rows[0], "binding_lock").user_id;
        const canonicalId = (await resolveCanonicalUserId(client, userId)) ?? userId;
        userId = canonicalId;
        const displayName = parsedContext.displayName ?? normalized;
        await runIdentityClientPgText(client, "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2", [
          displayName,
          userId,
        ]);
        trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.OtpCreateOrBind);
        await runIdentityClientPgText(
          client,
          "UPDATE platform_users SET patient_phone_trust_at = now(), updated_at = now() WHERE id = $1::uuid",
          [userId],
        );
        await client.query("COMMIT");
        return { user: await loadSessionUser(pool, userId), wasCreated: false };
      }

      const phoneRow = await runIdentityClientPgText(
        client,
        `SELECT id, display_name, role FROM platform_users
         WHERE phone_normalized = $1 AND merged_into_id IS NULL
         FOR UPDATE`,
        [normalized],
      );

      let userId: string;
      let displayName: string;
      let wasCreated = false;

      if (phoneRow.rows.length > 0) {
        const u = parseIdentityRow(platformUserPhoneRoleRowSchema, phoneRow.rows[0], "phone_row");
        userId = u.id;
        displayName = parsedContext.displayName ?? u.display_name ?? normalized;
        await runIdentityClientPgText(client, "UPDATE platform_users SET display_name = $1, updated_at = now() WHERE id = $2", [
          displayName,
          userId,
        ]);
      } else {
        wasCreated = true;
        const insert = await runIdentityClientPgText(
          client,
          `INSERT INTO platform_users (phone_normalized, display_name, role)
           VALUES ($1, $2, 'client') RETURNING id, display_name`,
          [normalized, parsedContext.displayName ?? normalized],
        );
        const inserted = parseIdentityRow(platformUserInsertRowSchema, insert.rows[0], "insert_user");
        userId = inserted.id;
        displayName = inserted.display_name;
        await applyPlatformUserPhoneHistoryTransition(client, {
          platformUserId: userId,
          newPhoneNormalized: normalized,
          source: "otp",
        });
      }

      if (key) {
        const insB = await runIdentityClientPgText(
          client,
          `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (channel_code, external_id) DO NOTHING
           RETURNING user_id`,
          [userId, channelCode, parsedContext.chatId],
        );
        if (insB.rows.length > 0) {
          await upsertBroadcastDefaultsAfterChannelBind(client, userId, channelCode);
        } else {
          const o = await runIdentityClientPgText(
            client,
            `SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE`,
            [channelCode, parsedContext.chatId],
          );
          const other = o.rows[0] ? parseIdentityRow(userIdRowSchema, o.rows[0], "binding_conflict").user_id : null;
          if (!other) {
            throw new MergeConflictError("createOrBind: binding row missing after conflict", [userId]);
          }
          if (other !== userId) {
            const a = await loadPuRowForMerge(client, userId);
            const b = await loadPuRowForMerge(client, other);
            if (!a || !b) throw new MergeConflictError("createOrBind: row load failed", [userId, other]);
            const [ea, eb] = await enrichPickMergeCandidatesWithBookingCounts(client, a, b);
            const { target, duplicate } = pickMergeTargetId(ea, eb);
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
      await runIdentityClientPgText(
        client,
        "UPDATE platform_users SET patient_phone_trust_at = now(), updated_at = now() WHERE id = $1::uuid",
        [userId],
      );
      await client.query("COMMIT");
      return { user: await loadSessionUser(pool, userId), wasCreated };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
