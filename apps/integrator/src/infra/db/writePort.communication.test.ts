import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';
import { stubIntegratorDrizzleForTests } from './stubIntegratorDrizzleForTests.js';

describe('writePort communication projection events', () => {
  function makeMockDb(capture: { projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[] }): DbPort {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (
        typeof sql === 'string' &&
        sql.includes('user_id::text AS user_id') &&
        sql.includes('FROM identities') &&
        sql.includes('WHERE id =')
      ) {
        return { rows: [{ user_id: '9001' }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('merged_into_user_id') && sql.includes('FROM users')) {
        return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (typeof sql === 'string' && sql.includes('user_identity_id') && sql.includes('FROM conversations')) {
        return { rows: [{ user_identity_id: '42' }] } as Awaited<ReturnType<DbPort['query']>>;
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

  it('conversation.open enqueues support.conversation.opened', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
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
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.conversation.opened');
    expect((ev.payload as Record<string, unknown>).integratorConversationId).toBe('conv-1');
    expect((ev.payload as Record<string, unknown>).integratorUserId).toBe('9001');
    expect(ev.idempotencyKey.startsWith('support.conversation.opened:conv-1:')).toBe(true);
  });

  it('conversation.message.add enqueues support.conversation.message.appended', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
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
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.conversation.message.appended');
    expect((ev.payload as Record<string, unknown>).integratorMessageId).toBe('msg-1');
    expect((ev.payload as Record<string, unknown>).integratorConversationId).toBe('conv-1');
  });

  it('conversation.state.set enqueues support.conversation.status.changed', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
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
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.conversation.status.changed');
    expect((ev.payload as Record<string, unknown>).integratorConversationId).toBe('conv-1');
    expect((ev.payload as Record<string, unknown>).status).toBe('closed');
  });

  it('question.create enqueues support.question.created', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
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
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.question.created');
    expect((ev.payload as Record<string, unknown>).integratorQuestionId).toBe('q-1');
    expect((ev.payload as Record<string, unknown>).integratorUserId).toBe('9001');
  });

  it('question.message.add enqueues support.question.message.appended', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
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
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.question.message.appended');
    expect((ev.payload as Record<string, unknown>).integratorQuestionMessageId).toBe('qm-1');
  });

  it('question.markAnswered enqueues support.question.answered', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
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
  });

  it('delivery.attempt.log enqueues support.delivery.attempt.logged', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
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
        occurredAt: '2025-01-01T12:00:00.000Z',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe('support.delivery.attempt.logged');
    expect((ev.payload as Record<string, unknown>).intentEventId).toBe('evt-1');
    expect((ev.payload as Record<string, unknown>).channelCode).toBe('telegram');
  });
});
