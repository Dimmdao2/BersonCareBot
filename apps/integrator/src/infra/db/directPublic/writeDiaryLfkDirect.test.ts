/* eslint-disable no-secrets/no-secrets -- SQL-routing tags and failure-code identifiers, not secrets */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { DirectPublicWriteError } from './writeIdentityAndPreferencesDirect.js';
import {
  DiaryLfkDirectWriteError,
  addLfkSessionDirect,
  addSymptomEntryDirect,
  createLfkComplexDirect,
  createSymptomTrackingDirect,
  isDiaryLfkFailClosedError,
} from './writeDiaryLfkDirect.js';

type QueryResult = DbQueryResult<Record<string, unknown>>;
type Router = (sql: string, params: unknown[]) => QueryResult;

/** Route SQL text → tag for assertions (mock, no real pg). */
function tagFor(sql: string): string {
  if (/FROM users\s+WHERE id =/.test(sql)) return 'integrator_users:canonical';
  if (/FROM public\.platform_users/.test(sql) && /integrator_user_id =/.test(sql)) return 'platform_users:candidate_by_int';
  if (/FROM public\.platform_users/.test(sql) && /phone_normalized =/.test(sql)) return 'platform_users:candidate_by_phone';
  if (/FROM public\.user_channel_bindings ucb/.test(sql)) return 'platform_users:candidate_by_channel';
  if (/FROM public\.org_enrollments/.test(sql)) return 'org_enrollments:active';
  if (/INSERT INTO public\.symptom_trackings/.test(sql)) return 'symptom_trackings:insert';
  if (/FROM public\.symptom_trackings/.test(sql)) return 'symptom_trackings:ownership';
  if (/INSERT INTO public\.symptom_entries/.test(sql)) return 'symptom_entries:insert';
  if (/INSERT INTO public\.lfk_complexes/.test(sql)) return 'lfk_complexes:insert';
  if (/FROM public\.lfk_complexes/.test(sql)) return 'lfk_complexes:ownership';
  if (/INSERT INTO public\.lfk_sessions/.test(sql)) return 'lfk_sessions:insert';
  return 'other';
}

function createDbMock(router: Router) {
  const state = {
    txCount: 0,
    committed: false,
    rolledBack: false,
    queries: [] as Array<{ sql: string; params: unknown[]; tag: string }>,
  };

  const makeTxDb = (): DbPort => ({
    query: (async (sql: string, params: unknown[] = []) => {
      const tag = tagFor(sql);
      state.queries.push({ sql, params, tag });
      return router(sql, params);
    }) as DbPort['query'],
    tx: (async () => {
      throw new Error('nested tx not expected');
    }) as DbPort['tx'],
  });

  const db: DbPort = {
    query: (async () => {
      throw new Error('top-level query not expected — all writes must run inside tx');
    }) as DbPort['query'],
    tx: (async (fn: (d: DbPort) => Promise<unknown>) => {
      state.txCount += 1;
      const txDb = makeTxDb();
      try {
        const r = await fn(txDb);
        state.committed = true;
        return r;
      } catch (err) {
        state.rolledBack = true;
        throw err;
      }
    }) as DbPort['tx'],
  };

  return { db, state };
}

const rows = (r: Record<string, unknown>[], rowCount?: number): QueryResult =>
  rowCount === undefined ? { rows: r } : { rows: r, rowCount };

const ACTOR = { integratorUserId: '12345', channelCode: 'telegram', externalId: '12345' };
const PLATFORM_USER_ID = 'pu-1';
const ORG_ID = 'org-1';

/** Base router: canonical integrator id = self (no merge), single candidate via channel binding, one active org. */
function baseRouter(overrides: Partial<Record<string, QueryResult>> = {}): Router {
  return (sqlText) => {
    const tag = tagFor(sqlText);
    if (overrides[tag]) return overrides[tag]!;
    switch (tag) {
      case 'integrator_users:canonical':
        return rows([{ merged_into_user_id: null }]);
      case 'platform_users:candidate_by_int':
        return rows([]);
      case 'platform_users:candidate_by_channel':
        return rows([{ user_id: PLATFORM_USER_ID }]);
      case 'org_enrollments:active':
        return rows([{ organization_id: ORG_ID }]);
      case 'symptom_trackings:insert':
        return rows([{ id: 'tracking-1' }]);
      case 'symptom_trackings:ownership':
        return rows([{ organization_id: ORG_ID }]);
      case 'symptom_entries:insert':
        return rows([{ id: 'entry-1' }]);
      case 'lfk_complexes:insert':
        return rows([{ id: 'complex-1' }]);
      case 'lfk_complexes:ownership':
        return rows([{ organization_id: ORG_ID }]);
      case 'lfk_sessions:insert':
        return rows([{ id: 'session-1' }]);
      default:
        return rows([]);
    }
  };
}

describe('createSymptomTrackingDirect (D2 direct public write)', () => {
  it('resolves platform user + exact active org, inserts in ONE transaction', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await createSymptomTrackingDirect(db, { ...ACTOR, symptomTitle: 'Головная боль' });

    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(true);
    expect(result).toEqual({ platformUserId: PLATFORM_USER_ID, organizationId: ORG_ID, trackingId: 'tracking-1' });

    const insert = state.queries.find((q) => q.tag === 'symptom_trackings:insert');
    expect(insert?.params).toEqual([PLATFORM_USER_ID, ORG_ID, null, 'Головная боль']);
  });

  it('fails closed (no write) when zero platform-user candidates resolve', async () => {
    const { db, state } = createDbMock(baseRouter({ 'platform_users:candidate_by_channel': rows([]) }));
    await expect(
      createSymptomTrackingDirect(db, { ...ACTOR, symptomTitle: 'x' }),
    ).rejects.toBeInstanceOf(DirectPublicWriteError);
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'symptom_trackings:insert')).toBe(false);
  });

  it('fails closed (no write, no default org) when zero active org enrollments', async () => {
    const { db, state } = createDbMock(baseRouter({ 'org_enrollments:active': rows([]) }));
    const err = await createSymptomTrackingDirect(db, { ...ACTOR, symptomTitle: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('no_active_org_enrollment');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'symptom_trackings:insert')).toBe(false);
  });

  it('fails closed (no write, no default org) when active org enrollment is ambiguous', async () => {
    const { db, state } = createDbMock(
      baseRouter({ 'org_enrollments:active': rows([{ organization_id: 'org-a' }, { organization_id: 'org-b' }]) }),
    );
    const err = await createSymptomTrackingDirect(db, { ...ACTOR, symptomTitle: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('ambiguous_org_enrollment');
    expect(state.queries.some((q) => q.tag === 'symptom_trackings:insert')).toBe(false);
  });
});

describe('addSymptomEntryDirect (D2 direct public write)', () => {
  const entryInput = {
    ...ACTOR,
    trackingId: 'tracking-1',
    value0_10: 7,
    entryType: 'instant' as const,
    recordedAt: '2026-07-24T10:00:00.000Z',
  };

  it('validates tracking ownership, reuses the tracking org, inserts the entry', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await addSymptomEntryDirect(db, entryInput);

    expect(result).toEqual({ platformUserId: PLATFORM_USER_ID, organizationId: ORG_ID, entryId: 'entry-1' });
    const ownershipCheck = state.queries.find((q) => q.tag === 'symptom_trackings:ownership');
    expect(ownershipCheck?.params).toEqual(['tracking-1', PLATFORM_USER_ID]);
    const insert = state.queries.find((q) => q.tag === 'symptom_entries:insert');
    expect(insert?.params).toEqual([PLATFORM_USER_ID, 'tracking-1', 7, 'instant', '2026-07-24T10:00:00.000Z', null, ORG_ID]);
  });

  it('fails closed when the tracking does not belong to the resolved platform user', async () => {
    const { db, state } = createDbMock(baseRouter({ 'symptom_trackings:ownership': rows([]) }));
    const err = await addSymptomEntryDirect(db, entryInput).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('tracking_not_found_or_not_owned');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'symptom_entries:insert')).toBe(false);
  });
});

describe('createLfkComplexDirect (D2 direct public write)', () => {
  it('resolves platform user + exact active org, inserts in ONE transaction', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await createLfkComplexDirect(db, { ...ACTOR, title: 'Утренняя гимнастика' });

    expect(result).toEqual({ platformUserId: PLATFORM_USER_ID, organizationId: ORG_ID, complexId: 'complex-1' });
    const insert = state.queries.find((q) => q.tag === 'lfk_complexes:insert');
    expect(insert?.params).toEqual([PLATFORM_USER_ID, ORG_ID, 'Утренняя гимнастика', 'manual']);
  });
});

describe('addLfkSessionDirect (D2 direct public write)', () => {
  const sessionInput = { ...ACTOR, complexId: 'complex-1', completedAt: '2026-07-24T10:00:00.000Z' };

  it('validates complex ownership, reuses the complex org, inserts the session', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await addLfkSessionDirect(db, sessionInput);

    expect(result).toEqual({ platformUserId: PLATFORM_USER_ID, organizationId: ORG_ID, sessionId: 'session-1' });
    const ownershipCheck = state.queries.find((q) => q.tag === 'lfk_complexes:ownership');
    expect(ownershipCheck?.params).toEqual(['complex-1', PLATFORM_USER_ID]);
    const insert = state.queries.find((q) => q.tag === 'lfk_sessions:insert');
    expect(insert?.params).toEqual([PLATFORM_USER_ID, 'complex-1', '2026-07-24T10:00:00.000Z', ORG_ID]);
  });

  it('fails closed when the complex does not belong to the resolved platform user', async () => {
    const { db, state } = createDbMock(baseRouter({ 'lfk_complexes:ownership': rows([]) }));
    const err = await addLfkSessionDirect(db, sessionInput).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('complex_not_found_or_not_owned');
    expect(state.queries.some((q) => q.tag === 'lfk_sessions:insert')).toBe(false);
  });
});

describe('isDiaryLfkFailClosedError', () => {
  it('classifies DiaryLfkDirectWriteError and platform-user-candidate DirectPublicWriteError as fail-closed', () => {
    expect(isDiaryLfkFailClosedError(new DiaryLfkDirectWriteError('no_active_org_enrollment'))).toBe(true);
    expect(isDiaryLfkFailClosedError(new DirectPublicWriteError('no_platform_user_candidate'))).toBe(true);
    expect(isDiaryLfkFailClosedError(new DirectPublicWriteError('ambiguous_platform_user_candidates'))).toBe(true);
    expect(isDiaryLfkFailClosedError(new Error('unrelated'))).toBe(false);
  });
});
