/* eslint-disable no-secrets/no-secrets -- SQL-routing tags and failure-code identifiers, not secrets */
import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  DirectPublicWriteError,
  writeIdentityAndPreferencesDirect,
  writeNotificationTopicsDirect,
  type DirectPublicIdentityInput,
  type WriteIdentityAndPreferencesDeps,
} from './writeIdentityAndPreferencesDirect.js';

type QueryResult = DbQueryResult<Record<string, unknown>>;
type Router = (sql: string, params: unknown[]) => QueryResult;

/** Route SQL text → table tag for ordering/coverage assertions (mock, no real pg). */
function tagFor(sql: string): string {
  if (/pg_advisory_xact_lock/.test(sql)) return 'advisory_lock';
  if (/INSERT INTO public\.platform_users/.test(sql)) return 'platform_users:insert';
  if (/UPDATE public\.platform_users/.test(sql)) return 'platform_users:update';
  if (/FROM public\.user_channel_bindings ucb/.test(sql))
    return 'platform_users:candidate_by_channel';
  if (/INSERT INTO public\.user_channel_bindings/.test(sql)) return 'user_channel_bindings:insert';
  if (/INSERT INTO public\.user_channel_preferences/.test(sql))
    return 'user_channel_preferences:seed';
  if (/INSERT INTO public\.user_notification_topics/.test(sql))
    return 'user_notification_topics:insert';
  if (/FROM public\.platform_users/.test(sql) && /integrator_user_id =/.test(sql))
    return 'platform_users:candidate_by_int';
  if (/FROM public\.platform_users/.test(sql) && /phone_normalized =/.test(sql))
    return 'platform_users:candidate_by_phone';
  return 'other';
}

function createDbMock(router: Router) {
  const state = {
    txCount: 0,
    committed: false,
    rolledBack: false,
    order: [] as string[],
    queries: [] as Array<{ sql: string; params: unknown[]; tag: string }>,
  };

  const makeTxDb = (): DbPort => ({
    query: (async (sql: string, params: unknown[] = []) => {
      const tag = tagFor(sql);
      state.queries.push({ sql, params, tag });
      state.order.push(`query:${tag}`);
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

/** Router for the "no existing candidate → INSERT" happy path. */
const newUserRouter: Router = (sql) => {
  const tag = tagFor(sql);
  switch (tag) {
    case 'platform_users:candidate_by_int':
    case 'platform_users:candidate_by_phone':
    case 'platform_users:candidate_by_channel':
      return rows([]);
    case 'platform_users:insert':
      return rows([{ id: 'pu-new' }]);
    case 'user_channel_bindings:insert':
      return rows([{ user_id: 'pu-new' }], 1);
    case 'user_notification_topics:insert':
      return rows([], 1);
    default:
      return rows([]);
  }
};

const baseInput: DirectPublicIdentityInput = {
  channelCode: 'telegram',
  externalId: '12345',
  phoneNormalized: '+79990001122',
  displayName: 'Ivanov Ivan',
  firstName: 'Ivan',
  lastName: 'Ivanov',
  topics: [
    { topicCode: 'booking_spb', isEnabled: true },
    { topicCode: 'bookings', isEnabled: false },
  ],
};

function anchorDep(
  integratorUserId: string | null,
  spy?: (txDb: DbPort) => void,
): WriteIdentityAndPreferencesDeps {
  return {
    writeChannelAnchor: vi.fn(async (txDb: DbPort) => {
      spy?.(txDb);
      return integratorUserId === null ? null : { integratorUserId };
    }),
  };
}

describe('writeIdentityAndPreferencesDirect (D1 direct public writes)', () => {
  it('writes anchor + all three public tables in ONE transaction, in order', async () => {
    const { db, state } = createDbMock(newUserRouter);
    const order: string[] = [];
    const deps: WriteIdentityAndPreferencesDeps = {
      writeChannelAnchor: vi.fn(async () => {
        order.push('anchor');
        return { integratorUserId: '777' };
      }),
    };

    const res = await writeIdentityAndPreferencesDirect(db, baseInput, deps);

    // Single bounded transaction that committed.
    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(true);
    expect(state.rolledBack).toBe(false);
    expect(deps.writeChannelAnchor).toHaveBeenCalledTimes(1);

    const tags = state.queries.map((q) => q.tag);
    // All four canonical tables written (platform_users, binding, preferences seed, topics).
    expect(tags).toContain('platform_users:insert');
    expect(tags).toContain('user_channel_bindings:insert');
    expect(tags).toContain('user_channel_preferences:seed');
    expect(tags).toContain('user_notification_topics:insert');

    // Ordering: anchor first, then the A3 advisory lock, then platform_users, then binding, then the
    // broadcast-preferences seed (fires right after a NEW binding — parity with
    // upsertBroadcastDefaultsAfterChannelBind), then topics.
    order.push(...state.order);
    const idxAnchor = order.indexOf('anchor');
    const idxLock = order.indexOf('query:advisory_lock');
    const idxPu = order.indexOf('query:platform_users:insert');
    const idxBinding = order.indexOf('query:user_channel_bindings:insert');
    const idxSeed = order.indexOf('query:user_channel_preferences:seed');
    const idxTopic = order.indexOf('query:user_notification_topics:insert');
    expect(idxAnchor).toBeGreaterThanOrEqual(0);
    expect(idxAnchor).toBeLessThan(idxLock);
    expect(idxLock).toBeLessThan(idxPu);
    expect(idxPu).toBeLessThan(idxBinding);
    expect(idxBinding).toBeLessThan(idxSeed);
    expect(idxSeed).toBeLessThan(idxTopic);

    // Seed row: user_id (text) + platform_user_id (uuid) both the new canonical id, channel_code, opted-in.
    const seedCall = state.queries.find((q) => q.tag === 'user_channel_preferences:seed');
    expect(seedCall?.params[0]).toBe('pu-new');
    expect(seedCall?.params[1]).toBe('telegram');

    // Lock key is namespaced and carries the canonical integrator user id (concurrent-webhook idempotency).
    const lockCall = state.queries.find((q) => q.tag === 'advisory_lock');
    expect(lockCall?.params[0]).toBe('777');

    // Both topics upserted; result surfaces canonical ids.
    expect(res).toEqual({
      integratorUserId: '777',
      platformUserId: 'pu-new',
      channelBindingInserted: true,
      topicsWritten: 2,
    });
  });

  it('retains integrator-only channel identity: anchor runs on the tx client and its id is used', async () => {
    let anchorTxDb: DbPort | undefined;
    const { db, state } = createDbMock(newUserRouter);
    const deps = anchorDep('4242', (txDb) => {
      anchorTxDb = txDb;
    });

    const res = await writeIdentityAndPreferencesDirect(db, baseInput, deps);

    expect(deps.writeChannelAnchor).toHaveBeenCalledTimes(1);
    // Anchor was given the SAME tx-bound client the public writes use (not a fresh/top-level db).
    expect(anchorTxDb).toBeDefined();
    expect(anchorTxDb).not.toBe(db);
    // Canonical integrator id from the anchor is the one persisted / returned.
    expect(res.integratorUserId).toBe('4242');
    const insertCall = state.queries.find((q) => q.tag === 'platform_users:insert');
    expect(insertCall?.params[0]).toBe('4242');
  });

  it('existing candidate path merges then enriches (UPDATE, no INSERT)', async () => {
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      if (tag === 'platform_users:candidate_by_int') return rows([{ id: 'pu-existing' }]);
      if (tag === 'platform_users:candidate_by_phone') return rows([]);
      if (tag === 'platform_users:candidate_by_channel') return rows([]);
      if (tag === 'platform_users:update') return rows([], 1);
      if (tag === 'user_channel_bindings:insert') return rows([], 0);
      if (tag === 'user_notification_topics:insert') return rows([], 1);
      return rows([]);
    };
    const { db, state } = createDbMock(router);
    const mergeCandidateIds = vi.fn(async (_txDb: DbPort, ids: string[]) => ids[0]!);
    const deps: WriteIdentityAndPreferencesDeps = {
      writeChannelAnchor: vi.fn(async () => ({ integratorUserId: '9' })),
      mergeCandidateIds,
    };

    const res = await writeIdentityAndPreferencesDirect(db, { ...baseInput, topics: [] }, deps);

    expect(mergeCandidateIds).toHaveBeenCalledWith(expect.anything(), ['pu-existing']);
    const tags = state.queries.map((q) => q.tag);
    expect(tags).toContain('platform_users:update');
    expect(tags).not.toContain('platform_users:insert');
    expect(res.platformUserId).toBe('pu-existing');
    expect(res.channelBindingInserted).toBe(false);
    // No preferences seed on an EXISTING binding (ON CONFLICT DO NOTHING no-op, not a new row) — parity
    // with upsertBroadcastDefaultsAfterChannelBind only being called when the binding INSERT ... RETURNING
    // actually returned a row.
    expect(tags).not.toContain('user_channel_preferences:seed');
    expect(res.topicsWritten).toBe(0);
    expect(state.committed).toBe(true);
  });

  it('enrich UPDATE overwrites display_name when displayName+firstName+lastName are ALL non-empty (parity with pgUserProjection.ts:276-283)', async () => {
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      if (tag === 'platform_users:candidate_by_int') return rows([{ id: 'pu-existing' }]);
      if (tag === 'platform_users:update') return rows([], 1);
      return rows([]);
    };
    const { db, state } = createDbMock(router);
    const deps: WriteIdentityAndPreferencesDeps = {
      writeChannelAnchor: vi.fn(async () => ({ integratorUserId: '9' })),
      mergeCandidateIds: vi.fn(async (_txDb: DbPort, ids: string[]) => ids[0]!),
    };

    // baseInput has displayName='Ivanov Ivan', firstName='Ivan', lastName='Ivanov' — all non-empty.
    await writeIdentityAndPreferencesDirect(db, { ...baseInput, topics: [] }, deps);

    const updateCall = state.queries.find((q) => q.tag === 'platform_users:update');
    expect(updateCall).toBeDefined();
    // The "overwrite unconditionally" branch must be the FIRST WHEN in the CASE — same shape/precedence
    // as pgUserProjection.ts's display_name CASE (not a "never overwrite" scaffold shortcut).
    expect(updateCall!.sql).toMatch(
      /display_name = CASE\s+WHEN \$2::text IS NOT NULL AND trim\(\$2::text\) <> ''\s+AND \$3::text IS NOT NULL AND trim\(\$3::text\) <> ''\s+AND \$4::text IS NOT NULL AND trim\(\$4::text\) <> ''\s+THEN \$2::text/,
    );
    // $2/$3/$4 are displayName/firstName/lastName — the all-non-empty overwrite condition is satisfied.
    expect(updateCall!.params[1]).toBe('Ivanov Ivan');
    expect(updateCall!.params[2]).toBe('Ivan');
    expect(updateCall!.params[3]).toBe('Ivanov');
  });

  it('enrich UPDATE only fills an empty display_name when firstName/lastName are not BOTH present (fill-only branch)', async () => {
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      if (tag === 'platform_users:candidate_by_int') return rows([{ id: 'pu-existing' }]);
      if (tag === 'platform_users:update') return rows([], 1);
      return rows([]);
    };
    const { db, state } = createDbMock(router);
    const deps: WriteIdentityAndPreferencesDeps = {
      writeChannelAnchor: vi.fn(async () => ({ integratorUserId: '9' })),
      mergeCandidateIds: vi.fn(async (_txDb: DbPort, ids: string[]) => ids[0]!),
    };

    // Only firstName present (no lastName) — displayName is still derived/non-empty, but the
    // ALL-non-empty overwrite condition is false, so only the fill-if-empty branch can apply.
    await writeIdentityAndPreferencesDirect(
      db,
      { ...baseInput, topics: [], displayName: 'Ivan', firstName: 'Ivan', lastName: null },
      deps,
    );

    const updateCall = state.queries.find((q) => q.tag === 'platform_users:update');
    expect(updateCall!.params[1]).toBe('Ivan');
    expect(updateCall!.params[2]).toBe('Ivan');
    expect(updateCall!.params[3]).toBeNull();
  });

  it('rolls back the whole transaction when a public write throws (nothing after it runs)', async () => {
    const boom = new Error('pg: duplicate key');
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      if (tag.startsWith('platform_users:candidate')) return rows([]);
      if (tag === 'platform_users:insert') throw boom;
      return rows([]);
    };
    const { db, state } = createDbMock(router);
    const deps = anchorDep('1');

    await expect(writeIdentityAndPreferencesDirect(db, baseInput, deps)).rejects.toThrow(
      'pg: duplicate key',
    );

    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(false);
    expect(state.rolledBack).toBe(true);
    // Failure was at platform_users insert → binding/topic writes never ran.
    const tags = state.queries.map((q) => q.tag);
    expect(tags).not.toContain('user_channel_bindings:insert');
    expect(tags).not.toContain('user_notification_topics:insert');
  });

  it('aborts before any public write when the channel anchor is unresolved', async () => {
    const { db, state } = createDbMock(newUserRouter);
    const deps = anchorDep(null);

    await expect(writeIdentityAndPreferencesDirect(db, baseInput, deps)).rejects.toBeInstanceOf(
      DirectPublicWriteError,
    );

    expect(state.rolledBack).toBe(true);
    expect(state.committed).toBe(false);
    // No public.* query issued at all.
    expect(state.queries).toHaveLength(0);
  });

  it('default merge policy rejects ambiguous multi-candidate matches (no silent pick)', async () => {
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      // Distinct canonical rows by integrator id and by phone → ambiguous.
      if (tag === 'platform_users:candidate_by_int') return rows([{ id: 'pu-a' }]);
      if (tag === 'platform_users:candidate_by_phone') return rows([{ id: 'pu-b' }]);
      if (tag === 'platform_users:candidate_by_channel') return rows([]);
      return rows([]);
    };
    const { db, state } = createDbMock(router);
    const deps = anchorDep('5'); // no mergeCandidateIds → default policy

    await expect(writeIdentityAndPreferencesDirect(db, baseInput, deps)).rejects.toMatchObject({
      code: 'ambiguous_platform_user_candidates',
    });
    expect(state.committed).toBe(false);
    expect(state.rolledBack).toBe(true);
  });
});

describe('writeNotificationTopicsDirect (D1 notifications.update direct write)', () => {
  it('new person: locks, resolves by integrator_user_id ONLY (no channel candidate query), inserts + writes topics', async () => {
    const { db, state } = createDbMock(newUserRouter);

    const res = await writeNotificationTopicsDirect(db, {
      integratorUserId: '42',
      topics: [
        { topicCode: 'booking_spb', isEnabled: true },
        { topicCode: 'bookings', isEnabled: false },
      ],
    });

    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(true);

    const tags = state.queries.map((q) => q.tag);
    // Parity with the webapp `preferences.updated` consumer (`upsertFromProjection({ integratorUserId })`):
    // no channel-binding candidate lookup, no channel-binding write — topics-only against the resolved user.
    expect(tags).not.toContain('platform_users:candidate_by_channel');
    expect(tags).not.toContain('user_channel_bindings:insert');
    expect(tags).toContain('advisory_lock');
    expect(tags).toContain('platform_users:insert');
    expect(tags).toContain('user_notification_topics:insert');

    const lockCall = state.queries.find((q) => q.tag === 'advisory_lock');
    expect(lockCall?.params[0]).toBe('42');
    const insertCall = state.queries.find((q) => q.tag === 'platform_users:insert');
    // integratorUserId set; phone/displayName/first/last all null (nothing else is known here).
    expect(insertCall?.params).toEqual(['42', null, '', null, null]);

    expect(res).toEqual({ platformUserId: 'pu-new', topicsWritten: 2 });
  });

  it('existing candidate: merges/enriches then writes topics (no insert, no channel-binding write)', async () => {
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      if (tag === 'platform_users:candidate_by_int') return rows([{ id: 'pu-existing' }]);
      if (tag === 'platform_users:update') return rows([], 1);
      if (tag === 'user_notification_topics:insert') return rows([], 1);
      return rows([]);
    };
    const { db, state } = createDbMock(router);
    const mergeCandidateIds = vi.fn(async (_txDb: DbPort, ids: string[]) => ids[0]!);

    const res = await writeNotificationTopicsDirect(
      db,
      { integratorUserId: '9', topics: [{ topicCode: 'booking_msk', isEnabled: true }] },
      { mergeCandidateIds },
    );

    expect(mergeCandidateIds).toHaveBeenCalledWith(expect.anything(), ['pu-existing']);
    const tags = state.queries.map((q) => q.tag);
    expect(tags).toContain('platform_users:update');
    expect(tags).not.toContain('platform_users:insert');
    expect(tags).not.toContain('user_channel_bindings:insert');
    expect(res).toEqual({ platformUserId: 'pu-existing', topicsWritten: 1 });
  });

  it('default merge policy rejects ambiguous multi-candidate matches (no silent pick)', async () => {
    const router: Router = (sql) => {
      const tag = tagFor(sql);
      if (tag === 'platform_users:candidate_by_int') return rows([{ id: 'pu-a' }, { id: 'pu-b' }]);
      return rows([]);
    };
    const { db, state } = createDbMock(router);

    await expect(
      writeNotificationTopicsDirect(db, {
        integratorUserId: '5',
        topics: [{ topicCode: 'bookings', isEnabled: true }],
      }),
    ).rejects.toMatchObject({ code: 'ambiguous_platform_user_candidates' });
    expect(state.committed).toBe(false);
    expect(state.rolledBack).toBe(true);
  });

  it('rejects an empty integratorUserId before opening a transaction', async () => {
    const { db, state } = createDbMock(newUserRouter);

    await expect(
      writeNotificationTopicsDirect(db, { integratorUserId: '   ', topics: [] }),
    ).rejects.toMatchObject({ code: 'channel_anchor_unresolved' });
    expect(state.txCount).toBe(0);
  });
});
