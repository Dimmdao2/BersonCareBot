/**
 * Optional signed HTTP entry: same binding TX as integrator `user.phone.link`.
 * Logic is kept in sync with:
 * - `apps/integrator/src/infra/db/writePort.ts` (`user.phone.link`)
 * - `apps/integrator/src/infra/db/repos/messengerPhonePublicBind.ts`
 * - `apps/integrator/src/infra/db/repos/channelUsers.ts` (`setUserPhone`)
 * - `apps/integrator/src/infra/db/repos/canonicalUserId.ts`
 * - `apps/integrator/src/infra/db/repos/messageThreads.ts` (`ensureIdentityForMessenger`)
 *
 * Implemented here (not imported from `apps/integrator`) so Next.js production build does not bundle integrator sources with `.js` import paths.
 */
import type { Pool, PoolClient } from "pg";
import { logger } from "@/infra/logging/logger";

/** Minimal DB surface for this TX (matches integrator `DbPort.query`). */
type TxQuery = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
};

type MessengerPhoneLinkFailureCode = "no_channel_binding" | "phone_owned_by_other_user" | "integrator_id_mismatch";

class MessengerPhoneLinkError extends Error {
  readonly code: MessengerPhoneLinkFailureCode | "db_transient_failure";

  constructor(code: MessengerPhoneLinkFailureCode | "db_transient_failure", options?: { cause?: unknown }) {
    super(code);
    this.name = "MessengerPhoneLinkError";
    this.code = code;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

const MAX_MERGE_CHAIN_DEPTH = 32;
const BIGINT_STRING = /^\d+$/;

async function resolveCanonicalIntegratorUserId(db: TxQuery, integratorUserId: string): Promise<string> {
  const trimmed = integratorUserId.trim();
  if (!trimmed || !BIGINT_STRING.test(trimmed)) return integratorUserId;

  let current = trimmed;
  const visited = new Set<string>();
  for (let depth = 0; depth < MAX_MERGE_CHAIN_DEPTH; depth++) {
    if (visited.has(current)) {
      logger.warn({ integratorUserId, current }, "resolveCanonicalIntegratorUserId: cycle in merged_into_user_id chain");
      return current;
    }
    visited.add(current);

    const res = await db.query<{ merged_into_user_id: string | null }>(
      `SELECT merged_into_user_id::text AS merged_into_user_id
       FROM users
       WHERE id = $1::bigint
       LIMIT 1`,
      [current],
    );
    const row = res.rows[0];
    if (!row || row.merged_into_user_id == null || row.merged_into_user_id === "") {
      return current;
    }
    current = row.merged_into_user_id;
  }
  logger.warn({ integratorUserId, current }, "resolveCanonicalIntegratorUserId: max chain depth exceeded");
  return current;
}

async function ensureIdentityForMessenger(db: TxQuery, input: { resource: string; externalId: string }): Promise<void> {
  if (input.resource !== "max" || !input.externalId.trim()) return;
  const sql = `
    WITH existing AS (
      SELECT id FROM identities
      WHERE resource = $1 AND external_id = $2
      LIMIT 1
    ),
    new_user AS (
      INSERT INTO users (created_at, updated_at)
      SELECT now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    ),
    user_id AS (
      SELECT id FROM new_user
      UNION ALL
      SELECT i.user_id FROM identities i
      WHERE i.resource = $1 AND i.external_id = $2
      LIMIT 1
    ),
    ins AS (
      INSERT INTO identities (user_id, resource, external_id, created_at, updated_at)
      SELECT (SELECT id FROM user_id LIMIT 1), $1, $2, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      ON CONFLICT (resource, external_id) DO UPDATE SET updated_at = now()
    )
    SELECT 1
  `;
  await db.query(sql, [input.resource, input.externalId.trim()]);
}

async function applyMessengerPhonePublicBind(
  db: TxQuery,
  input: {
    channelCode: string;
    externalId: string;
    phoneNormalized: string;
    canonicalIntegratorUserId: string;
  },
): Promise<{ platformUserId: string }> {
  const { channelCode, externalId, phoneNormalized, canonicalIntegratorUserId } = input;

  const bindRes = await db.query<{
    platform_user_id: string;
    existing_int_uid: string | null;
  }>(
    `SELECT pu.id::text AS platform_user_id,
            pu.integrator_user_id::text AS existing_int_uid
     FROM public.user_channel_bindings ucb
     INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.channel_code = $1 AND ucb.external_id = $2
       AND pu.merged_into_id IS NULL
     LIMIT 1`,
    [channelCode, externalId],
  );
  const row = bindRes.rows[0];
  if (!row) {
    throw new MessengerPhoneLinkError("no_channel_binding");
  }

  const platformUserId = row.platform_user_id;

  if (
    row.existing_int_uid !== null &&
    row.existing_int_uid !== undefined &&
    row.existing_int_uid.trim() !== "" &&
    row.existing_int_uid !== canonicalIntegratorUserId
  ) {
    throw new MessengerPhoneLinkError("integrator_id_mismatch");
  }

  const otherPhone = await db.query<{ id: string }>(
    `SELECT id::text FROM public.platform_users
     WHERE phone_normalized = $1 AND merged_into_id IS NULL AND id <> $2::uuid
     LIMIT 1`,
    [phoneNormalized, platformUserId],
  );
  if (otherPhone.rows[0]) {
    throw new MessengerPhoneLinkError("phone_owned_by_other_user");
  }

  const otherInt = await db.query<{ id: string }>(
    `SELECT id::text FROM public.platform_users
     WHERE integrator_user_id = $1::bigint AND merged_into_id IS NULL AND id <> $2::uuid
     LIMIT 1`,
    [canonicalIntegratorUserId, platformUserId],
  );
  if (otherInt.rows[0]) {
    throw new MessengerPhoneLinkError("integrator_id_mismatch");
  }

  try {
    const upd = await db.query(
      `UPDATE public.platform_users SET
         phone_normalized = $2,
         patient_phone_trust_at = now(),
         integrator_user_id = COALESCE(integrator_user_id, $3::bigint),
         updated_at = now()
       WHERE id = $1::uuid
         AND merged_into_id IS NULL`,
      [platformUserId, phoneNormalized, canonicalIntegratorUserId],
    );
    if ((upd.rowCount ?? 0) < 1) {
      throw new MessengerPhoneLinkError("db_transient_failure");
    }
  } catch (err) {
    if (err instanceof MessengerPhoneLinkError) throw err;
    const pg = err as { code?: string };
    if (pg.code === "23505") {
      throw new MessengerPhoneLinkError("phone_owned_by_other_user");
    }
    logger.error({ err }, "[messengerPhone] public platform_users UPDATE failed");
    throw new MessengerPhoneLinkError("db_transient_failure", { cause: err });
  }

  return { platformUserId };
}

type SetUserPhoneOutcome = "applied" | "noop_conflict" | "failed";

async function setUserPhone(
  db: TxQuery,
  channelUserId: string,
  phoneNormalized: string,
  resource: string,
): Promise<SetUserPhoneOutcome> {
  const idRes = await db.query<{ user_id: string }>(
    `SELECT i.user_id::text AS user_id
     FROM identities i
     WHERE i.resource = $2
       AND i.external_id = $1
     LIMIT 1`,
    [channelUserId, resource],
  );
  const rawUserId = idRes.rows[0]?.user_id;
  if (!rawUserId) return "failed";

  const userId = await resolveCanonicalIntegratorUserId(db, rawUserId);

  const query = `
    INSERT INTO contacts (user_id, type, value_normalized, label, is_primary, created_at, updated_at)
    VALUES ($1::bigint, 'phone', $2, $3, NULL, now(), now())
    ON CONFLICT (type, value_normalized)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      label = EXCLUDED.label,
      updated_at = now()
    WHERE contacts.user_id = $1::bigint
  `;
  try {
    const res = await db.query(query, [userId, phoneNormalized, resource]);
    return (res.rowCount ?? 0) > 0 ? "applied" : "noop_conflict";
  } catch (err) {
    logger.error({ err }, "setUserPhone error");
    return "failed";
  }
}

function phoneLogSuffix(phoneNormalized: string): string {
  const d = phoneNormalized.replace(/\D/g, "");
  if (d.length <= 4) return "****";
  return d.slice(-4);
}

function pgSqlStateFromUnknown(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function createTxQuery(client: PoolClient): TxQuery {
  return {
    query: async <T = unknown>(sql: string, params?: unknown[]) => {
      const res = await client.query(sql, params);
      return {
        rows: res.rows as T[],
        ...(typeof res.rowCount === "number" ? { rowCount: res.rowCount } : {}),
      };
    },
  };
}

export type MessengerPhoneHttpBindFailureReason =
  | "no_integrator_identity"
  | "no_channel_binding"
  | "phone_owned_by_other_user"
  | "integrator_id_mismatch"
  | "db_transient_failure";

export type MessengerPhoneHttpBindResult =
  | { ok: true; platformUserId: string }
  | {
      ok: false;
      reason: MessengerPhoneHttpBindFailureReason;
      phoneLinkIndeterminate?: boolean;
    };

export async function executeMessengerPhoneHttpBind(
  pool: Pool,
  input: {
    channelCode: "telegram" | "max";
    externalId: string;
    phoneNormalized: string;
    correlationId?: string;
  },
): Promise<MessengerPhoneHttpBindResult> {
  const resource = input.channelCode;
  const channelUserId = input.externalId;
  const phoneNormalized = input.phoneNormalized;
  const phoneSuffix = phoneLogSuffix(phoneNormalized);
  const bindLogBase = {
    event: "messenger_phone_bind_tx" as const,
    bindOutcome: "bind_tx_fail" as const,
    source: "http_bind" as const,
    resource,
    channelCode: resource,
    externalId: channelUserId,
    metric: "messenger_bind_tx_fail" as const,
    ...(input.correlationId && input.correlationId.trim() ? { correlationId: input.correlationId.trim() } : {}),
  };

  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
  } catch (err) {
    logger.error({ err, ...bindLogBase }, "messenger_phone_http_bind: connect failed");
    return { ok: false, reason: "db_transient_failure", phoneLinkIndeterminate: true };
  }

  let phoneLinkEarly: MessengerPhoneHttpBindResult | undefined;
  let platformUserIdForLog: string | undefined;
  let applied = false;

  try {
    await client.query("BEGIN");
    const txDb = createTxQuery(client);

    try {
      if (resource === "max") {
        await ensureIdentityForMessenger(txDb, { resource: "max", externalId: channelUserId });
      }
      const idPeek = await txDb.query<{ user_id: string }>(
        `SELECT i.user_id::text AS user_id
         FROM identities i
         WHERE i.resource = $2 AND i.external_id = $1
         LIMIT 1`,
        [channelUserId, resource],
      );
      const rawUid = idPeek.rows[0]?.user_id ?? null;
      if (!rawUid) {
        phoneLinkEarly = { ok: false, reason: "no_integrator_identity" };
      } else {
        const canonicalUid = await resolveCanonicalIntegratorUserId(txDb, rawUid);
        const { platformUserId } = await applyMessengerPhonePublicBind(txDb, {
          channelCode: resource,
          externalId: channelUserId,
          phoneNormalized,
          canonicalIntegratorUserId: canonicalUid,
        });
        platformUserIdForLog = platformUserId;
        const outcome = await setUserPhone(txDb, channelUserId, phoneNormalized, resource);
        if (outcome === "failed") {
          throw new MessengerPhoneLinkError("db_transient_failure");
        }
        if (outcome === "noop_conflict") {
          throw new MessengerPhoneLinkError("phone_owned_by_other_user");
        }
        applied = true;
      }
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof MessengerPhoneLinkError) {
        const cause = (err as Error & { cause?: unknown }).cause;
        const sqlState = pgSqlStateFromUnknown(cause) ?? pgSqlStateFromUnknown(err);
        logger.warn(
          {
            ...bindLogBase,
            reason: err.code,
            ...(sqlState ? { sqlState } : {}),
            phoneSuffix,
          },
          "bind_tx_fail",
        );
        if (err.code === "db_transient_failure") {
          return { ok: false, reason: "db_transient_failure", phoneLinkIndeterminate: true };
        }
        return { ok: false, reason: err.code };
      }
      const sqlState = pgSqlStateFromUnknown(err);
      logger.error({ err, ...bindLogBase, ...(sqlState ? { sqlState } : {}), phoneSuffix }, "messenger_phone_http_bind: unexpected error");
      logger.warn({ ...bindLogBase, reason: "db_transient_failure", ...(sqlState ? { sqlState } : {}), phoneSuffix }, "bind_tx_fail");
      return { ok: false, reason: "db_transient_failure", phoneLinkIndeterminate: true };
    }

    if (phoneLinkEarly) {
      await client.query("ROLLBACK");
      if (!phoneLinkEarly.ok) {
        logger.warn(
          {
            ...bindLogBase,
            bindOutcome: "bind_tx_fail",
            reason: phoneLinkEarly.reason,
            phoneSuffix,
          },
          "bind_tx_fail",
        );
      }
      return phoneLinkEarly;
    }

    await client.query("COMMIT");

    if (applied && platformUserIdForLog) {
      logger.info(
        {
          event: "messenger_phone_bind_tx",
          bindOutcome: "bind_tx_ok",
          metric: "messenger_bind_ok",
          source: "http_bind",
          resource,
          channelCode: resource,
          externalId: channelUserId,
          platformUserId: platformUserIdForLog,
          phoneSuffix,
          ...(input.correlationId && input.correlationId.trim() ? { correlationId: input.correlationId.trim() } : {}),
        },
        "bind_tx_ok",
      );
      return { ok: true, platformUserId: platformUserIdForLog };
    }

    return { ok: false, reason: "db_transient_failure", phoneLinkIndeterminate: true };
  } finally {
    if (client) client.release();
  }
}
