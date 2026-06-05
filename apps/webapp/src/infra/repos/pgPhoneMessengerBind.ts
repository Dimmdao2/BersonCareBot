import type { Pool, PoolClient, QueryResultRow } from "pg";
/**
 * Wave 3 phase 12B — Class C transport: `client.query("BEGIN"|"COMMIT"|"ROLLBACK")` in `withTransaction`.
 * Domain SQL — `runIdentityClientPgText` / `runIdentityPoolPgTextOnPool`; platform-merge bridge via same client executor.
 */
import {
  applyMessengerPhonePublicBind,
  classifyMergeFailure,
  enrichMessengerBindAuditDetailsFields,
  mergePlatformUsersInTransaction,
  type MessengerPhoneBindDb,
  MessengerPhoneLinkError,
} from "@bersoncare/platform-merge";
import {
  computeConflictKeyFromCandidateIds,
  type AuditLogStatus,
} from "@/infra/adminAuditLog";
import { getPool } from "@/infra/db/client";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";
import { channelToBindingKey } from "@/modules/auth/channelContext";
import type {
  PhoneMessengerBindChannel,
  PhoneMessengerBindPort,
  PhoneMessengerBindPreOtpFailure,
  PhoneMessengerBindPurpose,
} from "@/modules/auth/phoneMessengerBind.ports";
import {
  auditLogRepeatRowSchema,
  bindingOwnerRowSchema,
  mapPhoneMessengerBindSecretRow,
  parseIdentityRow,
  platformUserIdRowSchema,
  userIdRowSchema,
} from "@/infra/repos/identityPhoneRowSchemas";
import { runIdentityClientPgText, runIdentityPoolPgTextOnPool } from "@/infra/repos/identityPhoneSql";

function asMessengerPhoneBindDb(client: PoolClient): MessengerPhoneBindDb {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: unknown[]) {
      const result = await runIdentityClientPgText<R>(client, queryText, values ?? []);
      return { rows: result.rows, rowCount: result.rowCount ?? undefined };
    },
  };
}

async function runBindPgText<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  client: PoolClient | undefined,
  queryText: string,
  values: readonly unknown[] = [],
) {
  if (client) {
    return runIdentityClientPgText<T>(client, queryText, values);
  }
  return runIdentityPoolPgTextOnPool<T>(pool, queryText, values);
}

async function mergeMessengerBindPair(
  client: PoolClient,
  params: {
    targetId: string;
    duplicateId: string;
  },
): Promise<{ ok: true } | PhoneMessengerBindPreOtpFailure> {
  const targetId = params.targetId.trim();
  const duplicateId = params.duplicateId.trim();
  if (!targetId || !duplicateId || targetId === duplicateId) return { ok: true };
  try {
    await mergePlatformUsersInTransaction(asMessengerPhoneBindDb(client), targetId, duplicateId, "phone_bind");
    return { ok: true };
  } catch (err) {
    const classified = classifyMergeFailure(err, [targetId, duplicateId]);
    return {
      ok: false,
      code: classified.code,
      candidateIds: classified.candidateIds.length > 0 ? classified.candidateIds : [targetId, duplicateId],
    };
  }
}

async function applyMessengerContactPreOtpImpl(
  client: PoolClient,
  params: {
    phoneNormalized: string;
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    purpose: PhoneMessengerBindPurpose;
    sessionUserId?: string | null;
  },
): Promise<{ ok: true; accountCreated: boolean } | PhoneMessengerBindPreOtpFailure> {
  const channelCode = params.channelCode;
  const key = channelToBindingKey(channelCode);
  if (!key) return { ok: false, code: "unsupported_channel" };

  const existingByPhone = await runIdentityClientPgText(
    client,
    `SELECT id FROM platform_users WHERE phone_normalized = $1 AND merged_into_id IS NULL FOR UPDATE`,
    [params.phoneNormalized],
  );

  if (params.purpose === "profile_bind") {
    const sessionId = params.sessionUserId?.trim();
    if (!sessionId) return { ok: false, code: "session_required" };
    let canonicalSession = (await resolveCanonicalUserId(client, sessionId)) ?? sessionId;
    if (existingByPhone.rows.length > 0) {
      const phoneOwnerId = parseIdentityRow(platformUserIdRowSchema, existingByPhone.rows[0], "phone_owner").id;
      const phoneOwnerCanonical = (await resolveCanonicalUserId(client, phoneOwnerId)) ?? phoneOwnerId;
      if (phoneOwnerCanonical !== canonicalSession) {
        const merged = await mergeMessengerBindPair(client, {
          targetId: canonicalSession,
          duplicateId: phoneOwnerCanonical,
        });
        if (!merged.ok) return merged;
        canonicalSession = (await resolveCanonicalUserId(client, canonicalSession)) ?? canonicalSession;
      }
    }
    await runIdentityClientPgText(
      client,
      `UPDATE platform_users SET phone_normalized = $1, updated_at = now() WHERE id = $2::uuid`,
      [params.phoneNormalized, canonicalSession],
    );
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: canonicalSession,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
    const ins = await runIdentityClientPgText(
      client,
      `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING user_id`,
      [canonicalSession, channelCode, params.externalId],
    );
    const boundUserId = ins.rows[0] ? parseIdentityRow(userIdRowSchema, ins.rows[0], "profile_bind").user_id : null;
    if (boundUserId && boundUserId !== canonicalSession) {
      return { ok: false, code: "channel_owned_by_other_user" };
    }
    await upsertBroadcastDefaultsAfterChannelBind(client, canonicalSession, channelCode);
    return { ok: true, accountCreated: false };
  }

  const bindingOwner = await runIdentityClientPgText(
    client,
    `SELECT ucb.user_id::text,
            pu.integrator_user_id::text AS integrator_user_id
     FROM user_channel_bindings ucb
     JOIN platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = $1 AND ucb.external_id = $2
     FOR UPDATE OF ucb, pu`,
    [channelCode, params.externalId],
  );
  const bindingOwnerRow = bindingOwner.rows[0]
    ? parseIdentityRow(bindingOwnerRowSchema, bindingOwner.rows[0], "binding_owner")
    : null;
  const bindingOwnerId = bindingOwnerRow?.user_id ?? null;
  const bindingOwnerIntegratorId = bindingOwnerRow?.integrator_user_id?.trim() || null;

  if (bindingOwnerId && existingByPhone.rows.length > 0) {
    const phoneOwnerId = parseIdentityRow(platformUserIdRowSchema, existingByPhone.rows[0], "phone_owner_login").id;
    const ownerCanonical = (await resolveCanonicalUserId(client, bindingOwnerId)) ?? bindingOwnerId;
    const phoneCanonical = (await resolveCanonicalUserId(client, phoneOwnerId)) ?? phoneOwnerId;
    if (ownerCanonical !== phoneCanonical) {
      if (bindingOwnerIntegratorId) {
        const mergeClient = asMessengerPhoneBindDb(client);
        try {
          const applied = await applyMessengerPhonePublicBind(mergeClient, {
            channelCode,
            externalId: params.externalId,
            phoneNormalized: params.phoneNormalized,
            canonicalIntegratorUserId: bindingOwnerIntegratorId,
          });
          await upsertBroadcastDefaultsAfterChannelBind(client, applied.platformUserId, channelCode);
          return { ok: true, accountCreated: false };
        } catch (err) {
          if (err instanceof MessengerPhoneLinkError) {
            return {
              ok: false,
              code: err.code,
              candidateIds: err.candidateIds.length > 0 ? err.candidateIds : [ownerCanonical, phoneCanonical],
            };
          }
          return { ok: false, code: "db_transient_failure", candidateIds: [ownerCanonical, phoneCanonical] };
        }
      }
      const merged = await mergeMessengerBindPair(client, {
        targetId: phoneCanonical,
        duplicateId: ownerCanonical,
      });
      if (!merged.ok) return merged;
      await upsertBroadcastDefaultsAfterChannelBind(client, phoneCanonical, channelCode);
      return { ok: true, accountCreated: false };
    }
  }

  let userId: string;
  let accountCreated = false;
  if (bindingOwnerId && existingByPhone.rows.length === 0) {
    userId = (await resolveCanonicalUserId(client, bindingOwnerId)) ?? bindingOwnerId;
    await runIdentityClientPgText(
      client,
      `UPDATE platform_users
       SET phone_normalized = $1,
           patient_phone_trust_at = COALESCE(patient_phone_trust_at, now()),
           updated_at = now()
       WHERE id = $2::uuid`,
      [params.phoneNormalized, userId],
    );
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: userId,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
  } else if (existingByPhone.rows.length > 0) {
    userId = parseIdentityRow(platformUserIdRowSchema, existingByPhone.rows[0], "existing_phone_user").id;
  } else {
    const insert = await runIdentityClientPgText(
      client,
      `INSERT INTO platform_users (phone_normalized, display_name, role)
       VALUES ($1, $2, 'client') RETURNING id`,
      [params.phoneNormalized, params.phoneNormalized],
    );
    userId = parseIdentityRow(platformUserIdRowSchema, insert.rows[0], "insert_phone_user").id;
    accountCreated = true;
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: userId,
      newPhoneNormalized: params.phoneNormalized,
      source: "messenger",
    });
  }

  if (bindingOwner.rows.length > 0) {
    const ownerId = parseIdentityRow(bindingOwnerRowSchema, bindingOwner.rows[0], "binding_owner_recheck").user_id;
    if (ownerId !== userId) {
      const ownerCanonical = (await resolveCanonicalUserId(client, ownerId)) ?? ownerId;
      const userCanonical = (await resolveCanonicalUserId(client, userId)) ?? userId;
      if (ownerCanonical !== userCanonical) {
        const merged = await mergeMessengerBindPair(client, {
          targetId: userCanonical,
          duplicateId: ownerCanonical,
        });
        if (!merged.ok) return merged;
        userId = userCanonical;
      }
    }
  }

  await runIdentityClientPgText(
    client,
    `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (channel_code, external_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [userId, channelCode, params.externalId],
  );
  await upsertBroadcastDefaultsAfterChannelBind(client, userId, channelCode);
  return { ok: true, accountCreated };
}

async function recordMessengerBindBlockedImpl(
  client: PoolClient,
  params: {
    reason: string;
    candidateIds: string[];
    channelCode: PhoneMessengerBindChannel;
    externalId: string;
    phoneNormalized: string;
    source: string;
  },
): Promise<void> {
  const candidateIds = [...new Set(params.candidateIds.map((id) => id.trim()).filter(Boolean))];
  const phoneSuffix = params.phoneNormalized.replace(/\D/g, "").slice(-4) || "****";
  let conflictKey: string | null = null;
  if (candidateIds.length > 0) {
    try {
      conflictKey = computeConflictKeyFromCandidateIds(candidateIds);
    } catch {
      conflictKey = null;
    }
  }

  let enrichedFields: Record<string, unknown> = {};
  try {
    enrichedFields = await enrichMessengerBindAuditDetailsFields(asMessengerPhoneBindDb(client), {
      reason: params.reason,
      candidateIds,
      channelCode: params.channelCode,
      externalId: params.externalId,
    });
  } catch {
    enrichedFields = {};
  }

  const baseDetails = {
    reason: params.reason,
    candidateIds,
    channelCode: params.channelCode,
    externalId: params.externalId,
    phoneSuffix,
    source: params.source,
    ...enrichedFields,
  };
  const status: AuditLogStatus = "error";

  if (!conflictKey) {
    await runIdentityClientPgText(
      client,
      `INSERT INTO admin_audit_log (actor_id, action, target_id, conflict_key, details, status)
       VALUES (NULL, 'messenger_phone_bind_anomaly', $1, NULL, $2::jsonb, $3)`,
      [candidateIds[0] ?? null, JSON.stringify(baseDetails), status],
    );
    return;
  }

  const existing = await runIdentityClientPgText(
    client,
    `SELECT id::text, repeat_count
     FROM admin_audit_log
     WHERE conflict_key = $1 AND resolved_at IS NULL
     FOR UPDATE
     LIMIT 1`,
    [conflictKey],
  );
  if (existing.rows[0]) {
    const row = parseIdentityRow(auditLogRepeatRowSchema, existing.rows[0], "audit_log_repeat");
    await runIdentityClientPgText(
      client,
      `UPDATE admin_audit_log
       SET details = details || $2::jsonb,
           repeat_count = repeat_count + 1,
           last_seen_at = now(),
           status = $3
       WHERE id = $1::uuid`,
      [row.id, JSON.stringify(baseDetails), status],
    );
    return;
  }

  await runIdentityClientPgText(
    client,
    `INSERT INTO admin_audit_log (actor_id, action, target_id, conflict_key, details, status, repeat_count, last_seen_at)
     VALUES (NULL, 'messenger_phone_bind_blocked', $1, $2, $3::jsonb, $4, 1, now())
     ON CONFLICT (conflict_key) WHERE resolved_at IS NULL DO UPDATE
       SET details = admin_audit_log.details || EXCLUDED.details,
           repeat_count = admin_audit_log.repeat_count + 1,
           last_seen_at = now(),
           status = EXCLUDED.status`,
    [candidateIds[0] ?? null, conflictKey, JSON.stringify(baseDetails), status],
  );
}

export function createPgPhoneMessengerBindPort(pool: Pool = getPool()): PhoneMessengerBindPort {
  return {
    async findByTokenHash(tokenHash) {
      const r = await runIdentityPoolPgTextOnPool(
        pool,
        `SELECT id, phone_normalized, channel_code, purpose, user_id, status, challenge_id, failure_code, expires_at, consumed_at
         FROM phone_messenger_bind_secrets WHERE token_hash = $1`,
        [tokenHash],
      );
      return r.rows[0] ? mapPhoneMessengerBindSecretRow(r.rows[0]) : null;
    },

    async deletePending(phoneNormalized, channelCode, purpose) {
      await runIdentityPoolPgTextOnPool(
        pool,
        `DELETE FROM phone_messenger_bind_secrets
         WHERE phone_normalized = $1 AND channel_code = $2 AND purpose = $3 AND status = 'pending_contact'`,
        [phoneNormalized, channelCode, purpose],
      );
    },

    async insertSecret(params) {
      await runIdentityPoolPgTextOnPool(
        pool,
        `INSERT INTO phone_messenger_bind_secrets
           (token_hash, phone_normalized, channel_code, purpose, user_id, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'pending_contact', $6)`,
        [
          params.tokenHash,
          params.phoneNormalized,
          params.channelCode,
          params.purpose,
          params.userId,
          params.expiresAtIso,
        ],
      );
    },

    async updateExpired(id) {
      await runIdentityPoolPgTextOnPool(pool, `UPDATE phone_messenger_bind_secrets SET status = 'expired' WHERE id = $1`, [
        id,
      ]);
    },

    async updateFailed(id, failureCode, client) {
      await runBindPgText(
        pool,
        client,
        `UPDATE phone_messenger_bind_secrets SET status = 'failed', failure_code = $2 WHERE id = $1`,
        [id, failureCode],
      );
    },

    async updateOtpReady(id, challengeId, client) {
      await runBindPgText(
        pool,
        client,
        `UPDATE phone_messenger_bind_secrets
         SET status = 'otp_ready', challenge_id = $2, failure_code = NULL
         WHERE id = $1`,
        [id, challengeId],
      );
    },

    async markConsumed(id, client) {
      await runBindPgText(
        pool,
        client,
        `UPDATE phone_messenger_bind_secrets SET status = 'consumed', consumed_at = now()
         WHERE id = $1 AND status <> 'consumed'`,
        [id],
      );
    },

    async markConsumedByChallenge(challengeId) {
      await runIdentityPoolPgTextOnPool(
        pool,
        `UPDATE phone_messenger_bind_secrets SET status = 'consumed', consumed_at = now()
         WHERE challenge_id = $1 AND status = 'otp_ready'`,
        [challengeId],
      );
    },

    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },

    applyMessengerContactPreOtp: applyMessengerContactPreOtpImpl,
    recordMessengerBindBlocked: recordMessengerBindBlockedImpl,
  };
}
