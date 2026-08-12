import type { DbPort } from '../../../kernel/contracts/index.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../observability/logger.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  deepReplaceIntegratorUserIdInValue,
  recomputeProjectionIdempotencyKeyAfterMerge,
} from './projectionOutboxMergePolicy.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';

const BIGINT_STRING = /^\d+$/;

/**
 * T0.4: re-parenting a SCOPED row to `integratorUserId` (the merge winner) must re-derive
 * `organization_id` from the NEW owner — never leave the loser's stale org on the moved row
 * (same posture as `mergeIntegratorConversationToPlatform.ts`'s `target.organization_id` copy).
 * Prefers the current organization principal (operator-initiated merge under a tenant context),
 * then falls back to the winner's single active organization.
 *
 * **`existingOrganizationIdColumn`** (defect fix, post-audit-71b05b493): if neither the principal
 * nor the winner's single-active-org subquery resolves (winner has 0 or >1 active orgs, or the
 * merge runs without a principal), this expression is the FINAL COALESCE fallback — the row's OWN
 * current `organization_id` (e.g. `'contacts.organization_id'`; must reference the table being
 * UPDATEd). Postgres resolves a bare table reference in an UPDATE's SET list to the pre-update row
 * value, so this never reads the just-written value. This guarantees the SET clause can never
 * regress a valid `organization_id` down to NULL — the worst case is a no-op (org unchanged), never
 * a stale-write like the old two-branch COALESCE could produce.
 */
function organizationIdForIntegratorUserSql(
  integratorUserId: string | number,
  existingOrganizationIdColumn: string,
) {
  const currentOrganizationId = getCurrentOrganizationPrincipalId() ?? null;
  return sql`COALESCE(
    ${currentOrganizationId}::uuid,
    (
      SELECT (array_agg(DISTINCT active_user_orgs.organization_id))[1]
      FROM public.platform_users platform_user
      INNER JOIN (
        SELECT platform_user_id, organization_id
        FROM public.org_enrollments
        WHERE status = 'active'
        UNION
        SELECT platform_user_id, organization_id
        FROM public.be_organization_members
        WHERE status = 'active'
      ) active_user_orgs
        ON active_user_orgs.platform_user_id = platform_user.id
      WHERE platform_user.integrator_user_id = ${String(integratorUserId)}::bigint
      HAVING count(DISTINCT active_user_orgs.organization_id) = 1
    ),
    ${sql.raw(existingOrganizationIdColumn)}
  )`;
}

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
  projectionOutboxPayloadRewrites: number;
  projectionOutboxIdempotencyRewrites: number;
  projectionOutboxDedupedCancelled: number;
};

export class MergeIntegratorUsersError extends Error {
  constructor(
    readonly code: 'INVALID_USER_ID' | 'SAME_USER' | 'USER_NOT_FOUND' | 'ALREADY_MERGED_ALIAS',
    message: string,
    readonly details?: { missingIntegratorUserIds?: string[] },
  ) {
    super(message);
    this.name = 'MergeIntegratorUsersError';
  }
}

function assertNumericUserId(id: string, label: string): string {
  const t = id.trim();
  if (!BIGINT_STRING.test(t)) {
    throw new MergeIntegratorUsersError(
      'INVALID_USER_ID',
      `${label} must be a numeric integrator users.id`,
    );
  }
  return t;
}

/** Canonical decimal string for bigint user ids (aligns PG `id::text` with request strings). */
function integratorUserIdNumericKey(id: string): string {
  return String(BigInt(id.trim()));
}

type UserRow = { id: string; merged_into_user_id: string | null };

async function realignProjectionOutboxInTx(
  db: DbPort,
  loser: string,
  winner: string,
): Promise<{ payloadRewrites: number; keyRewrites: number; deduped: number }> {
  /** Only `pending`: avoids racing the projection worker while a row is `processing`. */
  const res = await runIntegratorSql<{
    id: string;
    event_type: string;
    idempotency_key: string;
    payload: Record<string, unknown>;
  }>(
    db,
    sql`
    SELECT id::text AS id, event_type, idempotency_key, payload
     FROM projection_outbox
     WHERE status = 'pending'
       AND (
         (payload->>'integratorUserId') = ${loser}
         OR (payload #>> '{payloadJson,integratorUserId}') = ${loser}
         OR (payload #>> '{payloadJson,integrator_user_id}') = ${loser}
         OR (payload::text LIKE '%"integratorUserId":"' || ${loser} || '"%')
         OR (payload::text LIKE '%"integrator_user_id":"' || ${loser} || '"%')
       )
     ORDER BY id::bigint ASC
  `,
  );

  let payloadRewrites = 0;
  let keyRewrites = 0;
  let deduped = 0;

  for (const row of res.rows) {
    const rawPayload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const newPayload = deepReplaceIntegratorUserIdInValue(rawPayload, loser, winner) as Record<
      string,
      unknown
    >;
    const newKey = recomputeProjectionIdempotencyKeyAfterMerge(
      row.event_type,
      newPayload,
      Number(row.id),
    );
    const payloadJson = JSON.stringify(newPayload);

    if (newKey === row.idempotency_key) {
      await runIntegratorSql(
        db,
        sql`UPDATE projection_outbox SET payload = ${payloadJson}::jsonb, updated_at = now() WHERE id = ${row.id}::bigint`,
      );
      payloadRewrites += 1;
      continue;
    }

    const exists = await runIntegratorSql<{ id: string }>(
      db,
      sql`SELECT id::text AS id FROM projection_outbox WHERE idempotency_key = ${newKey} AND id <> ${row.id}::bigint LIMIT 1`,
    );

    if (exists.rows.length > 0) {
      await runIntegratorSql(
        db,
        sql`
        UPDATE projection_outbox
         SET status = 'cancelled',
             last_error = ${'merge:user deduped (winner idempotency_key already present)'},
             updated_at = now()
         WHERE id = ${row.id}::bigint
      `,
      );
      deduped += 1;
      continue;
    }

    await runIntegratorSql(
      db,
      sql`
      UPDATE projection_outbox
       SET idempotency_key = ${newKey},
           payload = ${payloadJson}::jsonb,
           updated_at = now()
       WHERE id = ${row.id}::bigint
    `,
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
    await runIntegratorSql(
      tx,
      sql`SELECT id FROM users WHERE id IN (${winner}::bigint, ${loser}::bigint) ORDER BY id ASC FOR UPDATE`,
    );

    const usersRes = await runIntegratorSql<UserRow>(
      tx,
      sql`SELECT id::text AS id, merged_into_user_id::text AS merged_into_user_id
       FROM users WHERE id IN (${winner}::bigint, ${loser}::bigint)`,
    );
    const foundKeys = new Set(usersRes.rows.map((r) => integratorUserIdNumericKey(r.id)));
    const missingIntegratorUserIds = [winner, loser].filter(
      (id) => !foundKeys.has(integratorUserIdNumericKey(id)),
    );
    if (usersRes.rows.length !== 2) {
      throw new MergeIntegratorUsersError('USER_NOT_FOUND', 'winner or loser user row not found', {
        missingIntegratorUserIds,
      });
    }
    const byId = new Map(usersRes.rows.map((r) => [integratorUserIdNumericKey(r.id), r]));
    const wRow = byId.get(integratorUserIdNumericKey(winner));
    const lRow = byId.get(integratorUserIdNumericKey(loser));
    if (!wRow || !lRow) {
      throw new MergeIntegratorUsersError('USER_NOT_FOUND', 'winner or loser user row not found', {
        missingIntegratorUserIds,
      });
    }
    if (wRow.merged_into_user_id != null && wRow.merged_into_user_id !== '') {
      throw new MergeIntegratorUsersError(
        'ALREADY_MERGED_ALIAS',
        'winner is an alias (merged_into_user_id is set)',
      );
    }

    const loserPointsTo = lRow.merged_into_user_id?.trim() ?? '';
    if (loserPointsTo !== '') {
      if (loserPointsTo === winner) {
        logger.info(
          { winnerId: winner, loserId: loser },
          'mergeIntegratorUsers: already merged (idempotent no-op)',
        );
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
      logger.info(
        { winnerId: winner, loserId: loser },
        'mergeIntegratorUsers: dry-run (validation + row locks only)',
      );
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
        projectionOutboxPayloadRewrites: 0,
        projectionOutboxIdempotencyRewrites: 0,
        projectionOutboxDedupedCancelled: 0,
      };
    }

    const pairsRes = await runIntegratorSql<{
      loser_identity_id: string;
      winner_identity_id: string;
    }>(
      tx,
      sql`
      SELECT li.id::text AS loser_identity_id, wi.id::text AS winner_identity_id
       FROM identities li
       JOIN identities wi
         ON wi.user_id = ${winner}::bigint
        AND li.user_id = ${loser}::bigint
        AND wi.resource = li.resource
        AND wi.external_id = li.external_id
    `,
    );

    for (const p of pairsRes.rows) {
      await runIntegratorSql(
        tx,
        sql`
        DELETE FROM message_drafts d
         USING message_drafts w
         WHERE d.identity_id = ${p.loser_identity_id}::bigint
           AND w.identity_id = ${p.winner_identity_id}::bigint
           AND d.source = w.source
      `,
      );
      await runIntegratorSql(
        tx,
        sql`UPDATE message_drafts SET identity_id = ${p.winner_identity_id}::bigint, organization_id = ${organizationIdForIntegratorUserSql(winner, 'message_drafts.organization_id')} WHERE identity_id = ${p.loser_identity_id}::bigint`,
      );

      await runIntegratorSql(
        tx,
        sql`
        DELETE FROM conversations c
         USING conversations w
         WHERE c.user_identity_id = ${p.loser_identity_id}::bigint
           AND w.user_identity_id = ${p.winner_identity_id}::bigint
           AND c.source = w.source
           AND w.closed_at IS NULL
           AND w.status <> 'closed'
           AND c.closed_at IS NULL
           AND c.status <> 'closed'
      `,
      );
      await runIntegratorSql(
        tx,
        sql`UPDATE conversations SET user_identity_id = ${p.winner_identity_id}::bigint, organization_id = ${organizationIdForIntegratorUserSql(winner, 'conversations.organization_id')} WHERE user_identity_id = ${p.loser_identity_id}::bigint`,
      );
      await runIntegratorSql(
        tx,
        sql`UPDATE user_questions SET user_identity_id = ${p.winner_identity_id}::bigint, organization_id = ${organizationIdForIntegratorUserSql(winner, 'user_questions.organization_id')} WHERE user_identity_id = ${p.loser_identity_id}::bigint`,
      );

      await runIntegratorSql(
        tx,
        sql`DELETE FROM identities WHERE id = ${p.loser_identity_id}::bigint`,
      );
    }

    const duplicateIdentitiesMerged = pairsRes.rows.length;

    const idRe = await runIntegratorSql(
      tx,
      sql`UPDATE identities SET user_id = ${winner}::bigint WHERE user_id = ${loser}::bigint`,
    );
    const identitiesReassigned = idRe.rowCount ?? 0;

    const cd = await runIntegratorSql(
      tx,
      sql`
      DELETE FROM contacts c
       USING contacts w
       WHERE c.user_id = ${loser}::bigint
         AND w.user_id = ${winner}::bigint
         AND c.type = w.type
         AND c.value_normalized = w.value_normalized
    `,
    );
    const contactsDeletedDuplicate = cd.rowCount ?? 0;

    const cr = await runIntegratorSql(
      tx,
      sql`UPDATE contacts SET user_id = ${winner}::bigint, organization_id = ${organizationIdForIntegratorUserSql(winner, 'contacts.organization_id')} WHERE user_id = ${loser}::bigint`,
    );
    const contactsReassigned = cr.rowCount ?? 0;

    const rr = await runIntegratorSql(
      tx,
      sql`UPDATE public.reminder_rules
          SET integrator_user_id = ${winner}::bigint,
              organization_id = ${organizationIdForIntegratorUserSql(winner, 'reminder_rules.organization_id')},
              updated_at = now()
          WHERE integrator_user_id = ${loser}::bigint`,
    );
    const reminderRulesReassigned = rr.rowCount ?? 0;

    const cag = await runIntegratorSql(
      tx,
      sql`UPDATE content_access_grants SET user_id = ${winner}::bigint, organization_id = ${organizationIdForIntegratorUserSql(winner, 'content_access_grants.organization_id')} WHERE user_id = ${loser}::bigint`,
    );
    const contentAccessGrantsReassigned = cag.rowCount ?? 0;

    const ob = await realignProjectionOutboxInTx(tx, loser, winner);

    await runIntegratorSql(
      tx,
      sql`UPDATE users SET merged_into_user_id = ${winner}::bigint, updated_at = now() WHERE id = ${loser}::bigint`,
    );

    const result: MergeIntegratorUsersResult = {
      winnerId: winner,
      loserId: loser,
      duplicateIdentitiesMerged,
      identitiesReassigned,
      contactsDeletedDuplicate,
      contactsReassigned,
      reminderRulesDeletedDuplicate: 0,
      reminderRulesReassigned,
      contentAccessGrantsReassigned,
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
