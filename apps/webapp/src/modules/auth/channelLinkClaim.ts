import type { Pool, PoolClient } from "pg";

type SqlQueryable = Pick<Pool, "query">;

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
  db: SqlQueryable,
  stubUserId: string,
): Promise<ChannelBindingOwnerClass> {
  const pu = await db.query<{
    merged_into_id: string | null;
    phone_normalized: string | null;
    role: string | null;
  }>(
    `SELECT merged_into_id::text AS merged_into_id, phone_normalized, role::text AS role
     FROM platform_users WHERE id = $1::uuid`,
    [stubUserId],
  );
  const row = pu.rows[0];
  if (!row) return { kind: "real", reason: "stub_user_missing" };
  if (row.merged_into_id) return { kind: "real", reason: "stub_already_merged" };
  if (row.role !== "client") return { kind: "real", reason: "stub_role_not_client" };

  const phone = row.phone_normalized?.trim() ?? "";
  if (phone.length > 0) return { kind: "real", reason: "stub_has_phone" };

  const bindCount = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM user_channel_bindings WHERE user_id = $1::uuid`,
    [stubUserId],
  );
  const nBindings = Number.parseInt(bindCount.rows[0]?.c ?? "0", 10);
  if (!Number.isFinite(nBindings) || nBindings !== 1) {
    return { kind: "real", reason: nBindings > 1 ? "stub_multiple_channel_bindings" : "stub_no_channel_bindings" };
  }

  const oauth = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM user_oauth_bindings WHERE user_id = $1::uuid`,
    [stubUserId],
  );
  const nOauth = Number.parseInt(oauth.rows[0]?.c ?? "0", 10);
  if (Number.isFinite(nOauth) && nOauth > 0) return { kind: "real", reason: "stub_has_oauth" };

  const meaningfulSymptoms = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c
     FROM symptom_trackings st
     WHERE (st.platform_user_id = $1::uuid OR st.user_id = $2::text)
       AND st.deleted_at IS NULL
       AND (st.symptom_key IS NULL OR st.symptom_key NOT IN ('general_wellbeing', 'warmup_feeling'))`,
    [stubUserId, stubUserId],
  );
  const nSym = Number.parseInt(meaningfulSymptoms.rows[0]?.c ?? "0", 10);
  if (Number.isFinite(nSym) && nSym > 0) return { kind: "real", reason: "stub_has_non_system_symptom_trackings" };

  const bookings = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM patient_bookings WHERE platform_user_id = $1::uuid`,
    [stubUserId],
  );
  if (Number.parseInt(bookings.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_bookings" };

  const notes = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM doctor_notes WHERE user_id = $1::uuid`,
    [stubUserId],
  );
  if (Number.parseInt(notes.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_doctor_notes" };

  const intake = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM online_intake_requests WHERE user_id = $1::uuid`,
    [stubUserId],
  );
  if (Number.parseInt(intake.rows[0]?.c ?? "0", 10) > 0) return { kind: "real", reason: "stub_has_online_intake" };

  const lfk = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c
     FROM patient_lfk_assignments WHERE patient_user_id = $1::uuid AND is_active = true`,
    [stubUserId],
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

/**
 * Reassign `(channel_code, external_id)` to `tokenUserId`, soft-delete system wellbeing rows on the stub,
 * and mark the stub merged into the token holder. Caller must `BEGIN` on `client`.
 */
export async function claimMessengerChannelBindingInTransaction(
  client: PoolClient,
  input: ClaimMessengerChannelBindingInput,
): Promise<void> {
  const { tokenUserId, stubUserId, channelCode, externalId, secretRowId } = input;

  await client.query(
    `SELECT id FROM platform_users WHERE id IN ($1::uuid, $2::uuid) AND merged_into_id IS NULL FOR UPDATE`,
    [tokenUserId, stubUserId],
  );

  const recheck = await classifyChannelBindingOwnerForLink(client, stubUserId);
  if (recheck.kind !== "disposable") {
    throw new ChannelLinkClaimRejectedError(recheck.reason);
  }

  const sec = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM channel_link_secrets WHERE id = $1::uuid AND used_at IS NULL FOR UPDATE`,
    [secretRowId],
  );
  if (sec.rows.length === 0) {
    throw new Error("claimMessengerChannelBindingInTransaction: channel_link_secret missing or already used");
  }

  const bind = await client.query<{ user_id: string }>(
    `SELECT user_id::text AS user_id
     FROM user_channel_bindings
     WHERE channel_code = $1 AND external_id = $2
     FOR UPDATE`,
    [channelCode, externalId],
  );
  if (bind.rows.length === 0) {
    throw new Error("claimMessengerChannelBindingInTransaction: binding row missing");
  }
  if (bind.rows[0]!.user_id !== stubUserId) {
    throw new Error("claimMessengerChannelBindingInTransaction: binding owner mismatch");
  }

  await client.query(
    `UPDATE symptom_trackings
     SET is_active = false, deleted_at = now(), updated_at = now()
     WHERE (platform_user_id = $1::uuid OR user_id = $2::text)
       AND deleted_at IS NULL
       AND symptom_key IN ('general_wellbeing', 'warmup_feeling')`,
    [stubUserId, stubUserId],
  );

  await client.query(
    `UPDATE user_channel_bindings SET user_id = $1::uuid
     WHERE channel_code = $2 AND external_id = $3 AND user_id = $4::uuid`,
    [tokenUserId, channelCode, externalId, stubUserId],
  );

  await client.query(
    `UPDATE platform_users
     SET phone_normalized = NULL,
         patient_phone_trust_at = NULL,
         integrator_user_id = NULL,
         merged_into_id = $1::uuid,
         updated_at = now()
     WHERE id = $2::uuid AND merged_into_id IS NULL`,
    [tokenUserId, stubUserId],
  );

  await client.query(`UPDATE channel_link_secrets SET used_at = now() WHERE id = $1::uuid AND used_at IS NULL`, [
    secretRowId,
  ]);
}