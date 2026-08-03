/**
 * A3 — real `mergeCandidateIds` hook for the D1 direct-public writers, wired to
 * `collapseIdentityProjectionCandidates` from `@bersoncare/platform-merge` (D15b/2: the SAME cascade
 * the webapp's `pgUserProjection.mergeCandidates` uses — one shared implementation, not two copies
 * of the same sort-and-merge loop).
 *
 * Any merge the underlying function rejects as unsafe throws `MergeConflictError` /
 * `MergeDependentConflictError` (from `@bersoncare/platform-merge`) — this function does NOT catch
 * those; callers (writePort.ts) decide how to handle the ambiguity, matching how the webapp's
 * `events.ts` lets the same errors bubble up to `acceptAfterMergeConflict` (log + swallow, no write)
 * instead of silently picking a candidate.
 */
import {
  collapseIdentityProjectionCandidates,
  MergeConflictError,
  MergeDependentConflictError,
  type PlatformMergeDbClient,
} from '@bersoncare/platform-merge';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { DirectPublicWriteError } from './writeIdentityAndPreferencesDirect.js';

/** Real merge-candidate collapse for D1 direct writes — pass as `deps.mergeCandidateIds`. */
export async function mergeCandidateIdsViaPlatformMerge(
  txDb: DbPort,
  candidateIds: string[],
): Promise<string> {
  const uniq = [
    ...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (uniq.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');

  try {
    return await collapseIdentityProjectionCandidates(
      txDb as PlatformMergeDbClient,
      uniq,
      'projection',
    );
  } catch (err) {
    // Pre-merge "row missing" ambiguity (two distinct rows, one vanished between candidate
    // collection and merge) — preserve the D1 scaffold's own error code for this specific case;
    // real merge-policy rejections (conflicting phone/bookings/etc.) pass through unchanged.
    if (
      err instanceof MergeConflictError &&
      err.message === 'collapseIdentityProjectionCandidates: row missing'
    ) {
      throw new DirectPublicWriteError('ambiguous_platform_user_candidates', {
        candidateIds: err.candidateIds,
      });
    }
    throw err;
  }
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
