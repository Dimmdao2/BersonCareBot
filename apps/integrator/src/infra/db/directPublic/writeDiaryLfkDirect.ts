/**
 * Track D — D2: symptom diary + LFK direct-public writes (identity/preferences precedent: D1's
 * `writeIdentityAndPreferencesDirect.ts`, decision doc
 * `docs/_TODO/SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md`).
 *
 * ONE bounded integrator transaction per call writes directly to `public.*`:
 *   - `public.symptom_trackings` (createSymptomTrackingDirect)
 *   - `public.symptom_entries`   (addSymptomEntryDirect)
 *   - `public.lfk_complexes`     (createLfkComplexDirect)
 *   - `public.lfk_sessions`      (addLfkSessionDirect)
 *
 * This replaces the HTTP projection fanout (`diary.symptom.tracking.created` /
 * `diary.symptom.entry.created` / `diary.lfk.complex.created` / `diary.lfk.session.created` →
 * `webappEventsPort.emit()` → webapp `handleIntegratorEvent` → `deps.diaries.*`) with a direct
 * transactional write. SQL mirrors the current webapp consumers (`apps/webapp/src/infra/repos/
 * pgSymptomDiary.ts`, `apps/webapp/src/infra/repos/pgLfkDiary.ts`) for exact column/semantics parity,
 * with two REQUIRED departures explicitly mandated by WORK_ORDER §Track D (D2):
 *
 * 1. PLATFORM-USER RESOLUTION FIX. The retired HTTP event payload's `userId` was the *integrator's own*
 *    internal numeric id (`ChannelUserLinkRow.userId`, i.e. `identities.user_id` — see
 *    `apps/integrator/src/infra/db/repos/channelUsers.ts`), NOT `public.platform_users.id`. The webapp
 *    consumer's `resolveDiaryPlatformUserId` then queried `platform_users WHERE id = $1` treating that
 *    integrator-space id as if it were already a platform UUID — a live ID-space mismatch (the query
 *    either errors on the `::uuid` cast or, if pg leaves it untyped, matches nothing) that silently
 *    swallowed the write (fire-and-forget: none of the four call sites checked the emit/HTTP result).
 *    D2 resolves the ACTUAL canonical `platform_users.id` the same way D1 does — via
 *    `collectPlatformUserCandidates` (by `integrator_user_id` after `resolveCanonicalIntegratorUserId`,
 *    or by `user_channel_bindings`) — instead of perpetuating the bug.
 * 2. EXACT ORG RESOLUTION, NO DEFAULT FALLBACK (WORK_ORDER D2 requirement, explicit "without a
 *    default-org fallback"). `resolveExactActiveOrganizationId` requires exactly ONE active
 *    `org_enrollments` row for the resolved platform user; zero or multiple active enrollments fail
 *    closed (no write), mirroring `apps/webapp/src/modules/patient-organization/service.ts`'s
 *    `resolveActiveOrganizationForPatient` "only_active" / "organization_selection_required" branches
 *    (adapted: no remembered/verified-target inputs exist in this bot-triggered write path).
 *
 * OWNERSHIP VALIDATION (also a D2 WORK_ORDER requirement, and NOT present in the retired webapp
 * consumer — `addSymptomEntry`/`addLfkSession` there inserted unconditionally): `addSymptomEntryDirect`
 * / `addLfkSessionDirect` verify the target `trackingId`/`complexId` row's `platform_user_id` matches
 * the resolved canonical platform user before writing; a mismatch or missing row fails closed.
 *
 * CHOKEPOINT: injected `DbPort`; writes run on the tx-bound connection inside `db.tx(...)`. Raw SQL is
 * allowed here (src/infra/db repo).
 *
 * FAIL-CLOSED PHILOSOPHY: all failure branches (platform-user unresolved/ambiguous, org
 * unresolved/ambiguous, ownership mismatch) throw `DiaryLfkDirectWriteError` (or the D1
 * `DirectPublicWriteError`/merge-machinery errors for platform-user resolution, reusing D1's
 * classification). Callers (writePort.ts) catch the "expected" fail-closed codes and log+swallow
 * (no write, no crash) — mirroring D1's `user.upsert`/`notifications.update` handling and the current
 * byte-parity behavior of these call sites (none of the four retired HTTP emits were previously checked
 * for success either, so a swallowed fail-closed here is not a UX regression).
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import { resolveCanonicalIntegratorUserId } from '../repos/canonicalUserId.js';
import {
  collectPlatformUserCandidates,
  DirectPublicWriteError,
} from './writeIdentityAndPreferencesDirect.js';

export type DiaryLfkActorInput = {
  /** Raw integrator-space id (`identities.user_id` via `ChannelUserLinkRow.userId` / `user.byIdentity`). */
  integratorUserId: string;
  channelCode: string;
  externalId: string;
};

export type DiaryLfkWriteFailureCode =
  | 'no_active_org_enrollment'
  | 'ambiguous_org_enrollment'
  | 'patient_diaries_entitlement_required'
  | 'tracking_not_found_or_not_owned'
  | 'complex_not_found_or_not_owned';

export class DiaryLfkDirectWriteError extends Error {
  readonly code: DiaryLfkWriteFailureCode;

  readonly details: Record<string, unknown>;

  constructor(code: DiaryLfkWriteFailureCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'DiaryLfkDirectWriteError';
    this.code = code;
    this.details = details;
  }
}

export type DiaryLfkResolveDeps = {
  /** Same contract/default as D1's `WriteIdentityAndPreferencesDeps.mergeCandidateIds`. */
  mergeCandidateIds?: (txDb: DbPort, candidateIds: string[]) => Promise<string>;
};

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
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
 * Resolves the canonical `public.platform_users.id` for a channel actor (D1 candidate-resolution reuse
 * — see file header point 1). Throws `DirectPublicWriteError` (no_platform_user_candidate /
 * ambiguous_platform_user_candidates) or a real merge-machinery error on failure — never invents/creates
 * a platform user (unlike D1's `user.upsert`, D2 only ever attaches to an ALREADY-onboarded person; if
 * no candidate exists the diary/LFK write fails closed rather than bootstrapping identity here).
 */
export async function resolvePlatformUserIdForActor(
  txDb: DbPort,
  actor: DiaryLfkActorInput,
  deps: DiaryLfkResolveDeps = {},
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
 * Exactly one active `org_enrollments` row required — NO default-org fallback (WORK_ORDER D2, explicit).
 * Mirrors `resolveActiveOrganizationForPatient`'s "only_active" branch
 * (`apps/webapp/src/modules/patient-organization/service.ts`); this bot-triggered write path has no
 * remembered/verified-target org input, so ambiguity (2+ distinct active orgs) always fails closed here
 * (the webapp UI's "organization_selection_required" branch has no analog — there is no user prompt in
 * this transactional write path).
 */
export async function resolveExactActiveOrganizationId(
  txDb: DbPort,
  platformUserId: string,
): Promise<string> {
  const res = await txDb.query<{ organization_id: string }>(
    `SELECT DISTINCT organization_id::text AS organization_id
     FROM public.org_enrollments
     WHERE platform_user_id = $1::uuid AND status = 'active'`,
    [platformUserId],
  );
  const ids = res.rows
    .map((r) => r.organization_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    throw new DiaryLfkDirectWriteError('no_active_org_enrollment', { platformUserId });
  }
  if (ids.length > 1) {
    throw new DiaryLfkDirectWriteError('ambiguous_org_enrollment', {
      platformUserId,
      organizationIds: ids,
    });
  }
  return ids[0]!;
}

async function assertPatientDiariesMutationAllowed(
  txDb: DbPort,
  organizationId: string,
): Promise<void> {
  const result = await txDb.query<{ mutation_allowed: boolean }>(
    `SELECT mutation_allowed
     FROM app.resolve_organization_mechanic_access($1::uuid, $2::text)`,
    [organizationId, 'patient_diaries'],
  );
  const access = result.rows[0];
  if (access?.mutation_allowed !== true) {
    throw new DiaryLfkDirectWriteError('patient_diaries_entitlement_required', {
      organizationId,
    });
  }
}

export type CreateSymptomTrackingDirectInput = DiaryLfkActorInput & {
  symptomKey?: string | null;
  symptomTitle: string;
};

export type CreateSymptomTrackingDirectResult = {
  platformUserId: string;
  organizationId: string;
  trackingId: string;
};

/** D2 entrypoint replacing the `diary.symptom.tracking.created` HTTP projection. */
export async function createSymptomTrackingDirect(
  db: DbPort,
  input: CreateSymptomTrackingDirectInput,
  deps: DiaryLfkResolveDeps = {},
): Promise<CreateSymptomTrackingDirectResult> {
  const symptomTitle = input.symptomTitle.trim() || '—';
  const symptomKey = trimmedOrNull(input.symptomKey ?? null);

  return db.tx(async (txDb) => {
    const platformUserId = await resolvePlatformUserIdForActor(txDb, input, deps);
    const organizationId = await resolveExactActiveOrganizationId(txDb, platformUserId);
    await assertPatientDiariesMutationAllowed(txDb, organizationId);

    const res = await txDb.query<{ id: string }>(
      `INSERT INTO public.symptom_trackings (
         user_id, platform_user_id, organization_id, symptom_key, symptom_title, is_active, updated_at
       )
       VALUES ($1::text, $1::uuid, $2::uuid, $3, $4, true, now())
       RETURNING id::text AS id`,
      [platformUserId, organizationId, symptomKey, symptomTitle],
    );
    const trackingId = res.rows[0]?.id;
    if (!trackingId) throw new Error('symptom_trackings insert returned no id');
    return { platformUserId, organizationId, trackingId };
  });
}

export type AddSymptomEntryDirectInput = DiaryLfkActorInput & {
  trackingId: string;
  value0_10: number;
  entryType: 'instant' | 'daily';
  recordedAt: string;
  notes?: string | null;
};

export type AddSymptomEntryDirectResult = {
  platformUserId: string;
  organizationId: string;
  entryId: string;
};

/** D2 entrypoint replacing the `diary.symptom.entry.created` HTTP projection. */
export async function addSymptomEntryDirect(
  db: DbPort,
  input: AddSymptomEntryDirectInput,
  deps: DiaryLfkResolveDeps = {},
): Promise<AddSymptomEntryDirectResult> {
  const notes = trimmedOrNull(input.notes ?? null);

  return db.tx(async (txDb) => {
    const platformUserId = await resolvePlatformUserIdForActor(txDb, input, deps);

    const trackingRes = await txDb.query<{ organization_id: string | null }>(
      `SELECT organization_id::text AS organization_id
       FROM public.symptom_trackings
       WHERE id = $1::uuid AND platform_user_id = $2::uuid AND deleted_at IS NULL`,
      [input.trackingId, platformUserId],
    );
    const trackingRow = trackingRes.rows[0];
    if (!trackingRow) {
      throw new DiaryLfkDirectWriteError('tracking_not_found_or_not_owned', {
        trackingId: input.trackingId,
        platformUserId,
      });
    }
    const organizationId =
      trackingRow.organization_id ?? (await resolveExactActiveOrganizationId(txDb, platformUserId));
    await assertPatientDiariesMutationAllowed(txDb, organizationId);

    const res = await txDb.query<{ id: string }>(
      `INSERT INTO public.symptom_entries (
         user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, organization_id
       )
       VALUES ($1::text, $1::uuid, $2::uuid, $3, $4, $5::timestamptz, 'bot', $6, $7::uuid)
       RETURNING id::text AS id`,
      [
        platformUserId,
        input.trackingId,
        input.value0_10,
        input.entryType,
        input.recordedAt,
        notes,
        organizationId,
      ],
    );
    const entryId = res.rows[0]?.id;
    if (!entryId) throw new Error('symptom_entries insert returned no id');
    return { platformUserId, organizationId, entryId };
  });
}

export type CreateLfkComplexDirectInput = DiaryLfkActorInput & {
  title: string;
  origin?: 'manual' | 'assigned_by_specialist';
};

export type CreateLfkComplexDirectResult = {
  platformUserId: string;
  organizationId: string;
  complexId: string;
};

/** D2 entrypoint replacing the `diary.lfk.complex.created` HTTP projection. */
export async function createLfkComplexDirect(
  db: DbPort,
  input: CreateLfkComplexDirectInput,
  deps: DiaryLfkResolveDeps = {},
): Promise<CreateLfkComplexDirectResult> {
  const title = input.title.trim() || '—';
  const origin = input.origin === 'assigned_by_specialist' ? 'assigned_by_specialist' : 'manual';

  return db.tx(async (txDb) => {
    const platformUserId = await resolvePlatformUserIdForActor(txDb, input, deps);
    const organizationId = await resolveExactActiveOrganizationId(txDb, platformUserId);
    await assertPatientDiariesMutationAllowed(txDb, organizationId);

    const res = await txDb.query<{ id: string }>(
      `INSERT INTO public.lfk_complexes (
         user_id, platform_user_id, organization_id, title, origin, is_active, updated_at
       )
       VALUES ($1::text, $1::uuid, $2::uuid, $3, $4, true, now())
       RETURNING id::text AS id`,
      [platformUserId, organizationId, title, origin],
    );
    const complexId = res.rows[0]?.id;
    if (!complexId) throw new Error('lfk_complexes insert returned no id');
    return { platformUserId, organizationId, complexId };
  });
}

export type AddLfkSessionDirectInput = DiaryLfkActorInput & {
  complexId: string;
  completedAt: string;
};

export type AddLfkSessionDirectResult = {
  platformUserId: string;
  organizationId: string;
  sessionId: string;
};

/** D2 entrypoint replacing the `diary.lfk.session.created` HTTP projection. */
export async function addLfkSessionDirect(
  db: DbPort,
  input: AddLfkSessionDirectInput,
  deps: DiaryLfkResolveDeps = {},
): Promise<AddLfkSessionDirectResult> {
  return db.tx(async (txDb) => {
    const platformUserId = await resolvePlatformUserIdForActor(txDb, input, deps);

    const complexRes = await txDb.query<{ organization_id: string | null }>(
      `SELECT organization_id::text AS organization_id
       FROM public.lfk_complexes
       WHERE id = $1::uuid AND platform_user_id = $2::uuid`,
      [input.complexId, platformUserId],
    );
    const complexRow = complexRes.rows[0];
    if (!complexRow) {
      throw new DiaryLfkDirectWriteError('complex_not_found_or_not_owned', {
        complexId: input.complexId,
        platformUserId,
      });
    }
    const organizationId =
      complexRow.organization_id ?? (await resolveExactActiveOrganizationId(txDb, platformUserId));
    await assertPatientDiariesMutationAllowed(txDb, organizationId);

    const res = await txDb.query<{ id: string }>(
      `INSERT INTO public.lfk_sessions (
         user_id, complex_id, completed_at, source, recorded_at, organization_id
       )
       VALUES ($1::uuid, $2::uuid, $3::timestamptz, 'bot', $3::timestamptz, $4::uuid)
       RETURNING id::text AS id`,
      [platformUserId, input.complexId, input.completedAt, organizationId],
    );
    const sessionId = res.rows[0]?.id;
    if (!sessionId) throw new Error('lfk_sessions insert returned no id');
    return { platformUserId, organizationId, sessionId };
  });
}

/**
 * True when `err` is a D2 fail-closed condition (platform-user unresolved/ambiguous — D1 machinery reuse
 * — or org/ownership resolution failure) that callers should log-and-swallow (no write, no crash),
 * mirroring D1's `isIdentityMergeAmbiguityError` and the previous byte-parity behavior of the retired
 * HTTP emits (none of which were checked for success at their call sites either).
 */
export function isDiaryLfkFailClosedError(err: unknown): boolean {
  if (err instanceof DiaryLfkDirectWriteError) return true;
  if (err instanceof DirectPublicWriteError) {
    return (
      err.code === 'no_platform_user_candidate' || err.code === 'ambiguous_platform_user_candidates'
    );
  }
  return false;
}
