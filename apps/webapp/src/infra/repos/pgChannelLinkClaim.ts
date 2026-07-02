import type { Pool, PoolClient } from "pg";

import {
  classifyMergeFailure,
  mergePlatformUsersInTransaction,
} from "@bersoncare/platform-merge";
import { getWebappSqlFromPgClient, runWebappPgText, type WebappSqlExecutor } from "@/infra/db/runWebappSql";
import { upsertBroadcastDefaultsAfterChannelBind } from "@/infra/upsertBroadcastDefaultsAfterChannelBind";

export class ChannelLinkClaimRejectedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`channel_link_claim_rejected:${reason}`);
    this.name = "ChannelLinkClaimRejectedError";
    this.reason = reason;
  }
}

export type ChannelBindingOwnerClass =
  | { kind: "disposable" }
  | { kind: "real"; reason: string };

/**
 * Decide whether the current owner of a messenger binding can be displaced by a channel-link token
 * without a full platform merge. Conservative: any non-trivial patient data or OAuth on the stub → real.
 */
export async function classifyChannelBindingOwnerForLink(
  db: WebappSqlExecutor,
  stubUserId: string,
): Promise<ChannelBindingOwnerClass> {
  const pu = await runWebappPgText<{
    merged_into_id: string | null;
    phone_normalized: string | null;
    role: string | null;
  }>(
    `SELECT merged_into_id::text AS merged_into_id, phone_normalized, role::text AS role
     FROM platform_users WHERE id = $1::uuid`,
    [stubUserId],
    db,
  );
  const row = pu.rows[0];
  if (!row) return { kind: "real", reason: "stub_user_missing" };
  if (row.merged_into_id) return { kind: "real", reason: "stub_already_merged" };
  if (row.role !== "client") return { kind: "real", reason: "stub_role_not_client" };

  const phone = row.phone_normalized?.trim() ?? "";
  if (phone.length > 0) return { kind: "real", reason: "stub_has_phone" };

  const bindCount = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c FROM user_channel_bindings WHERE user_id = $1::uuid`,
    [stubUserId],
    db,
  );
  const nBindings = Number.parseInt(bindCount.rows[0]?.c ?? "0", 10);
  if (!Number.isFinite(nBindings) || nBindings !== 1) {
    return { kind: "real", reason: nBindings > 1 ? "stub_multiple_channel_bindings" : "stub_no_channel_bindings" };
  }

  const oauth = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c FROM user_oauth_bindings WHERE user_id = $1::uuid`,
    [stubUserId],
    db,
  );
  const nOauth = Number.parseInt(oauth.rows[0]?.c ?? "0", 10);
  if (Number.isFinite(nOauth) && nOauth > 0) return { kind: "real", reason: "stub_has_oauth" };

  const meaningfulSymptoms = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c
     FROM symptom_trackings st
     WHERE (st.platform_user_id = $1::uuid OR st.user_id = $2::text)
       AND st.deleted_at IS NULL
       AND (st.symptom_key IS NULL OR st.symptom_key NOT IN ('general_wellbeing', 'warmup_feeling'))`,
    [stubUserId, stubUserId],
    db,
  );
  const nSym = Number.parseInt(meaningfulSymptoms.rows[0]?.c ?? "0", 10);
  if (Number.isFinite(nSym) && nSym > 0) return { kind: "real", reason: "stub_has_non_system_symptom_trackings" };

  const bookings = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c FROM patient_bookings WHERE platform_user_id = $1::uuid`,
    [stubUserId],
    db,
  );
  if (Number.parseInt(bookings.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_bookings" };

  const notes = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c FROM doctor_notes WHERE user_id = $1::uuid`,
    [stubUserId],
    db,
  );
  if (Number.parseInt(notes.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_doctor_notes" };

  const intake = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c FROM online_intake_requests WHERE user_id = $1::uuid`,
    [stubUserId],
    db,
  );
  if (Number.parseInt(intake.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_online_intake" };

  const lfk = await runWebappPgText<{ c: string }>(
    `SELECT count(*)::text AS c
     FROM patient_lfk_assignments WHERE patient_user_id = $1::uuid AND is_active = true`,
    [stubUserId],
    db,
  );
  if (Number.parseInt(lfk.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_active_lfk_assignments" };

  return { kind: "disposable" };
}

export type ClaimMessengerChannelBindingInput = {
  tokenUserId: string;
  stubUserId: string;
  channelCode: string;
  externalId: string;
  secretRowId: string;
};

export type ClaimMessengerChannelBindingResult =
  | { ok: true }
  | { ok: false; code: "rejected"; reason: string }
  | { ok: false; code: "failed"; err: unknown };

export type ChannelLinkOwnersMergeResult =
  | { ok: true }
  | { ok: false; reason: string; candidateIds: string[] };

export async function tryMergeChannelLinkOwners(
  pool: Pool,
  params: {
    tokenUserId: string;
    existingUserId: string;
    secretRowId: string;
  },
): Promise<ChannelLinkOwnersMergeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await mergePlatformUsersInTransaction(client, params.tokenUserId, params.existingUserId, "phone_bind");
    await runWebappPgText(
      `UPDATE channel_link_secrets SET used_at = now() WHERE id = $1::uuid AND used_at IS NULL`,
      [params.secretRowId],
      getWebappSqlFromPgClient(client),
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    const classified = classifyMergeFailure(err, [params.tokenUserId, params.existingUserId]);
    return {
      ok: false,
      reason: classified.code,
      candidateIds:
        classified.candidateIds.length > 0
          ? classified.candidateIds
          : [params.tokenUserId, params.existingUserId],
    };
  } finally {
    client.release();
  }
}

export async function claimMessengerChannelBinding(
  pool: Pool,
  input: ClaimMessengerChannelBindingInput,
): Promise<ClaimMessengerChannelBindingResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await claimMessengerChannelBindingInTransaction(client, input);
      await client.query("COMMIT");
      return { ok: true };
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof ChannelLinkClaimRejectedError) {
        return { ok: false, code: "rejected", reason: err.reason };
      }
      return { ok: false, code: "failed", err };
    }
  } finally {
    client.release();
  }
}

/**
 * Reassign `(channel_code, external_id)` to `tokenUserId`, soft-delete system wellbeing rows on the stub,
 * and mark the stub merged into the token holder. Caller must `BEGIN` on `client`.
 */
export async function claimMessengerChannelBindingInTransaction(
  client: PoolClient,
  input: ClaimMessengerChannelBindingInput,
): Promise<void> {
  const { tokenUserId, stubUserId, channelCode, externalId, secretRowId } = input;
  const db = getWebappSqlFromPgClient(client);

  await runWebappPgText(
    `SELECT id FROM platform_users WHERE id IN ($1::uuid, $2::uuid) AND merged_into_id IS NULL FOR UPDATE`,
    [tokenUserId, stubUserId],
    db,
  );

  const recheck = await classifyChannelBindingOwnerForLink(db, stubUserId);
  if (recheck.kind !== "disposable") {
    throw new ChannelLinkClaimRejectedError(recheck.reason);
  }

  const sec = await runWebappPgText<{ id: string }>(
    `SELECT id::text AS id FROM channel_link_secrets WHERE id = $1::uuid AND used_at IS NULL FOR UPDATE`,
    [secretRowId],
    db,
  );
  if (sec.rows.length === 0) {
    throw new Error("claimMessengerChannelBindingInTransaction: channel_link_secret missing or already used");
  }

  const bind = await runWebappPgText<{ user_id: string }>(
    `SELECT user_id::text AS user_id
     FROM user_channel_bindings
     WHERE channel_code = $1 AND external_id = $2
     FOR UPDATE`,
    [channelCode, externalId],
    db,
  );
  if (bind.rows.length === 0) {
    throw new Error("claimMessengerChannelBindingInTransaction: binding row missing");
  }
  if (bind.rows[0]!.user_id !== stubUserId) {
    throw new Error("claimMessengerChannelBindingInTransaction: binding owner mismatch");
  }

  await runWebappPgText(
    `UPDATE symptom_trackings
     SET is_active = false, deleted_at = now(), updated_at = now()
     WHERE (platform_user_id = $1::uuid OR user_id = $2::text)
       AND deleted_at IS NULL
       AND symptom_key IN ('general_wellbeing', 'warmup_feeling')`,
    [stubUserId, stubUserId],
    db,
  );

  await runWebappPgText(
    `UPDATE user_channel_bindings SET user_id = $1::uuid
     WHERE channel_code = $2 AND external_id = $3 AND user_id = $4::uuid`,
    [tokenUserId, channelCode, externalId, stubUserId],
    db,
  );

  await upsertBroadcastDefaultsAfterChannelBind(client, tokenUserId, channelCode);

  await runWebappPgText(
    `UPDATE platform_users
     SET phone_normalized = NULL,
         patient_phone_trust_at = NULL,
         integrator_user_id = NULL,
         merged_into_id = $1::uuid,
         merged_at = now(),
         updated_at = now()
     WHERE id = $2::uuid AND merged_into_id IS NULL`,
    [tokenUserId, stubUserId],
    db,
  );

  await runWebappPgText(
    `UPDATE channel_link_secrets SET used_at = now() WHERE id = $1::uuid AND used_at IS NULL`,
    [secretRowId],
    db,
  );
}
