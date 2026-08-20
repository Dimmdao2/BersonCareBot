/**
 * A3 — real `mergeCandidateIds` hook for the D1 direct-public writers, wired to
 * Before D26 this adapter invoked the shared merge cascade. The integrator now only reports an
 * ambiguous identity pair; the webapp's support surface owns every merge decision.
 *
 * Multiple candidates are deliberately surfaced as ambiguity; callers preserve the existing
 * no-write conflict path instead of silently picking or merging an account.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { DirectPublicWriteError } from './writeIdentityAndPreferencesDirect.js';

/** Integrator ambiguity hook for D1 direct writes — never performs an account merge. */
export async function mergeCandidateIdsViaPlatformMerge(
  _txDb: DbPort,
  candidateIds: string[],
): Promise<string> {
  const uniq = [
    ...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (uniq.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');

  if (uniq.length === 1) return uniq[0]!;
  // D26: the integrator delivers identity events; it no longer decides or executes account merge.
  throw new DirectPublicWriteError('ambiguous_platform_user_candidates', { candidateIds: uniq });
}

/**
 * True when `err` is an identity-merge ambiguity that the webapp's `preferences.updated` / `user.upserted`
 * consumer would swallow (log-and-defer, no write) rather than a genuine DB/programming failure.
 * Covers both the real merge machinery's errors and the D1 scaffold's own pre-merge ambiguity codes
 * (e.g. two DISTINCT rows both singly matched by `integrator_user_id`, a data-integrity case the scaffold
 * rejects before `mergeCandidateIds` is even called).
 */
export function isIdentityMergeAmbiguityError(err: unknown): boolean {
  if (err instanceof DirectPublicWriteError) {
    return (
      err.code === 'ambiguous_platform_user_candidates' ||
      err.code === 'no_platform_user_candidate' ||
      err.code === 'channel_anchor_owned_by_other_user'
    );
  }
  return false;
}
