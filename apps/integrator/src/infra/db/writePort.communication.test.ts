import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';
import { stubIntegratorDrizzleForTests } from './stubIntegratorDrizzleForTests.js';

// Keep this hermetic — `recordOperatorFailureIncident` (called on the D3 durability-fallback path)
// otherwise hits a REAL pg pool via `getIntegratorDrizzle()`/`client.ts` (not the injected mock `db`),
// which would try to write into whatever DATABASE_URL vitest.setup.ts falls back to. Mock at the same
// module reportOperatorFailure.test.ts mocks (../db/repos/operatorHealthDrizzle.js).
const openOrTouchOperatorIncidentMock = vi.hoisted(() =>
  vi.fn(async (_input: Record<string, unknown>) => ({ id: 'incident-1', occurrenceCount: 1 })),
);
vi.mock('./repos/operatorHealthDrizzle.js', () => ({
  openOrTouchOperatorIncident: openOrTouchOperatorIncidentMock,
}));

describe('writePort communication projection events', () => {
  beforeEach(() => {
    openOrTouchOperatorIncidentMock.mockClear();
  });

  const D3_PLATFORM_USER_ID = 'pu-9001';
  const D3_ORG_ID = 'org-9001';
  const D3_CONVERSATION_ROW_ID = 'sc-conv-1';
  const D4_QUESTION_ROW_ID = 'sq-question-1';

  type SqlOverride = {
    match: (sql: string) => boolean;
    respond: () => Awaited<ReturnType<DbPort['query']>>;
  };

  function makeMockDb(
    capture: {
      projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[];
    },
    overrides: SqlOverride[] = [],
  ): DbPort {
    const query = vi.fn(async (sql: string, _params: unknown[]) => {
      for (const o of overrides) {
        if (typeof sql === 'string' && o.match(sql)) return o.respond();
      }
      if (
        typeof sql === 'string' &&
        sql.includes('user_id::text AS user_id') &&
        sql.includes('FROM identities') &&
        sql.includes('WHERE id =')
      ) {
        return { rows: [{ user_id: '9001' }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (
        typeof sql === 'string' &&
        sql.includes('merged_into_user_id') &&
        sql.includes('FROM users')
      ) {
        return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (
        typeof sql === 'string' &&
        sql.includes('user_identity_id') &&
        sql.includes('FROM conversations')
      ) {
        return { rows: [{ user_identity_id: '42' }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      // D3 direct-public-write plumbing (writeSupportConversationsDirect.ts, reusing D1/D2's
      // candidate/org resolution against apps/integrator/src/infra/db/directPublic).
      if (
        typeof sql === 'string' &&
        sql.includes('FROM public.platform_users') &&
        sql.includes('integrator_user_id =')
      ) {
        return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('FROM public.user_channel_bindings ucb')) {
        return { rows: [{ user_id: D3_PLATFORM_USER_ID }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('FROM public.org_enrollments')) {
        return { rows: [{ organization_id: D3_ORG_ID }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO public.support_conversations')) {
        return { rows: [{ id: D3_CONVERSATION_ROW_ID }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (
        typeof sql === 'string' &&
        sql.includes('SELECT id::text AS id, organization_id') &&
        sql.includes('FROM public.support_conversations')
      ) {
        return { rows: [{ id: D3_CONVERSATION_ROW_ID, organization_id: D3_ORG_ID }] } as Awaited<
          ReturnType<DbPort['query']>
        >;
      }
      if (
        typeof sql === 'string' &&
        sql.includes('INSERT INTO public.support_conversation_messages')
      ) {
        return { rows: [{ id: 'sc-msg-1' }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('UPDATE public.support_conversations')) {
        return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort['query']>>;
      }
      // D4 direct-public-write plumbing (writeSupportQuestionsDirect.ts, reusing D3's already-resolved
      // support_conversations row for organization_id).
      if (typeof sql === 'string' && sql.includes('INSERT INTO public.support_questions')) {
        return { rows: [{ id: D4_QUESTION_ROW_ID }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (
        typeof sql === 'string' &&
        sql.includes('SELECT id::text AS id, organization_id') &&
        sql.includes('FROM public.support_questions')
      ) {
        return { rows: [{ id: D4_QUESTION_ROW_ID, organization_id: D3_ORG_ID }] } as Awaited<
          ReturnType<DbPort['query']>
        >;
      }
      if (typeof sql === 'string' && sql.includes('UPDATE public.support_questions SET')) {
        return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO public.support_question_messages')) {
        return { rows: [{ id: 'sq-msg-1' }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO public.support_delivery_events')) {
        return { rows: [{ id: 'sq-delivery-1' }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const drizzle = stubIntegratorDrizzleForTests(capture);
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => {
      return fn({
        query,
        tx,
        integratorDrizzle: drizzle,
      } as DbPort);
    });
    return { query, tx, integratorDrizzle: drizzle } as DbPort;
  }

  // D3 (Track D): conversation.open / conversation.message.add / conversation.state.set no longer
  // enqueue an HTTP projection (support.conversation.opened / .message.appended / .status.changed) —
  // they write directly to public.support_conversations / public.support_conversation_messages in a
  // separate best-effort transaction. See writeSupportConversationsDirect.ts + its own unit tests
  // (writeSupportConversationsDirect.test.ts) for the resolution/fail-closed coverage; these tests only
  // assert the writePort wiring: no projection enqueued, direct-write SQL issued with the right params.

  it('conversation.open writes public.support_conversations directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.open',
      params: {
        id: 'conv-1',
        resource: 'telegram',
        externalId: '123',
        source: 'telegram',
        adminScope: 'support',
        status: 'waiting_admin',
        openedAt: '2025-01-01T12:00:00.000Z',
        lastMessageAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO public.support_conversations'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      'conv-1',
      D3_PLATFORM_USER_ID,
      D3_ORG_ID,
      'telegram',
      'support',
      'waiting_admin',
      '2025-01-01T12:00:00.000Z',
      '2025-01-01T12:00:00.000Z',
      'telegram',
      '123',
    ]);
  });

  it('conversation.message.add writes public.support_conversation_messages directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.message.add',
      params: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'user',
        text: 'Hello',
        source: 'telegram',
        createdAt: '2025-01-01T12:01:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO public.support_conversation_messages'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      'msg-1',
      D3_CONVERSATION_ROW_ID,
      D3_ORG_ID,
      'user',
      'text',
      'Hello',
      'telegram',
      null,
      null,
      '2025-01-01T12:01:00.000Z',
    ]);
  });

  it('conversation.state.set updates public.support_conversations status directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.state.set',
      params: {
        id: 'conv-1',
        conversationId: 'conv-1',
        status: 'closed',
        closedAt: '2025-01-01T12:02:00.000Z',
        closeReason: 'resolved',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const updateCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('UPDATE public.support_conversations SET') &&
        call[0].includes('status ='),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual([
      'conv-1',
      'closed',
      null,
      '2025-01-01T12:02:00.000Z',
      'resolved',
    ]);
  });

  // Durability fix (adversarial audit, post-D3-merge): a direct-write failure must NOT silently drop
  // the conversation/message/status — it must fall back to the same durable outbox the retired HTTP
  // projection used (`enqueueProjectionEvent` -> capture.projectionInserts here), and record an
  // operator-visible incident. Legitimately fail-closed conditions (ambiguous/unresolved org or
  // platform-user) are the ONE exception: no write, no fallback, no incident.

  it('conversation.open: ambiguous org enrollment is legitimately fail-closed — no outbox fallback, no incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) => sql.includes('FROM public.org_enrollments'),
        respond: () =>
          ({ rows: [{ organization_id: 'org-a' }, { organization_id: 'org-b' }] }) as Awaited<
            ReturnType<DbPort['query']>
          >,
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.open',
      params: {
        id: 'conv-1',
        resource: 'telegram',
        externalId: '123',
        source: 'telegram',
        adminScope: 'support',
        status: 'waiting_admin',
        openedAt: '2025-01-01T12:00:00.000Z',
        lastMessageAt: '2025-01-01T12:00:00.000Z',
      },
    });
    // The integrator-local conversation row still gets written (separate, earlier tx) — only the
    // public-side write is skipped.
    const localInsert = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO conversations'),
    );
    expect(localInsert).toBeDefined();
    const publicInsert = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO public.support_conversations'),
    );
    expect(publicInsert).toBeUndefined();
    expect(capture.projectionInserts.length).toBe(0);
    expect(openOrTouchOperatorIncidentMock).not.toHaveBeenCalled();
  });

  it('conversation.open: unexpected direct-write error falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) => sql.includes('INSERT INTO public.support_conversations'),
        respond: () => {
          throw new Error('simulated deadlock / connection blip');
        },
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.open',
      params: {
        id: 'conv-1',
        resource: 'telegram',
        externalId: '123',
        source: 'telegram',
        adminScope: 'support',
        status: 'waiting_admin',
        openedAt: '2025-01-01T12:00:00.000Z',
        lastMessageAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.conversation.opened');
    expect((ev.payload as Record<string, unknown>).integratorConversationId).toBe('conv-1');
    expect((ev.payload as Record<string, unknown>).integratorUserId).toBe('9001');
    expect(ev.idempotencyKey.startsWith('support.conversation.opened:conv-1:')).toBe(true);
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_conversations',
      errorClass: 'conversation_open_direct_write_fallback',
    });
  });

  it('conversation.message.add: conversation_not_found falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) =>
          sql.includes('SELECT id::text AS id, organization_id') &&
          sql.includes('FROM public.support_conversations'),
        respond: () => ({ rows: [] }) as Awaited<ReturnType<DbPort['query']>>,
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.message.add',
      params: {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderRole: 'user',
        text: 'Hello',
        source: 'telegram',
        createdAt: '2025-01-01T12:01:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.conversation.message.appended');
    expect((ev.payload as Record<string, unknown>).integratorMessageId).toBe('msg-1');
    expect((ev.payload as Record<string, unknown>).integratorConversationId).toBe('conv-1');
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_conversations',
      errorClass: 'conversation_message_add_direct_write_fallback',
      errorDetail: 'conversation_not_found',
    });
  });

  it('conversation.state.set: conversation_not_found (0 rows updated) falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) =>
          sql.includes('UPDATE public.support_conversations SET') && sql.includes('status ='),
        respond: () => ({ rows: [], rowCount: 0 }) as Awaited<ReturnType<DbPort['query']>>,
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'conversation.state.set',
      params: {
        id: 'conv-1',
        conversationId: 'conv-1',
        status: 'closed',
        closedAt: '2025-01-01T12:02:00.000Z',
        closeReason: 'resolved',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.conversation.status.changed');
    expect((ev.payload as Record<string, unknown>).integratorConversationId).toBe('conv-1');
    expect((ev.payload as Record<string, unknown>).status).toBe('closed');
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_conversations',
      errorClass: 'conversation_state_set_direct_write_fallback',
      errorDetail: 'conversation_not_found',
    });
  });

  // D4 (Track D): question.create / question.message.add / question.markAnswered / delivery.attempt.log
  // no longer enqueue an HTTP projection (support.question.created / .message.appended / .answered /
  // support.delivery.attempt.logged) — they write directly to public.support_questions /
  // public.support_question_messages / public.support_delivery_events in a separate best-effort
  // transaction. See writeSupportQuestionsDirect.ts + its own unit tests
  // (writeSupportQuestionsDirect.test.ts) for the resolution/fail-closed coverage; these tests only
  // assert the writePort wiring: no projection enqueued, direct-write SQL issued with the right params.

  it('question.create writes public.support_questions directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.create',
      params: {
        id: 'q-1',
        userIdentityId: '42',
        conversationId: 'conv-1',
        text: 'Help?',
        createdAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO public.support_questions'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      'q-1',
      D3_CONVERSATION_ROW_ID,
      D3_ORG_ID,
      'open',
      '2025-01-01T12:00:00.000Z',
      null,
    ]);
  });

  it('question.message.add writes public.support_question_messages directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.message.add',
      params: {
        id: 'qm-1',
        questionId: 'q-1',
        senderType: 'user',
        messageText: 'Question text',
        createdAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO public.support_question_messages'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      'qm-1',
      D4_QUESTION_ROW_ID,
      D3_ORG_ID,
      'user',
      'Question text',
      '2025-01-01T12:00:00.000Z',
    ]);
  });

  it('question.markAnswered updates public.support_questions status directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.markAnswered',
      params: {
        questionId: 'q-1',
        answeredAt: '2025-01-01T12:05:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const updateCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('UPDATE public.support_questions SET'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual(['q-1', '2025-01-01T12:05:00.000Z']);
  });

  it('delivery.attempt.log writes public.support_delivery_events directly, no projection enqueued', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: {
        intentEventId: 'evt-1',
        correlationId: 'corr-1',
        channel: 'telegram',
        status: 'success',
        attempt: 1,
        organizationId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO public.support_delivery_events'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      null,
      'evt-1',
      'corr-1',
      'telegram',
      'success',
      1,
      null,
      '{}',
      '2025-01-01T12:00:00.000Z',
    ]);
  });

  it('delivery.attempt.log: missing organizationId is legitimately fail-closed — no direct write, no outbox fallback, no incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: {
        intentEventId: 'evt-2',
        channel: 'telegram',
        status: 'failed',
        attempt: 1,
        organizationId: null,
        occurredAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('INSERT INTO public.support_delivery_events'),
    );
    expect(insertCall).toBeUndefined();
    expect(openOrTouchOperatorIncidentMock).not.toHaveBeenCalled();
  });

  // Durability fix (same class as D3's post-merge audit fix): a direct-write failure must NOT silently
  // drop the question/message/answer/delivery-event — it must fall back to the durable outbox and
  // record an operator-visible incident. `conversation_id_required` (question.create with no parent
  // conversation) is the ONE exception: no write, no fallback, no incident (see
  // writeSupportQuestionsDirect.ts header "DURABILITY").

  it('question.create: conversation_not_found falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) =>
          sql.includes('SELECT id::text AS id, organization_id') &&
          sql.includes('FROM public.support_conversations'),
        respond: () => ({ rows: [] }) as Awaited<ReturnType<DbPort['query']>>,
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.create',
      params: {
        id: 'q-1',
        userIdentityId: '42',
        conversationId: 'conv-1',
        text: 'Help?',
        createdAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.question.created');
    expect((ev.payload as Record<string, unknown>).integratorQuestionId).toBe('q-1');
    expect((ev.payload as Record<string, unknown>).integratorUserId).toBe('9001');
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_questions',
      errorClass: 'question_create_direct_write_fallback',
      errorDetail: 'conversation_not_found',
    });
  });

  it('question.create: no conversation id at all is legitimately fail-closed — no outbox fallback, no incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.create',
      params: {
        id: 'q-1',
        userIdentityId: '42',
        conversationId: null,
        text: 'Help?',
        createdAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(0);
    const insertCall = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('INSERT INTO public.support_questions'),
    );
    expect(insertCall).toBeUndefined();
    expect(openOrTouchOperatorIncidentMock).not.toHaveBeenCalled();
  });

  it('question.message.add: question_not_found falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) =>
          sql.includes('SELECT id::text AS id, organization_id') &&
          sql.includes('FROM public.support_questions'),
        respond: () => ({ rows: [] }) as Awaited<ReturnType<DbPort['query']>>,
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.message.add',
      params: {
        id: 'qm-1',
        questionId: 'q-1',
        senderType: 'user',
        messageText: 'Question text',
        createdAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.question.message.appended');
    expect((ev.payload as Record<string, unknown>).integratorQuestionMessageId).toBe('qm-1');
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_questions',
      errorClass: 'question_message_add_direct_write_fallback',
      errorDetail: 'question_not_found',
    });
  });

  it('question.markAnswered: question_not_found falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) => sql.includes('UPDATE public.support_questions SET'),
        respond: () => ({ rows: [], rowCount: 0 }) as Awaited<ReturnType<DbPort['query']>>,
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'question.markAnswered',
      params: {
        questionId: 'q-1',
        answeredAt: '2025-01-01T12:05:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.question.answered');
    expect((ev.payload as Record<string, unknown>).integratorQuestionId).toBe('q-1');
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_questions',
      errorClass: 'question_mark_answered_direct_write_fallback',
      errorDetail: 'question_not_found',
    });
  });

  it('delivery.attempt.log: unexpected direct-write error falls back to the durable outbox + records an operator incident', async () => {
    const capture = {
      projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[],
    };
    const db = makeMockDb(capture, [
      {
        match: (sql) => sql.includes('INSERT INTO public.support_delivery_events'),
        respond: () => {
          throw new Error('simulated deadlock / connection blip');
        },
      },
    ]);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: {
        intentEventId: 'evt-1',
        correlationId: 'corr-1',
        channel: 'telegram',
        status: 'success',
        attempt: 1,
        organizationId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.delivery.attempt.logged');
    expect((ev.payload as Record<string, unknown>).intentEventId).toBe('evt-1');
    expect((ev.payload as Record<string, unknown>).channelCode).toBe('telegram');
    expect((ev.payload as Record<string, unknown>).organizationId).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(openOrTouchOperatorIncidentMock).toHaveBeenCalledTimes(1);
    expect(openOrTouchOperatorIncidentMock.mock.calls[0]![0]).toMatchObject({
      direction: 'db_write',
      integration: 'support_delivery_events',
      errorClass: 'delivery_attempt_log_direct_write_fallback',
    });
  });
});
