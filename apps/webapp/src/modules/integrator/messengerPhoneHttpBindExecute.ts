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
import {
  applyMessengerPhonePublicBind,
  buildMessengerBindBlockedRelayLines,
  enrichMessengerBindAuditDetailsFields,
  messengerPhoneBindReasonHumanRu,
  MessengerPhoneLinkError,
  type MessengerBindAuditCandidateSummary,
  type MessengerBindAuditInitiatorSummary,
  type MessengerPhoneBindDb,
  type MessengerPhoneLinkFailureCode,
} from "@bersoncare/platform-merge";
import { computeConflictKeyFromCandidateIds, writeAuditLog } from "@/infra/adminAuditLog";
import { notifyMessengerPhoneBindBlockedFromWebapp } from "@/modules/admin-incidents/sendAdminIncidentAlerts";
import { logger } from "@/infra/logging/logger";
import { getAppBaseUrl } from "@/modules/system-settings/integrationRuntime";

/** Minimal DB surface for this TX (matches integrator `DbPort.query`). */
type TxQuery = {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
};

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

  await db.query(
    `DELETE FROM contacts
     WHERE type = 'phone'
       AND value_normalized = $2
       AND user_id <> $1::bigint`,
    [userId, phoneNormalized],
  );

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
  | MessengerPhoneLinkFailureCode;

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
          throw new MessengerPhoneLinkError("legacy_contacts_conflict");
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
        if (err.code !== "db_transient_failure") {
          let conflictKey: string | null = null;
          if (err.candidateIds.length > 0) {
            try {
              conflictKey = computeConflictKeyFromCandidateIds(err.candidateIds);
            } catch {
              conflictKey = null;
            }
          }
          void (async () => {
            let enrichedFields: {
              candidates: MessengerBindAuditCandidateSummary[];
              initiator: MessengerBindAuditInitiatorSummary | null;
              reasonHumanRu: string;
            };
            try {
              enrichedFields = await enrichMessengerBindAuditDetailsFields(pool as MessengerPhoneBindDb, {
                reason: err.code,
                candidateIds: err.candidateIds,
                channelCode: resource,
                externalId: channelUserId,
              });
            } catch (enrichErr) {
              logger.warn({ enrichErr, reason: err.code }, "messenger_phone_http_bind: audit enrich failed");
              const uniq = [...new Set(err.candidateIds.map((id) => id.trim()).filter(Boolean))];
              enrichedFields = {
                candidates: uniq.map((id) => ({
                  platformUserId: id,
                  displayName: null,
                  phoneNormalized: null,
                  email: null,
                })),
                initiator: null,
                reasonHumanRu: messengerPhoneBindReasonHumanRu(err.code),
              };
            }
            const auditDetails: Record<string, unknown> = {
              reason: err.code,
              source: "http_bind",
              channelCode: resource,
              externalId: channelUserId,
              phoneSuffix,
              candidateIds: err.candidateIds,
              ...(input.correlationId?.trim() ? { correlationId: input.correlationId.trim() } : {}),
              candidates: enrichedFields.candidates,
              initiator: enrichedFields.initiator,
              reasonHumanRu: enrichedFields.reasonHumanRu,
            };
            let relayLines: string[];
            try {
              const appBaseUrl = await getAppBaseUrl();
              relayLines = buildMessengerBindBlockedRelayLines({
                variantLabel: "HTTP bind (webapp)",
                machineReason: err.code,
                reasonHumanRu: enrichedFields.reasonHumanRu,
                appBaseUrl,
                candidates: enrichedFields.candidates,
                initiator: enrichedFields.initiator,
                channelCode: resource,
                externalId: channelUserId,
                ...(phoneSuffix ? { phoneSuffix } : {}),
                ...(input.correlationId?.trim() ? { correlationId: input.correlationId.trim() } : {}),
                source: "http_bind",
              });
            } catch (relayErr) {
              logger.warn({ relayErr }, "messenger_phone_http_bind: relay line build failed");
              relayLines = [
                "messenger_phone_bind_blocked (http_bind)",
                `reason=${err.code}`,
                `channel=${resource}`,
                `externalId=${channelUserId}`,
                ...(phoneSuffix ? [`phoneSuffix=${phoneSuffix}`] : []),
                `candidateIds=${err.candidateIds.join(",")}`,
              ];
            }
            await writeAuditLog(pool, {
              actorId: null,
              action: "messenger_phone_bind_blocked",
              targetId: err.candidateIds[0] ?? null,
              ...(conflictKey ? { conflictKey } : {}),
              details: auditDetails,
              status: "error",
            });
            await notifyMessengerPhoneBindBlockedFromWebapp({
              conflictKey,
              reason: err.code,
              channelCode: resource,
              externalId: channelUserId,
              phoneSuffix,
              candidateIds: err.candidateIds,
              relayLines,
            });
          })().catch(() => {});
        }
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
