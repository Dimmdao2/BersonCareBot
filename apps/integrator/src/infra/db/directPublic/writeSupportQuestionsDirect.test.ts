/* eslint-disable no-secrets/no-secrets -- SQL-routing tags and failure-code identifiers, not secrets */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  SupportQuestionsDirectWriteError,
  appendSupportDeliveryEventDirect,
  appendSupportQuestionMessageDirect,
  createSupportQuestionDirect,
  markSupportQuestionAnsweredDirect,
} from './writeSupportQuestionsDirect.js';

type QueryResult = DbQueryResult<Record<string, unknown>>;
type Router = (sql: string, params: unknown[]) => QueryResult;

/** Route SQL text → tag for assertions (mock, no real pg). Same idiom as writeSupportConversationsDirect.test.ts. */
function tagFor(sql: string): string {
  if (
    /SELECT id::text AS id, organization_id/.test(sql) &&
    /FROM public\.support_conversations/.test(sql)
  ) {
    return 'support_conversations:lookup';
  }
  if (
    /SELECT id::text AS id, organization_id/.test(sql) &&
    /FROM public\.support_questions/.test(sql)
  ) {
    return 'support_questions:lookup';
  }
  if (/INSERT INTO public\.support_questions/.test(sql)) return 'support_questions:insert';
  if (/UPDATE public\.support_questions SET/.test(sql)) return 'support_questions:answered_update';
  if (/INSERT INTO public\.support_question_messages/.test(sql))
    return 'support_question_messages:insert';
  if (/INSERT INTO public\.support_delivery_events/.test(sql))
    return 'support_delivery_events:insert';
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

const ORG_ID = 'org-1';
const CONVERSATION_ID = 'conv-uuid-1';
const QUESTION_ID = 'question-uuid-1';

function baseRouter(overrides: Partial<Record<string, QueryResult>> = {}): Router {
  return (sqlText) => {
    const tag = tagFor(sqlText);
    if (overrides[tag]) return overrides[tag]!;
    switch (tag) {
      case 'support_conversations:lookup':
        return rows([{ id: CONVERSATION_ID, organization_id: ORG_ID }]);
      case 'support_questions:lookup':
        return rows([{ id: QUESTION_ID, organization_id: ORG_ID }]);
      case 'support_questions:insert':
        return rows([{ id: QUESTION_ID }]);
      case 'support_questions:answered_update':
        return rows([], 1);
      case 'support_question_messages:insert':
        return rows([{ id: 'qmsg-1' }]);
      case 'support_delivery_events:insert':
        return rows([{ id: 'delivery-1' }]);
      default:
        return rows([]);
    }
  };
}

describe('createSupportQuestionDirect (D4 direct public write)', () => {
  const input = {
    integratorQuestionId: 'integrator-q-1',
    integratorConversationId: 'integrator-conv-1',
    status: 'open',
    createdAt: '2026-07-25T10:00:00.000Z',
  };

  it('looks up the parent conversation and inserts the question with its organization_id, in ONE transaction', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await createSupportQuestionDirect(db, input);

    expect(state.txCount).toBe(1);
    expect(state.committed).toBe(true);
    expect(result).toEqual({
      id: QUESTION_ID,
      conversationId: CONVERSATION_ID,
      organizationId: ORG_ID,
    });

    const insert = state.queries.find((q) => q.tag === 'support_questions:insert');
    expect(insert?.params).toEqual([
      'integrator-q-1',
      CONVERSATION_ID,
      ORG_ID,
      'open',
      '2026-07-25T10:00:00.000Z',
      null,
    ]);
  });

  it('fails closed (no write, no fallback) when no conversation id is supplied at all', async () => {
    const { db, state } = createDbMock(baseRouter());
    const err = await createSupportQuestionDirect(db, {
      ...input,
      integratorConversationId: null,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SupportQuestionsDirectWriteError);
    expect((err as SupportQuestionsDirectWriteError).code).toBe('conversation_id_required');
    expect(state.txCount).toBe(0);
    expect(state.queries.some((q) => q.tag === 'support_questions:insert')).toBe(false);
  });

  it('throws conversation_not_found (routes to durable outbox fallback) when the parent conversation was never written', async () => {
    const { db, state } = createDbMock(baseRouter({ 'support_conversations:lookup': rows([]) }));
    const err = await createSupportQuestionDirect(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(SupportQuestionsDirectWriteError);
    expect((err as SupportQuestionsDirectWriteError).code).toBe('conversation_not_found');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'support_questions:insert')).toBe(false);
  });

  it('throws conversation_not_found when the parent conversation row has no organization_id yet', async () => {
    const { db } = createDbMock(
      baseRouter({
        'support_conversations:lookup': rows([{ id: CONVERSATION_ID, organization_id: null }]),
      }),
    );
    const err = await createSupportQuestionDirect(db, input).catch((e) => e);
    expect(err).toBeInstanceOf(SupportQuestionsDirectWriteError);
    expect((err as SupportQuestionsDirectWriteError).code).toBe('conversation_not_found');
  });
});

describe('appendSupportQuestionMessageDirect (D4 direct public write)', () => {
  const messageInput = {
    integratorQuestionMessageId: 'integrator-qm-1',
    integratorQuestionId: 'integrator-q-1',
    senderRole: 'user',
    text: 'Hello',
    createdAt: '2026-07-25T10:05:00.000Z',
  };

  it('looks up the resolved question and inserts the message with its organization_id', async () => {
    const { db } = createDbMock(baseRouter());
    const result = await appendSupportQuestionMessageDirect(db, messageInput);
    expect(result).toEqual({ id: 'qmsg-1', questionId: QUESTION_ID, organizationId: ORG_ID });
  });

  it('fails closed (no write) when the parent question never resolved (D4 create never wrote a row)', async () => {
    const { db, state } = createDbMock(baseRouter({ 'support_questions:lookup': rows([]) }));
    const err = await appendSupportQuestionMessageDirect(db, messageInput).catch((e) => e);
    expect(err).toBeInstanceOf(SupportQuestionsDirectWriteError);
    expect((err as SupportQuestionsDirectWriteError).code).toBe('question_not_found');
    expect(state.rolledBack).toBe(true);
    expect(state.queries.some((q) => q.tag === 'support_question_messages:insert')).toBe(false);
  });
});

describe('markSupportQuestionAnsweredDirect (D4 direct public write)', () => {
  it('updates status when the question row exists', async () => {
    const { db } = createDbMock(baseRouter());
    const result = await markSupportQuestionAnsweredDirect(db, {
      integratorQuestionId: 'integrator-q-1',
      answeredAt: '2026-07-25T10:10:00.000Z',
    });
    expect(result).toEqual({ updated: true });
  });

  it('throws question_not_found (NOT a silent no-op) when the question row was never created via D4 — caller must route this to the durable outbox fallback', async () => {
    const { db, state } = createDbMock(
      baseRouter({ 'support_questions:answered_update': rows([], 0) }),
    );
    const err = await markSupportQuestionAnsweredDirect(db, {
      integratorQuestionId: 'integrator-q-missing',
      answeredAt: '2026-07-25T10:10:00.000Z',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(SupportQuestionsDirectWriteError);
    expect((err as SupportQuestionsDirectWriteError).code).toBe('question_not_found');
    expect(state.rolledBack).toBe(true);
  });
});

describe('appendSupportDeliveryEventDirect (D4 direct public write)', () => {
  it('inserts the delivery event with the caller-supplied organization_id', async () => {
    const { db, state } = createDbMock(baseRouter());
    const result = await appendSupportDeliveryEventDirect(db, {
      organizationId: ORG_ID,
      conversationMessageId: null,
      integratorIntentEventId: 'evt-1',
      correlationId: 'corr-1',
      channelCode: 'telegram',
      status: 'success',
      attempt: 1,
      reason: null,
      payloadJson: { kind: 'test' },
      occurredAt: '2026-07-25T10:15:00.000Z',
    });
    expect(result).toEqual({ id: 'delivery-1' });
    const insert = state.queries.find((q) => q.tag === 'support_delivery_events:insert');
    expect(insert?.params).toEqual([
      ORG_ID,
      null,
      'evt-1',
      'corr-1',
      'telegram',
      'success',
      1,
      null,
      JSON.stringify({ kind: 'test' }),
      '2026-07-25T10:15:00.000Z',
    ]);
  });
});
