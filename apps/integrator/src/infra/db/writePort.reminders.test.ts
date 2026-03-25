import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  REMINDER_RULE_UPSERTED,
  REMINDER_OCCURRENCE_FINALIZED,
  REMINDER_DELIVERY_LOGGED,
  CONTENT_ACCESS_GRANTED,
} from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

describe('writePort reminder/content projection events', () => {
  function makeMockDb(capture: {
    projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[];
  }): DbPort {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('projection_outbox')) {
        const [eventType, idempotencyKey, _occurredAt, payloadJson] = params as [string, string, string, string];
        let payload: unknown = {};
        try {
          payload = JSON.parse(payloadJson) as Record<string, unknown>;
        } catch {
          // ignore
        }
        capture.projectionInserts.push({ eventType, idempotencyKey, payload });
        return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
      }
      if (
        typeof sql === 'string' &&
        sql.includes('user_reminder_occurrences') &&
        sql.includes('user_reminder_rules')
      ) {
        const occurrenceId = (params as string[])[0];
        const status = occurrenceId === 'occ-2' ? 'failed' : 'sent';
        return {
          rows: [
            {
              rule_id: 'rule-1',
              user_id: '42',
              category: 'exercise',
              status,
              sent_at: status === 'sent' ? '2025-01-01T12:00:00.000Z' : null,
              failed_at: status === 'failed' ? '2025-01-01T12:00:00.000Z' : null,
              delivery_channel: 'telegram',
              error_code: status === 'failed' ? 'timeout' : null,
            },
          ],
        } as Awaited<ReturnType<DbPort['query']>>;
      }
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => {
      return fn({ query, tx } as DbPort);
    });
    return { query, tx } as DbPort;
  }

  it('reminders.rule.upsert enqueues reminder.rule.upserted', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'reminders.rule.upsert',
      params: {
        id: 'rule-1',
        userId: '42',
        category: 'exercise',
        isEnabled: true,
        scheduleType: 'daily',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask: '1111111',
        contentMode: 'none',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(REMINDER_RULE_UPSERTED);
    expect((ev.payload as Record<string, unknown>).integratorRuleId).toBe('rule-1');
    expect(ev.idempotencyKey.startsWith(`${REMINDER_RULE_UPSERTED}:rule-1:`)).toBe(true);
  });

  it('reminders.occurrence.markSent enqueues reminder.occurrence.finalized', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'reminders.occurrence.markSent',
      params: { occurrenceId: 'occ-1', channel: 'telegram' },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(REMINDER_OCCURRENCE_FINALIZED);
    expect((ev.payload as Record<string, unknown>).integratorOccurrenceId).toBe('occ-1');
    expect((ev.payload as Record<string, unknown>).status).toBe('sent');
  });

  it('reminders.occurrence.markFailed enqueues reminder.occurrence.finalized', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'reminders.occurrence.markFailed',
      params: { occurrenceId: 'occ-2', channel: 'telegram', errorCode: 'timeout' },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(REMINDER_OCCURRENCE_FINALIZED);
    expect((ev.payload as Record<string, unknown>).status).toBe('failed');
  });

  it('reminders.delivery.log enqueues reminder.delivery.logged', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'reminders.delivery.log',
      params: {
        id: 'log-1',
        occurrenceId: 'occ-1',
        channel: 'telegram',
        status: 'success',
        payloadJson: { msg: 'ok' },
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(REMINDER_DELIVERY_LOGGED);
    expect((ev.payload as Record<string, unknown>).integratorDeliveryLogId).toBe('log-1');
  });

  it('content.access.grant.create enqueues content.access.granted', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'content.access.grant.create',
      params: {
        id: 'grant-1',
        userId: '42',
        contentId: 'content-1',
        purpose: 'view',
        expiresAt: '2026-01-01T00:00:00.000Z',
        tokenHash: 'abc',
        metaJson: {},
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(CONTENT_ACCESS_GRANTED);
    expect((ev.payload as Record<string, unknown>).integratorGrantId).toBe('grant-1');
  });

  it('reminder.rule.upsert idempotency key is deterministic', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'reminders.rule.upsert',
      params: {
        id: 'rule-2',
        userId: '43',
        category: 'water',
        isEnabled: false,
        scheduleType: 'twice_daily',
        timezone: 'UTC',
        intervalMinutes: 120,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask: '1111111',
        contentMode: 'none',
      },
    });
    await writePort.writeDb({
      type: 'reminders.rule.upsert',
      params: {
        id: 'rule-2',
        userId: '43',
        category: 'water',
        isEnabled: false,
        scheduleType: 'twice_daily',
        timezone: 'UTC',
        intervalMinutes: 120,
        windowStartMinute: 0,
        windowEndMinute: 1440,
        daysMask: '1111111',
        contentMode: 'none',
      },
    });
    const key = capture.projectionInserts[0]!.idempotencyKey;
    const keySecond = capture.projectionInserts[1]!.idempotencyKey;
    expect(key).toBe(keySecond);
    expect(key.startsWith(REMINDER_RULE_UPSERTED)).toBe(true);
  });
});
