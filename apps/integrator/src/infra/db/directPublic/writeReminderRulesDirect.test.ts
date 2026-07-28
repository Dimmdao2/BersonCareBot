/* eslint-disable no-secrets/no-secrets -- SQL-routing tags and failure-code identifiers, not secrets */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { DirectPublicWriteError } from './writeIdentityAndPreferencesDirect.js';
import { DiaryLfkDirectWriteError } from './writeDiaryLfkDirect.js';
import {
  ReminderRuleDirectWriteError,
  upsertReminderRuleDirect,
} from './writeReminderRulesDirect.js';

type QueryResult = DbQueryResult<Record<string, unknown>>;
type Router = (sql: string, params: unknown[]) => QueryResult;

/** Route SQL text → tag for assertions (mock, no real pg). Same idiom as writeDiaryLfkDirect.test.ts. */
function tagFor(sql: string): string {
  if (/FROM users\s+WHERE id =/.test(sql)) return 'integrator_users:canonical';
  if (/FROM public\.platform_users/.test(sql) && /integrator_user_id =/.test(sql))
    return 'platform_users:candidate_by_int';
  if (/FROM public\.platform_users/.test(sql) && /phone_normalized =/.test(sql))
    return 'platform_users:candidate_by_phone';
  if (/FROM public\.user_channel_bindings ucb/.test(sql))
    return 'platform_users:candidate_by_channel';
  if (/FROM public\.org_enrollments/.test(sql)) return 'org_enrollments:active';
  if (/INSERT INTO public\.reminder_rules/.test(sql)) return 'reminder_rules:upsert';
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

const INTEGRATOR_USER_ID = '12345';
const PLATFORM_USER_ID = 'pu-1';
const ORG_ID = 'org-1';
const UPDATED_AT = '2026-07-25T10:00:00.000Z';

function baseRouter(overrides: Partial<Record<string, QueryResult>> = {}): Router {
  return (sqlText) => {
    const tag = tagFor(sqlText);
    if (overrides[tag]) return overrides[tag]!;
    switch (tag) {
      case 'integrator_users:canonical':
        return rows([{ merged_into_user_id: null }]);
      case 'platform_users:candidate_by_int':
        return rows([{ id: PLATFORM_USER_ID }]);
      case 'org_enrollments:active':
        return rows([{ organization_id: ORG_ID }]);
      case 'reminder_rules:upsert':
        return rows([{ updated_at: UPDATED_AT }]);
      default:
        return rows([]);
    }
  };
}

const baseInput = {
  integratorUserId: INTEGRATOR_USER_ID,
  integratorRuleId: 'reminder:12345:lfk',
  category: 'lfk',
  isEnabled: true,
  scheduleType: 'interval_window',
  timezone: 'Europe/Moscow',
  intervalMinutes: 60,
  windowStartMinute: 480,
  windowEndMinute: 1320,
  daysMask: '1111111',
  contentMode: 'none',
  linkedObjectType: null,
  linkedObjectId: null,
  customTitle: null,
  customText: null,
  scheduleData: undefined,
  reminderIntent: null,
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  notificationTopicCode: undefined,
} as const;

describe('upsertReminderRuleDirect (D5 direct public write)', () => {
  it('resolves platform user + exactly-one active org and inserts the FULL field set, in ONE transaction', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await upsertReminderRuleDirect(db, {
      ...baseInput,
      linkedObjectType: 'lfk_complex',
      linkedObjectId: 'complex-1',
      scheduleData: { timesLocal: ['09:00'], dayFilter: 'all' },
      reminderIntent: 'exercises',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
    });

    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(true);
    expect(result).toEqual({
      platformUserId: PLATFORM_USER_ID,
      organizationId: ORG_ID,
      updatedAt: UPDATED_AT,
    });

    const insert = state.queries.find((q) => q.tag === 'reminder_rules:upsert');
    expect(insert?.params).toEqual([
      'reminder:12345:lfk',
      PLATFORM_USER_ID,
      ORG_ID,
      INTEGRATOR_USER_ID,
      'lfk',
      true,
      'interval_window',
      'Europe/Moscow',
      60,
      480,
      1320,
      '1111111',
      'none',
      'lfk_complex',
      'complex-1',
      null,
      null,
      JSON.stringify({ timesLocal: ['09:00'], dayFilter: 'all' }),
      'exercises',
      1320,
      420,
      null, // notificationTopicCode not provided -> param is null, "provided" flag below is false
      false,
    ]);
  });

  it('preserves the stored notification_topic_code when the caller does not supply the key (undefined, not null)', async () => {
    const { db, state } = createDbMock(baseRouter());
    await upsertReminderRuleDirect(db, baseInput);
    const insert = state.queries.find((q) => q.tag === 'reminder_rules:upsert');
    // Last two bind params: value (ignored server-side via CASE), provided flag.
    expect(insert?.params?.slice(-2)).toEqual([null, false]);
  });

  it('sets notification_topic_code and marks it provided when the caller explicitly supplies a value', async () => {
    const { db, state } = createDbMock(baseRouter());
    await upsertReminderRuleDirect(db, {
      ...baseInput,
      notificationTopicCode: 'training_reminders',
    });
    const insert = state.queries.find((q) => q.tag === 'reminder_rules:upsert');
    expect(insert?.params?.slice(-2)).toEqual(['training_reminders', true]);
  });

  it('clears notification_topic_code when the caller explicitly supplies null', async () => {
    const { db, state } = createDbMock(baseRouter());
    await upsertReminderRuleDirect(db, { ...baseInput, notificationTopicCode: null });
    const insert = state.queries.find((q) => q.tag === 'reminder_rules:upsert');
    expect(insert?.params?.slice(-2)).toEqual([null, true]);
  });

  it('is idempotent by integrator_rule_id: a second call with the same id issues ON CONFLICT DO UPDATE (no duplicate insert error)', async () => {
    const { db, state } = createDbMock(baseRouter());
    await upsertReminderRuleDirect(db, baseInput);
    await upsertReminderRuleDirect(db, { ...baseInput, isEnabled: false });
    const inserts = state.queries.filter((q) => q.tag === 'reminder_rules:upsert');
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.sql).toContain('ON CONFLICT (integrator_rule_id) DO UPDATE SET');
    expect(inserts[1]?.params?.[5]).toBe(false); // is_enabled
  });

  it('throws ReminderRuleDirectWriteError(no_platform_user_candidate) — routes to durable-outbox fallback — when the integrator user has never been linked to a platform user', async () => {
    const { db, state } = createDbMock(baseRouter({ 'platform_users:candidate_by_int': rows([]) }));
    const err = await upsertReminderRuleDirect(db, baseInput).catch((e) => e);
    expect(err).toBeInstanceOf(ReminderRuleDirectWriteError);
    expect((err as ReminderRuleDirectWriteError).code).toBe('no_platform_user_candidate');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'reminder_rules:upsert')).toBe(false);
  });

  it('propagates DirectPublicWriteError(ambiguous_platform_user_candidates) — routes to durable-outbox fallback — on a genuine identity anomaly', async () => {
    const { db, state } = createDbMock(
      baseRouter({
        'platform_users:candidate_by_int': rows([{ id: 'pu-1' }, { id: 'pu-2' }]),
      }),
    );
    const err = await upsertReminderRuleDirect(db, baseInput).catch((e) => e);
    expect(err).toBeInstanceOf(DirectPublicWriteError);
    expect((err as DirectPublicWriteError).code).toBe('ambiguous_platform_user_candidates');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'reminder_rules:upsert')).toBe(false);
  });

  it('propagates DiaryLfkDirectWriteError(no_active_org_enrollment) — routes to durable-outbox fallback — when the resolved platform user has no active org', async () => {
    const { db, state } = createDbMock(baseRouter({ 'org_enrollments:active': rows([]) }));
    const err = await upsertReminderRuleDirect(db, baseInput).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('no_active_org_enrollment');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'reminder_rules:upsert')).toBe(false);
  });

  it('propagates DiaryLfkDirectWriteError(ambiguous_org_enrollment) — routes to durable-outbox fallback — when 2+ active orgs are found (no default-org fallback)', async () => {
    const { db, state } = createDbMock(
      baseRouter({
        'org_enrollments:active': rows([
          { organization_id: 'org-1' },
          { organization_id: 'org-2' },
        ]),
      }),
    );
    const err = await upsertReminderRuleDirect(db, baseInput).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('ambiguous_org_enrollment');
    expect(state.rolledBack).toBe(true);
  });
});
