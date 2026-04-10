import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { deepReplaceIntegratorUserIdInValue, recomputeProjectionIdempotencyKeyAfterMerge } from './projectionOutboxMergePolicy.js';

const BIGINT_STRING = /^\d+$/;

export type MergeIntegratorUsersOptions = {
  /** When true, skip merge (validation + lock only). */
  dryRun?: boolean;
};

export type MergeIntegratorUsersResult = {
  winnerId: string;
  loserId: string;
  /** Loser was already merged into this winner — no-op (idempotent retry). */
  alreadyMerged?: true;
  /** Set when `dryRun: true` — transaction committed with no data mutations (validation + locks only). */
  dryRun?: true;
  duplicateIdentitiesMerged: number;
  identitiesReassigned: number;
  contactsDeletedDuplicate: number;
  contactsReassigned: number;
  reminderRulesDeletedDuplicate: number;
  reminderRulesReassigned: number;
  contentAccessGrantsReassigned: number;
  userSubscriptionsDeletedDuplicate: number;
  userSubscriptionsReassigned: number;
  mailingLogsDeletedDuplicate: number;
  mailingLogsReassigned: number;
  projectionOutboxPayloadRewrites: number;
  projectionOutboxIdempotencyRewrites: number;
  projectionOutboxDedupedCancelled: number;
};

export class MergeIntegratorUsersError extends Error {
  constructor(
    readonly code: 'INVALID_USER_ID' | 'SAME_USER' | 'USER_NOT_FOUND' | 'ALREADY_MERGED_ALIAS',
    message: string,
  ) {
    super(message);
    this.name = 'MergeIntegratorUsersError';
  }
}

function assertNumericUserId(id: string, label: string): string {
  const t = id.trim();
  if (!BIGINT_STRING.test(t)) {
    throw new MergeIntegratorUsersError('INVALID_USER_ID', `${label} must be a numeric integrator users.id`);
  }
  return t;
}

type UserRow = { id: string; merged_into_user_id: string | null };

async function realignProjectionOutboxInTx(
  db: DbPort,
  loser: string,
  winner: string,
): Promise<{ payloadRewrites: number; keyRewrites: number; deduped: number }> {
  /** Only `pending`: avoids racing the projection worker while a row is `processing`. */
  const res = await db.query<{
    id: string;
    event_type: string;
    idempotency_key: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT id::text AS id, event_type, idempotency_key, payload
     FROM projection_outbox
     WHERE status = 'pending'
       AND (
         (payload->>'integratorUserId') = $1
         OR (payload #>> '{payloadJson,integratorUserId}') = $1
         OR (payload #>> '{payloadJson,integrator_user_id}') = $1
         OR (payload::text LIKE '%"integratorUserId":"' || $1 || '"%')
         OR (payload::text LIKE '%"integrator_user_id":"' || $1 || '"%')
       )
     ORDER BY id::bigint ASC`,
    [loser],
  );

  let payloadRewrites = 0;
  let keyRewrites = 0;
  let deduped = 0;

  for (const row of res.rows) {
    const rawPayload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const newPayload = deepReplaceIntegratorUserIdInValue(rawPayload, loser, winner) as Record<string, unknown>;
    const newKey = recomputeProjectionIdempotencyKeyAfterMerge(row.event_type, newPayload, Number(row.id));

    if (newKey === row.idempotency_key) {
      await db.query(
        `UPDATE projection_outbox SET payload = $2::jsonb, updated_at = now() WHERE id = $1::bigint`,
        [row.id, JSON.stringify(newPayload)],
      );
      payloadRewrites += 1;
      continue;
    }

    const exists = await db.query<{ id: string }>(
      `SELECT id::text AS id FROM projection_outbox WHERE idempotency_key = $1 AND id <> $2::bigint LIMIT 1`,
      [newKey, row.id],
    );

    if (exists.rows.length > 0) {
      await db.query(
        `UPDATE projection_outbox
         SET status = 'cancelled',
             last_error = $2,
             updated_at = now()
         WHERE id = $1::bigint`,
        [row.id, 'merge:user deduped (winner idempotency_key already present)'],
      );
      deduped += 1;
      continue;
    }

    await db.query(
      `UPDATE projection_outbox
       SET idempotency_key = $2,
           payload = $3::jsonb,
           updated_at = now()
       WHERE id = $1::bigint`,
      [row.id, newKey, JSON.stringify(newPayload)],
    );
    payloadRewrites += 1;
    keyRewrites += 1;
  }

  return { payloadRewrites, keyRewrites, deduped };
}

/**
 * Merges integrator `users` rows: moves FK dependents from loser to winner, realigns `projection_outbox`
 * (`pending` rows only), sets `loser.merged_into_user_id = winner.id`.
 *
 * **Transaction:** all steps run in one `db.tx` (COMMIT or full ROLLBACK on error).
 *
 * **Idempotency:** if `loser.merged_into_user_id` already equals `winner`, returns success with
 * `alreadyMerged: true` and zero counters (safe operator retry).
 *
 * **dryRun:** validates and takes row locks, then commits with **no** domain or outbox mutations
 * (empty commit from a data perspective — not a ROLLBACK preview).
 *
 * **Outbox:** rows in `processing` are left unchanged until the worker finishes; run merge after drain
 * or accept a second pass for any remaining `pending` rows referencing the loser.
 */
export async function mergeIntegratorUsers(
  db: DbPort,
  winnerId: string,
  loserId: string,
  options: MergeIntegratorUsersOptions = {},
): Promise<MergeIntegratorUsersResult> {
  const winner = assertNumericUserId(winnerId, 'winnerId');
  const loser = assertNumericUserId(loserId, 'loserId');
  if (winner === loser) {
    throw new MergeIntegratorUsersError('SAME_USER', 'winnerId and loserId must differ');
  }

  return db.tx(async (tx) => {
    await tx.query(
      `SELECT id FROM users WHERE id IN ($1::bigint, $2::bigint) ORDER BY id ASC FOR UPDATE`,
      [winner, loser],
    );

    const usersRes = await tx.query<UserRow>(
      `SELECT id::text AS id, merged_into_user_id::text AS merged_into_user_id
       FROM users WHERE id IN ($1::bigint, $2::bigint)`,
      [winner, loser],
    );
    if (usersRes.rows.length !== 2) {
      throw new MergeIntegratorUsersError('USER_NOT_FOUND', 'winner or loser user row not found');
    }
    const byId = new Map(usersRes.rows.map((r) => [r.id, r]));
    const wRow = byId.get(winner);
    const lRow = byId.get(loser);
    if (!wRow || !lRow) {
      throw new MergeIntegratorUsersError('USER_NOT_FOUND', 'winner or loser user row not found');
    }
    if (wRow.merged_into_user_id != null && wRow.merged_into_user_id !== '') {
      throw new MergeIntegratorUsersError('ALREADY_MERGED_ALIAS', 'winner is an alias (merged_into_user_id is set)');
    }

    const loserPointsTo = lRow.merged_into_user_id?.trim() ?? '';
    if (loserPointsTo !== '') {
      if (loserPointsTo === winner) {
        logger.info({ winnerId: winner, loserId: loser }, 'mergeIntegratorUsers: already merged (idempotent no-op)');
        return {
          winnerId: winner,
          loserId: loser,
          alreadyMerged: true,
          duplicateIdentitiesMerged: 0,
          identitiesReassigned: 0,
          contactsDeletedDuplicate: 0,
          contactsReassigned: 0,
          reminderRulesDeletedDuplicate: 0,
          reminderRulesReassigned: 0,
          contentAccessGrantsReassigned: 0,
          userSubscriptionsDeletedDuplicate: 0,
          userSubscriptionsReassigned: 0,
          mailingLogsDeletedDuplicate: 0,
          mailingLogsReassigned: 0,
          projectionOutboxPayloadRewrites: 0,
          projectionOutboxIdempotencyRewrites: 0,
          projectionOutboxDedupedCancelled: 0,
        };
      }
      throw new MergeIntegratorUsersError(
        'ALREADY_MERGED_ALIAS',
        'loser is already an alias merged into a different user',
      );
    }

    if (options.dryRun) {
      logger.info({ winnerId: winner, loserId: loser }, 'mergeIntegratorUsers: dry-run (validation + row locks only)');
      return {
        winnerId: winner,
        loserId: loser,
        dryRun: true,
        duplicateIdentitiesMerged: 0,
        identitiesReassigned: 0,
        contactsDeletedDuplicate: 0,
        contactsReassigned: 0,
        reminderRulesDeletedDuplicate: 0,
        reminderRulesReassigned: 0,
        contentAccessGrantsReassigned: 0,
        userSubscriptionsDeletedDuplicate: 0,
        userSubscriptionsReassigned: 0,
        mailingLogsDeletedDuplicate: 0,
        mailingLogsReassigned: 0,
        projectionOutboxPayloadRewrites: 0,
        projectionOutboxIdempotencyRewrites: 0,
        projectionOutboxDedupedCancelled: 0,
      };
    }

    const pairsRes = await tx.query<{ loser_identity_id: string; winner_identity_id: string }>(
      `SELECT li.id::text AS loser_identity_id, wi.id::text AS winner_identity_id
       FROM identities li
       JOIN identities wi
         ON wi.user_id = $1::bigint
        AND li.user_id = $2::bigint
        AND wi.resource = li.resource
        AND wi.external_id = li.external_id`,
      [winner, loser],
    );

    for (const p of pairsRes.rows) {
      const wState = await tx.query(`SELECT 1 FROM telegram_state WHERE identity_id = $1::bigint LIMIT 1`, [
        p.winner_identity_id,
      ]);
      const lState = await tx.query(`SELECT 1 FROM telegram_state WHERE identity_id = $1::bigint LIMIT 1`, [
        p.loser_identity_id,
      ]);
      if (wState.rows.length > 0 && lState.rows.length > 0) {
        await tx.query(`DELETE FROM telegram_state WHERE identity_id = $1::bigint`, [p.loser_identity_id]);
      } else if (lState.rows.length > 0) {
        await tx.query(`UPDATE telegram_state SET identity_id = $1::bigint WHERE identity_id = $2::bigint`, [
          p.winner_identity_id,
          p.loser_identity_id,
        ]);
      }

      await tx.query(
        `DELETE FROM message_drafts d
         USING message_drafts w
         WHERE d.identity_id = $1::bigint
           AND w.identity_id = $2::bigint
           AND d.source = w.source`,
        [p.loser_identity_id, p.winner_identity_id],
      );
      await tx.query(`UPDATE message_drafts SET identity_id = $1::bigint WHERE identity_id = $2::bigint`, [
        p.winner_identity_id,
        p.loser_identity_id,
      ]);

      await tx.query(
        `DELETE FROM conversations c
         USING conversations w
         WHERE c.user_identity_id = $1::bigint
           AND w.user_identity_id = $2::bigint
           AND c.source = w.source
           AND w.closed_at IS NULL
           AND w.status <> 'closed'
           AND c.closed_at IS NULL
           AND c.status <> 'closed'`,
        [p.loser_identity_id, p.winner_identity_id],
      );
      await tx.query(
        `UPDATE conversations SET user_identity_id = $1::bigint WHERE user_identity_id = $2::bigint`,
        [p.winner_identity_id, p.loser_identity_id],
      );
      await tx.query(
        `UPDATE user_questions SET user_identity_id = $1::bigint WHERE user_identity_id = $2::bigint`,
        [p.winner_identity_id, p.loser_identity_id],
      );

      await tx.query(`DELETE FROM identities WHERE id = $1::bigint`, [p.loser_identity_id]);
    }

    const duplicateIdentitiesMerged = pairsRes.rows.length;

    const idRe = await tx.query(
      `UPDATE identities SET user_id = $1::bigint WHERE user_id = $2::bigint`,
      [winner, loser],
    );
    const identitiesReassigned = idRe.rowCount ?? 0;

    const cd = await tx.query(
      `DELETE FROM contacts c
       USING contacts w
       WHERE c.user_id = $1::bigint
         AND w.user_id = $2::bigint
         AND c.type = w.type
         AND c.value_normalized = w.value_normalized`,
      [loser, winner],
    );
    const contactsDeletedDuplicate = cd.rowCount ?? 0;

    const cr = await tx.query(`UPDATE contacts SET user_id = $1::bigint WHERE user_id = $2::bigint`, [winner, loser]);
    const contactsReassigned = cr.rowCount ?? 0;

    const rrd = await tx.query(
      `DELETE FROM user_reminder_rules r
       USING user_reminder_rules w
       WHERE r.user_id = $1::bigint
         AND w.user_id = $2::bigint
         AND r.category = w.category`,
      [loser, winner],
    );
    const reminderRulesDeletedDuplicate = rrd.rowCount ?? 0;

    const rr = await tx.query(
      `UPDATE user_reminder_rules SET user_id = $1::bigint WHERE user_id = $2::bigint`,
      [winner, loser],
    );
    const reminderRulesReassigned = rr.rowCount ?? 0;

    const cag = await tx.query(
      `UPDATE content_access_grants SET user_id = $1::bigint WHERE user_id = $2::bigint`,
      [winner, loser],
    );
    const contentAccessGrantsReassigned = cag.rowCount ?? 0;

    const usd = await tx.query(
      `DELETE FROM user_subscriptions us
       USING user_subscriptions w
       WHERE us.user_id = $1::bigint
         AND w.user_id = $2::bigint
         AND us.subscription_id = w.subscription_id`,
      [loser, winner],
    );
    const userSubscriptionsDeletedDuplicate = usd.rowCount ?? 0;

    const usr = await tx.query(
      `UPDATE user_subscriptions SET user_id = $1::bigint WHERE user_id = $2::bigint`,
      [winner, loser],
    );
    const userSubscriptionsReassigned = usr.rowCount ?? 0;

    const mld = await tx.query(
      `DELETE FROM mailing_logs ml
       USING mailing_logs w
       WHERE ml.user_id = $1::bigint
         AND w.user_id = $2::bigint
         AND ml.mailing_id = w.mailing_id`,
      [loser, winner],
    );
    const mailingLogsDeletedDuplicate = mld.rowCount ?? 0;

    const mlr = await tx.query(`UPDATE mailing_logs SET user_id = $1::bigint WHERE user_id = $2::bigint`, [
      winner,
      loser,
    ]);
    const mailingLogsReassigned = mlr.rowCount ?? 0;

    const ob = await realignProjectionOutboxInTx(tx, loser, winner);

    await tx.query(`UPDATE users SET merged_into_user_id = $1::bigint, updated_at = now() WHERE id = $2::bigint`, [
      winner,
      loser,
    ]);

    const result: MergeIntegratorUsersResult = {
      winnerId: winner,
      loserId: loser,
      duplicateIdentitiesMerged,
      identitiesReassigned,
      contactsDeletedDuplicate,
      contactsReassigned,
      reminderRulesDeletedDuplicate,
      reminderRulesReassigned,
      contentAccessGrantsReassigned,
      userSubscriptionsDeletedDuplicate,
      userSubscriptionsReassigned,
      mailingLogsDeletedDuplicate,
      mailingLogsReassigned,
      projectionOutboxPayloadRewrites: ob.payloadRewrites,
      projectionOutboxIdempotencyRewrites: ob.keyRewrites,
      projectionOutboxDedupedCancelled: ob.deduped,
    };

    logger.info(
      {
        ...result,
      },
      'mergeIntegratorUsers: completed',
    );

    return result;
  });
}
