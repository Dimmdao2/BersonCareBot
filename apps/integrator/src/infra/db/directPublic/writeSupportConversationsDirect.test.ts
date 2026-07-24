/* eslint-disable no-secrets/no-secrets -- SQL-routing tags and failure-code identifiers, not secrets */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { DirectPublicWriteError } from './writeIdentityAndPreferencesDirect.js';
import { DiaryLfkDirectWriteError } from './writeDiaryLfkDirect.js';
import {
  SupportConversationsDirectWriteError,
  appendSupportConversationMessageDirect,
  isSupportConversationsFailClosedError,
  openSupportConversationDirect,
  setSupportConversationStatusDirect,
} from './writeSupportConversationsDirect.js';

type QueryResult = DbQueryResult<Record<string, unknown>>;
type Router = (sql: string, params: unknown[]) => QueryResult;

/** Route SQL text → tag for assertions (mock, no real pg). Same idiom as writeDiaryLfkDirect.test.ts. */
function tagFor(sql: string): string {
  if (/FROM users\s+WHERE id =/.test(sql)) return 'integrator_users:canonical';
  if (/FROM public\.platform_users/.test(sql) && /integrator_user_id =/.test(sql)) return 'platform_users:candidate_by_int';
  if (/FROM public\.platform_users/.test(sql) && /phone_normalized =/.test(sql)) return 'platform_users:candidate_by_phone';
  if (/FROM public\.user_channel_bindings ucb/.test(sql)) return 'platform_users:candidate_by_channel';
  if (/FROM public\.org_enrollments/.test(sql)) return 'org_enrollments:active';
  if (/INSERT INTO public\.support_conversations/.test(sql)) return 'support_conversations:insert';
  if (/SELECT id::text AS id, organization_id/.test(sql) && /FROM public\.support_conversations/.test(sql)) {
    return 'support_conversations:lookup';
  }
  if (/UPDATE public\.support_conversations SET\s+status/.test(sql)) return 'support_conversations:status_update';
  if (/UPDATE public\.support_conversations/.test(sql)) return 'support_conversations:touch';
  if (/INSERT INTO public\.support_conversation_messages/.test(sql)) return 'support_conversation_messages:insert';
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
const CONVERSATION_ID = 'conv-uuid-1';

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
      case 'support_conversations:insert':
        return rows([{ id: CONVERSATION_ID }]);
      case 'support_conversations:lookup':
        return rows([{ id: CONVERSATION_ID, organization_id: ORG_ID }]);
      case 'support_conversation_messages:insert':
        return rows([{ id: 'msg-1' }]);
      case 'support_conversations:status_update':
        return rows([], 1);
      default:
        return rows([]);
    }
  };
}

describe('openSupportConversationDirect (D3 direct public write)', () => {
  const input = {
    ...ACTOR,
    integratorConversationId: 'integrator-conv-1',
    source: 'telegram',
    adminScope: 'default',
    status: 'waiting_admin',
    openedAt: '2026-07-24T10:00:00.000Z',
    lastMessageAt: '2026-07-24T10:00:00.000Z',
  };

  it('resolves platform user + exact active org, inserts in ONE transaction', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await openSupportConversationDirect(db, input);

    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(true);
    expect(result).toEqual({ id: CONVERSATION_ID, platformUserId: PLATFORM_USER_ID, organizationId: ORG_ID });

    const insert = state.queries.find((q) => q.tag === 'support_conversations:insert');
    expect(insert?.params).toEqual([
      'integrator-conv-1',
      PLATFORM_USER_ID,
      ORG_ID,
      'telegram',
      'default',
      'waiting_admin',
      '2026-07-24T10:00:00.000Z',
      '2026-07-24T10:00:00.000Z',
      'telegram',
      '12345',
    ]);
  });

  it('fails closed (no write) when zero platform-user candidates resolve', async () => {
    const { db, state } = createDbMock(baseRouter({ 'platform_users:candidate_by_channel': rows([]) }));
    await expect(openSupportConversationDirect(db, input)).rejects.toBeInstanceOf(DirectPublicWriteError);
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'support_conversations:insert')).toBe(false);
  });

  it('fails closed (no write, no default org) when zero active org enrollments', async () => {
    const { db, state } = createDbMock(baseRouter({ 'org_enrollments:active': rows([]) }));
    const err = await openSupportConversationDirect(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('no_active_org_enrollment');
    expect(state.queries.some((q) => q.tag === 'support_conversations:insert')).toBe(false);
  });

  it('fails closed (no write, no default org) when active org enrollment is ambiguous', async () => {
    const { db, state } = createDbMock(
      baseRouter({ 'org_enrollments:active': rows([{ organization_id: 'org-a' }, { organization_id: 'org-b' }]) }),
    );
    const err = await openSupportConversationDirect(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(DiaryLfkDirectWriteError);
    expect((err as DiaryLfkDirectWriteError).code).toBe('ambiguous_org_enrollment');
    expect(state.queries.some((q) => q.tag === 'support_conversations:insert')).toBe(false);
  });
});

describe('appendSupportConversationMessageDirect (D3 direct public write)', () => {
  const messageInput = {
    integratorConversationId: 'integrator-conv-1',
    integratorMessageId: 'integrator-msg-1',
    senderRole: 'user',
    text: 'Hello',
    source: 'telegram',
    createdAt: '2026-07-24T10:05:00.000Z',
  };

  it('looks up the resolved conversation and inserts the message with its organization_id', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await appendSupportConversationMessageDirect(db, messageInput);

    expect(result).toEqual({ id: 'msg-1', conversationId: CONVERSATION_ID, organizationId: ORG_ID });
    const insert = state.queries.find((q) => q.tag === 'support_conversation_messages:insert');
    expect(insert?.params).toEqual([
      'integrator-msg-1',
      CONVERSATION_ID,
      ORG_ID,
      'user',
      'text',
      'Hello',
      'telegram',
      null,
      null,
      '2026-07-24T10:05:00.000Z',
    ]);
    expect(state.queries.some((q) => q.tag === 'support_conversations:touch')).toBe(true);
  });

  it('fails closed when the parent conversation never resolved (D3 open never wrote a row)', async () => {
    const { db, state } = createDbMock(baseRouter({ 'support_conversations:lookup': rows([]) }));
    const err = await appendSupportConversationMessageDirect(db, messageInput).catch((e) => e);
    expect(err).toBeInstanceOf(SupportConversationsDirectWriteError);
    expect((err as SupportConversationsDirectWriteError).code).toBe('conversation_not_found');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'support_conversation_messages:insert')).toBe(false);
  });
});

describe('setSupportConversationStatusDirect (D3 direct public write)', () => {
  it('updates status when the conversation row exists', async () => {
    const { db } = createDbMock(baseRouter());
    const result = await setSupportConversationStatusDirect(db, {
      integratorConversationId: 'integrator-conv-1',
      status: 'closed',
      closedAt: '2026-07-24T10:10:00.000Z',
      closeReason: 'resolved',
    });
    expect(result).toEqual({ updated: true });
  });

  it('no-ops (no error) when the conversation row was never opened via D3', async () => {
    const { db } = createDbMock(baseRouter({ 'support_conversations:status_update': rows([], 0) }));
    const result = await setSupportConversationStatusDirect(db, {
      integratorConversationId: 'integrator-conv-missing',
      status: 'closed',
    });
    expect(result).toEqual({ updated: false });
  });
});

describe('isSupportConversationsFailClosedError', () => {
  it('classifies SupportConversationsDirectWriteError and reused D1/D2 fail-closed errors', () => {
    expect(isSupportConversationsFailClosedError(new SupportConversationsDirectWriteError('conversation_not_found'))).toBe(
      true,
    );
    expect(isSupportConversationsFailClosedError(new DiaryLfkDirectWriteError('no_active_org_enrollment'))).toBe(true);
    expect(isSupportConversationsFailClosedError(new DirectPublicWriteError('no_platform_user_candidate'))).toBe(true);
    expect(isSupportConversationsFailClosedError(new Error('unrelated'))).toBe(false);
  });
});
