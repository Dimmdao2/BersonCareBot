/**
 * A3 — real `mergeCandidateIds` hook for the D1 direct-public writers, wired to
 * `mergePlatformUsersInTransaction` from `@bersoncare/platform-merge` (the SAME package the integrator
 * already uses for `user.phone.link` — see `apps/integrator/src/infra/db/repos/messengerPhonePublicBind.ts`).
 *
 * Mirrors `apps/webapp/src/infra/repos/pgUserProjection.ts`'s `mergeCandidates`: sort candidate ids,
 * repeatedly merge the first pair (`pickMergeTargetId` after `enrichPickMergeCandidatesWithBookingCounts`)
 * via `mergePlatformUsersInTransaction(..., reason: "projection")` until one canonical id remains. Any
 * merge the underlying function rejects as unsafe throws `MergeConflictError` / `MergeDependentConflictError`
 * (from `@bersoncare/platform-merge`) — this function does NOT catch those; callers (writePort.ts) decide
 * how to handle the ambiguity, matching how the webapp's `events.ts` lets the same errors bubble up to
 * `acceptAfterMergeConflict` (log + swallow, no write) instead of silently picking a candidate.
 */
import { sql } from 'drizzle-orm';
import {
  enrichPickMergeCandidatesWithBookingCounts,
  mergePlatformUsersInTransaction,
  MergeConflictError,
  MergeDependentConflictError,
  pickMergeTargetId,
  type PickMergeTargetCandidate,
  type PlatformMergeDbClient,
} from '@bersoncare/platform-merge';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { DirectPublicWriteError } from './writeIdentityAndPreferencesDirect.js';

async function loadCandidateForMerge(
  txDb: DbPort,
  id: string,
): Promise<PickMergeTargetCandidate | null> {
  const r = await runIntegratorSql<{
    id: string;
    phone_normalized: string | null;
    integrator_user_id: string | null;
    created_at: Date | string;
  }>(
    txDb,
    sql`SELECT id::text AS id, phone_normalized, integrator_user_id::text AS integrator_user_id, created_at
     FROM public.platform_users
     WHERE id = ${id}::uuid AND merged_into_id IS NULL`,
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    phone_normalized: row.phone_normalized,
    integrator_user_id: row.integrator_user_id,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/** Real merge-candidate collapse for D1 direct writes — pass as `deps.mergeCandidateIds`. */
export async function mergeCandidateIdsViaPlatformMerge(
  txDb: DbPort,
  candidateIds: string[],
): Promise<string> {
  const uniq = [
    ...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (uniq.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');

  let ids = [...uniq].sort();
  while (ids.length > 1) {
    const id0 = ids[0]!;
    const id1 = ids[1]!;
    const a = await loadCandidateForMerge(txDb, id0);
    const b = await loadCandidateForMerge(txDb, id1);
    if (!a || !b) {
      throw new DirectPublicWriteError('ambiguous_platform_user_candidates', { candidateIds: ids });
    }
    const [ea, eb] = await enrichPickMergeCandidatesWithBookingCounts(
      txDb as PlatformMergeDbClient,
      a,
      b,
    );
    const { target, duplicate } = pickMergeTargetId(ea, eb);
    await mergePlatformUsersInTransaction(
      txDb as PlatformMergeDbClient,
      target,
      duplicate,
      'projection',
    );
    ids = ids.filter((x) => x !== duplicate);
  }
  return ids[0]!;
}

/**
 * True when `err` is an identity-merge ambiguity that the webapp's `preferences.updated` / `user.upserted`
 * consumer would swallow (log-and-defer, no write) rather than a genuine DB/programming failure.
 * Covers both the real merge machinery's errors and the D1 scaffold's own pre-merge ambiguity codes
 * (e.g. two DISTINCT rows both singly matched by `integrator_user_id`, a data-integrity case the scaffold
 * rejects before `mergeCandidateIds` is even called).
 */
export function isIdentityMergeAmbiguityError(err: unknown): boolean {
  if (err instanceof MergeConflictError || err instanceof MergeDependentConflictError) return true;
  if (err instanceof DirectPublicWriteError) {
    return (
      err.code === 'ambiguous_platform_user_candidates' || err.code === 'no_platform_user_candidate'
    );
  }
  return false;
}
