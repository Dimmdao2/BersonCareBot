import { getCurrentDbPrincipal, runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

vi.mock('../../db/repos/outgoingDeliveryQueue.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../db/repos/outgoingDeliveryQueue.js')>();
  return {
    ...mod,
    markOutgoingDeliverySent: vi.fn().mockResolvedValue(undefined),
    markOutgoingDeliveryDead: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../db/runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn().mockResolvedValue({ rows: [{ status: 'queued' }] }),
}));

vi.mock('../../db/repos/userChannelBotBlocked.js', () => ({
  markUserChannelBotBlocked: vi.fn().mockResolvedValue(undefined),
  clearUserChannelBotBlocked: vi.fn().mockResolvedValue(undefined),
  resolvePlatformUserIdForBotBlockedMarker: vi.fn().mockReturnValue('u1'),
}));

vi.mock('../../db/repos/operatorHealthDrizzle.js', () => ({
  getOperatorIncidentAlertState: vi.fn().mockResolvedValue(null),
  markOperatorIncidentAlertSent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../db/repos/outgoingDeliveryScope.js', () => ({
  resolveOutgoingDeliveryScope: vi.fn(),
  operatorIncidentAlertAlreadySent: vi.fn().mockResolvedValue(false),
  markOperatorIncidentAlertSent: vi.fn().mockResolvedValue(undefined),
}));

import type { OutgoingDeliveryQueueRow } from '../../db/repos/outgoingDeliveryQueue.js';
import { processClaimedOutgoingDeliveryRow, processOutgoingDeliveryRow } from './outgoingDeliveryWorker.js';
import { markOutgoingDeliveryDead, markOutgoingDeliverySent } from '../../db/repos/outgoingDeliveryQueue.js';
import { RecipientBlockedBotError } from '../../delivery/recipientBotBlocked.js';
import * as doctorBroadcastIntentMenu from './doctorBroadcastIntentMenu.js';
import { drizzleSqlFragmentToApproximateSql } from '../../db/drizzleSqlDebugText.js';
import { runIntegratorSql } from '../../db/runIntegratorSql.js';
import { clearUserChannelBotBlocked } from '../../db/repos/userChannelBotBlocked.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';
import { resolveOutgoingDeliveryScope } from '../../db/repos/outgoingDeliveryScope.js';

function baseRow(overrides: Partial<OutgoingDeliveryQueueRow>): OutgoingDeliveryQueueRow {
  return {
    id: 'q1',
    eventId: 'ev1',
    kind: 'reminder_dispatch',
    channel: 'max',
    payloadJson: {},
    status: 'processing',
    attemptCount: 0,
    maxAttempts: 3,
    nextRetryAt: new Date().toISOString(),
    lastAttemptAt: null,
    sentAt: null,
    deadAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeTxDb(): DbPort {
  const query = vi.fn().mockResolvedValue({ rows: [] }) as DbPort['query'];
  const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) =>
    fn({ query, tx, integratorDrizzle: {} } as DbPort),
  ) as DbPort['tx'];
  return { query, tx } as DbPort;
}

describe('claimed row tenant handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [{ status: 'queued' }] });
  });

  it('runs delivery/business work under organization and queue finalization back under delivery capability', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    vi.mocked(resolveOutgoingDeliveryScope).mockResolvedValue({
      kind: 'tenant',
      queueKind: 'reminder_dispatch',
      organizationId,
    });
    const dispatchPrincipals: unknown[] = [];
    const queuePrincipals: unknown[] = [];
    vi.mocked(markOutgoingDeliverySent).mockImplementation(async () => {
      queuePrincipals.push(getCurrentDbPrincipal());
    });
    const row = baseRow({
      id: '11111111-1111-4111-8111-111111111111',
      payloadJson: {
        occurrenceId: '22222222-2222-4222-8222-222222222222',
        channel: 'max',
        deliveryLogId: 'delivery-log',
        externalId: '200',
        logText: 'test',
        intent: {
          type: 'message.send',
          meta: { eventId: 'event', occurredAt: '2026-07-16T10:00:00.000Z', source: 'max' },
          payload: { recipient: { chatId: 200 } },
        },
      },
    });

    await runWithDbInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      processClaimedOutgoingDeliveryRow(row, {
        db: {} as DbPort,
        writePort: { writeDb: vi.fn().mockResolvedValue(undefined) } as never,
        dispatchOutgoing: vi.fn(async () => {
          dispatchPrincipals.push(getCurrentDbPrincipal());
          return { maxMessageId: 'message-id' };
        }),
      }),
    );

    expect(dispatchPrincipals).toEqual([{ kind: 'organization', organizationId }]);
    expect(queuePrincipals).toEqual([{ kind: 'infra', source: 'worker:outgoing-delivery-tick' }]);
  });

  it('quarantines unresolved tenant work before any external send', async () => {
    vi.mocked(resolveOutgoingDeliveryScope).mockResolvedValue({
      kind: 'invalid',
      queueKind: 'reminder_dispatch',
      reason: 'organization_missing',
    });
    const dispatchOutgoing = vi.fn();
    await runWithDbInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      processClaimedOutgoingDeliveryRow(
        baseRow({ id: '11111111-1111-4111-8111-111111111111' }),
        { db: {} as DbPort, writePort: {} as never, dispatchOutgoing },
      ),
    );
    expect(dispatchOutgoing).not.toHaveBeenCalled();
    expect(markOutgoingDeliveryDead).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111',
      'TENANT_SCOPE_ORGANIZATION_MISSING',
    );
  });
});

describe('reminder_dispatch outgoing delivery row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [{ status: 'queued' }] });
  });

  it('max: stale delete then send; logs maxMessageId on success', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') return {};
      if (intent.type === 'message.send') return { maxMessageId: 'mid-new' };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'max',
        payloadJson: {
          occurrenceId: 'occ-1',
          channel: 'max',
          deliveryLogId: 'rdl:occ-1:max',
          externalId: '200',
          logText: '<b>x</b>',
          deleteBeforeSendMessageId: 'stale-mid',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 200 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      meta: { source: 'max' },
      payload: { messageId: 'stale-mid' },
    });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      maxMessageId: 'mid-new',
    });
  });

  it('telegram: accepts legacy deleteBeforeSendTelegramMessageId', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') return {};
      if (intent.type === 'message.send') return { telegramMessageId: 99 };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'telegram',
        payloadJson: {
          occurrenceId: 'occ-2',
          channel: 'telegram',
          deliveryLogId: 'rdl:occ-2:telegram',
          externalId: '42',
          logText: 't',
          deleteBeforeSendTelegramMessageId: 55,
          intent: {
            type: 'message.send',
            meta: { eventId: 'e2', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
            payload: {
              recipient: { chatId: 42 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      payload: { messageId: 55 },
    });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      telegramMessageId: '99',
    });
  });

  it('telegram: deleteBeforeSendMessageId (unified string) before send', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') return {};
      if (intent.type === 'message.send') return { telegramMessageId: 2002 };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'telegram',
        payloadJson: {
          occurrenceId: 'occ-tg-unified',
          channel: 'telegram',
          deliveryLogId: 'rdl:occ-tg-unified:telegram',
          externalId: '99',
          logText: 'rem',
          deleteBeforeSendMessageId: '88',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e-tg-u', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
            payload: {
              recipient: { chatId: 99 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      payload: { messageId: 88, recipient: { chatId: 99 } },
    });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
  });

  it('max: without stale id dispatches send only once and logs success', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.send') return { maxMessageId: 'mid-only-send' };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'max',
        payloadJson: {
          occurrenceId: 'occ-no-stale',
          channel: 'max',
          deliveryLogId: 'rdl:occ-no-stale:max',
          externalId: '300',
          logText: '<b>r</b>',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e3', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 300 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({ maxMessageId: 'mid-only-send' });
    expect(clearUserChannelBotBlocked).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ channel: 'max', platformUserId: 'u1', externalId: '300' }),
    );
  });

  it('max: stale delete throws but send still runs and logs maxMessageId', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') throw new Error('delete failed');
      if (intent.type === 'message.send') return { maxMessageId: 'mid-after-soft-fail' };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'max',
        payloadJson: {
          occurrenceId: 'occ-del-fail',
          channel: 'max',
          deliveryLogId: 'rdl:occ-del-fail:max',
          externalId: '400',
          logText: '<b>x</b>',
          deleteBeforeSendMessageId: 'stale-bad',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e4', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 400 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({ type: 'message.delete' });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      maxMessageId: 'mid-after-soft-fail',
    });
  });

  it('telegram: stale delete throws but send still runs and logs telegramMessageId', async () => {
    const dispatchOutgoing = vi.fn().mockImplementation(async (intent: { type: string }) => {
      if (intent.type === 'message.delete') throw new Error('tg delete failed');
      if (intent.type === 'message.send') return { telegramMessageId: 1001 };
      return {};
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'telegram',
        payloadJson: {
          occurrenceId: 'occ-tg-del-fail',
          channel: 'telegram',
          deliveryLogId: 'rdl:occ-tg-del-fail:telegram',
          externalId: '500',
          logText: 't',
          deleteBeforeSendMessageId: '77',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e5', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram', userId: 'u1' },
            payload: {
              recipient: { chatId: 500 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      type: 'message.delete',
      payload: { messageId: 77 },
    });
    expect(dispatchOutgoing.mock.calls[1]?.[0]).toMatchObject({ type: 'message.send' });
    const logCall = writeDb.mock.calls.find((c) => c[0]?.type === 'reminders.delivery.log');
    expect(logCall?.[0]?.params?.payloadJson).toMatchObject({
      telegramMessageId: '1001',
    });
  });

  it('skips dead-finalize reminder writes when occurrence is already missing', async () => {
    const dispatchOutgoing = vi.fn().mockRejectedValue(new Error('provider hard-fail'));
    const writeDb = vi.fn().mockResolvedValue(undefined);
    vi.mocked(runIntegratorSql)
      // First read (before send): queued
      .mockResolvedValueOnce({ rows: [{ status: 'queued' }] })
      // Notification delivery attempt best-effort insert
      .mockResolvedValueOnce({ rows: [] })
      // markOutgoingDeliveryDead
      .mockResolvedValueOnce({ rows: [] })
      // Second read (finalize dead): occurrence deleted meanwhile
      .mockResolvedValueOnce({ rows: [] });
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        id: 'q-missing-occ',
        eventId: 'ev-missing-occ',
        channel: 'telegram',
        attemptCount: 1,
        maxAttempts: 1,
        payloadJson: {
          occurrenceId: 'occ-missing',
          channel: 'telegram',
          deliveryLogId: 'rdl:occ-missing:telegram',
          externalId: '501',
          logText: 'late fail',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e6', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
            payload: {
              recipient: { chatId: 501 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb } as never, dispatchOutgoing },
    );
    expect(writeDb).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reminders.delivery.log' }),
    );
    expect(writeDb).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'reminders.occurrence.markFailed' }),
    );
  });

  it('runs reminder scoped writes under occurrence organization and queue status without context', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const writeContexts: Array<string | undefined> = [];
    const attemptContexts: Array<string | undefined> = [];
    const queueContexts: Array<string | undefined> = [];
    vi.mocked(runIntegratorSql).mockImplementation(async (_db, fragment) => {
      const sqlText = drizzleSqlFragmentToApproximateSql(fragment);
      if (sqlText.includes('status::text AS status')) {
        return { rows: [{ status: 'queued' }] };
      }
      if (sqlText.includes('COALESCE(o.organization_id, r.organization_id)')) {
        return { rows: [{ organization_id: organizationId }] };
      }
      if (sqlText.includes('notification_delivery_attempts')) {
        attemptContexts.push(getCurrentOrganizationPrincipalId());
      }
      return { rows: [] };
    });
    vi.mocked(markOutgoingDeliverySent).mockImplementation(async () => {
      queueContexts.push(getCurrentOrganizationPrincipalId());
    });
    const dispatchOutgoing = vi.fn().mockResolvedValue({ maxMessageId: 'mid-org' });
    const writeDb = vi.fn(async () => {
      writeContexts.push(getCurrentOrganizationPrincipalId());
    });

    await processOutgoingDeliveryRow(
      baseRow({
        channel: 'max',
        payloadJson: {
          occurrenceId: 'occ-org',
          channel: 'max',
          deliveryLogId: 'rdl:occ-org:max',
          externalId: '200',
          topicCode: 'exercise_reminders',
          logText: 'reminder text',
          intent: {
            type: 'message.send',
            meta: { eventId: 'e-org', occurredAt: '2026-01-01T00:00:00.000Z', source: 'max', userId: 'u1' },
            payload: {
              recipient: { chatId: 200 },
              message: { text: 'Hi' },
              delivery: { channels: ['max'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: makeTxDb(), writePort: { writeDb } as never, dispatchOutgoing },
    );

    expect(writeContexts).toEqual([organizationId, organizationId]);
    expect(attemptContexts).toEqual([organizationId]);
    expect(queueContexts).toEqual([undefined]);
  });
});


describe('doctor_broadcast_intent outgoing delivery row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [{ status: 'queued' }] });
  });

  it('success: dispatch, mark sent, increment broadcast_audit.sent_count', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const auditId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          broadcastAuditId: auditId,
          clientUserId: 'u1',
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'e-d',
              occurredAt: '2026-01-01T00:00:00.000Z',
              source: 'telegram',
              userId: 'u1',
            },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(markOutgoingDeliverySent).toHaveBeenCalled();
    const sqlText = vi.mocked(runIntegratorSql).mock.calls
      .map((c) => drizzleSqlFragmentToApproximateSql(c[1]))
      .join('\n');
    expect(sqlText).toContain('broadcast_audit');
    expect(runIntegratorSql).toHaveBeenCalled();
  });

  it('doctor broadcast blocked: increments blocked_recipient_count not error_count', async () => {
    const dispatchOutgoing = vi.fn().mockRejectedValue(
      new RecipientBlockedBotError('telegram', 'bot was blocked by the user'),
    );
    const auditId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          broadcastAuditId: auditId,
          clientUserId: 'u1',
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'e-blocked',
              occurredAt: '2026-01-01T00:00:00.000Z',
              source: 'telegram',
              userId: 'u1',
            },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );
    expect(markOutgoingDeliveryDead).toHaveBeenCalledWith(
      db,
      'q1',
      expect.stringContaining('RECIPIENT_BLOCKED_BOT'),
      'recipient_blocked_bot',
    );
    const sqlText = vi.mocked(runIntegratorSql).mock.calls
      .map((c) => drizzleSqlFragmentToApproximateSql(c[1]))
      .join('\n');
    expect(sqlText).toContain('blocked_recipient_count');
    expect(sqlText).not.toContain('error_count = error_count + 1');
  });

  it('missing broadcastAuditId: marks dead without dispatch', async () => {
    const dispatchOutgoing = vi.fn();
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          intent: {
            type: 'message.send',
            meta: { eventId: 'e1', occurredAt: '2026-01-01T00:00:00.000Z', source: 'telegram' },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).not.toHaveBeenCalled();
    expect(markOutgoingDeliveryDead).toHaveBeenCalledWith(db, 'q1', 'MISSING_BROADCAST_AUDIT_ID');
  });

  it('calls menu enricher when doctorBroadcastMenu deps provided', async () => {
    const spy = vi.spyOn(doctorBroadcastIntentMenu, 'enrichDoctorBroadcastIntentIfNeeded').mockImplementation(
      async ({ intent }) => ({
        ...intent,
        payload: {
          ...(intent as { payload: Record<string, unknown> }).payload,
          replyMarkup: { testMenu: true },
        },
      }),
    );
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const auditId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          attachMenu: true,
          broadcastAuditId: auditId,
          clientUserId: 'u1',
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'e-d',
              occurredAt: '2026-01-01T00:00:00.000Z',
              source: 'telegram',
              userId: 'u1',
            },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      {
        db: db as never,
        writePort: { writeDb: vi.fn() } as never,
        dispatchOutgoing,
        doctorBroadcastMenu: {
          templatePort: {} as never,
          contentPort: {} as never,
          sendMenuOnButtonPress: true,
        },
      },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      payload: { replyMarkup: { testMenu: true } },
    });
    spy.mockRestore();
  });

  it('runs broadcast audit and notification attempts under audit organization and queue status without context', async () => {
    const organizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const auditContexts: Array<string | undefined> = [];
    const attemptContexts: Array<string | undefined> = [];
    const queueContexts: Array<string | undefined> = [];
    vi.mocked(runIntegratorSql).mockImplementation(async (_db, fragment) => {
      const sqlText = drizzleSqlFragmentToApproximateSql(fragment);
      if (sqlText.includes('FROM public.broadcast_audit')) {
        return { rows: [{ organization_id: organizationId }] };
      }
      if (sqlText.includes('notification_delivery_attempts')) {
        attemptContexts.push(getCurrentOrganizationPrincipalId());
      }
      if (sqlText.includes('UPDATE public.broadcast_audit SET sent_count')) {
        auditContexts.push(getCurrentOrganizationPrincipalId());
      }
      return { rows: [] };
    });
    vi.mocked(markOutgoingDeliverySent).mockImplementation(async () => {
      queueContexts.push(getCurrentOrganizationPrincipalId());
    });
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const auditId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'doctor_broadcast_intent',
        channel: 'telegram',
        payloadJson: {
          broadcastAuditId: auditId,
          clientUserId: 'u1',
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'e-d-org',
              occurredAt: '2026-01-01T00:00:00.000Z',
              source: 'telegram',
              userId: 'u1',
            },
            payload: {
              recipient: { chatId: 1 },
              message: { text: 'Hi' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: makeTxDb(), writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );

    expect(attemptContexts).toEqual([organizationId]);
    expect(auditContexts).toEqual([organizationId]);
    expect(queueContexts).toEqual([undefined]);
  });
});

describe('operator_alert outgoing delivery row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [{ status: 'queued' }] });
  });

  it('success uses only global operator accessors and does not touch tenant channel markers', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const db = {};
    await processOutgoingDeliveryRow(
      baseRow({
        kind: 'operator_alert',
        channel: 'telegram',
        payloadJson: {
          incidentId: 'inc-1',
          intent: {
            type: 'message.send',
            meta: {
              eventId: 'e-op',
              occurredAt: '2026-01-01T00:00:00.000Z',
              source: 'telegram',
              userId: 'u-op',
            },
            payload: {
              recipient: { chatId: 9001 },
              message: { text: 'alert' },
              delivery: { channels: ['telegram'], maxAttempts: 1 },
            },
          },
        },
      }),
      { db: db as never, writePort: { writeDb: vi.fn() } as never, dispatchOutgoing },
    );
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(clearUserChannelBotBlocked).not.toHaveBeenCalled();
    expect(markOutgoingDeliverySent).toHaveBeenCalled();
  });
});
