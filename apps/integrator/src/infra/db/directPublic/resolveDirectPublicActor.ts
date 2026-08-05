/**
 * Shared canonical actor and organization resolution for bounded direct-public writers.
 *
 * Support and reminder writers share the same candidate merge and exact-active-organization
 * semantics here.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { and, eq } from 'drizzle-orm';
import { resolveCanonicalIntegratorUserId } from '../repos/canonicalUserId.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { orgEnrollments } from '../schema/integratorPublicProduct.js';
import {
  collectPlatformUserCandidates,
  DirectPublicWriteError,
} from './writeIdentityAndPreferencesDirect.js';

export type DirectPublicActorInput = {
  /** Raw integrator-space id (`identities.user_id` via `ChannelUserLinkRow.userId` / `user.byIdentity`). */
  integratorUserId: string;
  channelCode: string;
  externalId: string;
};

export type DirectPublicActorResolveDeps = {
  /** Same contract/default as D1's `WriteIdentityAndPreferencesDeps.mergeCandidateIds`. */
  mergeCandidateIds?: (txDb: DbPort, candidateIds: string[]) => Promise<string>;
};

export type DirectPublicActorResolutionFailureCode =
  | 'no_active_org_enrollment'
  | 'ambiguous_org_enrollment';

export class DirectPublicActorResolutionError extends Error {
  readonly code: DirectPublicActorResolutionFailureCode;

  readonly details: Record<string, unknown>;

  constructor(code: DirectPublicActorResolutionFailureCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'DirectPublicActorResolutionError';
    this.code = code;
    this.details = details;
  }
}

async function defaultMergeCandidateIds(_txDb: DbPort, candidateIds: string[]): Promise<string> {
  const uniq = [
    ...new Set(candidateIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (uniq.length === 1) return uniq[0]!;
  if (uniq.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');
  throw new DirectPublicWriteError('ambiguous_platform_user_candidates', { candidateIds: uniq });
}

/**
 * Resolves the canonical `public.platform_users.id` for a channel actor without creating a user.
 */
export async function resolvePlatformUserIdForActor(
  txDb: DbPort,
  actor: DirectPublicActorInput,
  deps: DirectPublicActorResolveDeps = {},
): Promise<string> {
  const mergeCandidateIds = deps.mergeCandidateIds ?? defaultMergeCandidateIds;
  const canonicalIntegratorUserId = await resolveCanonicalIntegratorUserId(
    txDb,
    actor.integratorUserId,
  );
  const candidates = await collectPlatformUserCandidates(txDb, {
    integratorUserId: canonicalIntegratorUserId,
    phoneNormalized: null,
    channelCode: actor.channelCode,
    externalId: actor.externalId,
  });
  if (candidates.length === 0) throw new DirectPublicWriteError('no_platform_user_candidate');
  if (candidates.length === 1) return candidates[0]!;
  return mergeCandidateIds(txDb, candidates);
}

/**
 * Requires exactly one active `org_enrollments` row and never falls back to a default organization.
 */
export async function resolveExactActiveOrganizationId(
  txDb: DbPort,
  platformUserId: string,
): Promise<string> {
  const rows = await getIntegratorDrizzleSession(txDb)
    .selectDistinct({ organizationId: orgEnrollments.organizationId })
    .from(orgEnrollments)
    .where(
      and(eq(orgEnrollments.platformUserId, platformUserId), eq(orgEnrollments.status, 'active')),
    );
  const ids = rows
    .map((row) => row.organizationId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    throw new DirectPublicActorResolutionError('no_active_org_enrollment', { platformUserId });
  }
  if (ids.length > 1) {
    throw new DirectPublicActorResolutionError('ambiguous_org_enrollment', {
      platformUserId,
      organizationIds: ids,
    });
  }
  return ids[0]!;
}

export function isDirectPublicActorResolutionFailClosedError(err: unknown): boolean {
  if (err instanceof DirectPublicActorResolutionError) return true;
  if (err instanceof DirectPublicWriteError) {
    return (
      err.code === 'no_platform_user_candidate' ||
      err.code === 'ambiguous_platform_user_candidates' ||
      err.code === 'channel_anchor_owned_by_other_user'
    );
  }
  return false;
}
