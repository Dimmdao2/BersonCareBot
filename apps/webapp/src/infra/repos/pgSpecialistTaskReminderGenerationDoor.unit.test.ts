import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';

const fakes = vi.hoisted(() => ({
  runWebappSql: vi.fn(),
  db: { execute: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappSql: fakes.runWebappSql,
  runWebappNamedRoot: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

import { createPgOutgoingDeliveryQueueWritePort } from '@/infra/repos/pgOutgoingDeliveryQueue';
import type { SpecialistTaskReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

const dialect = new PgDialect();
const TASK_ID = 'a83b99cd-2b02-4fe0-b711-9e9ec3240353';
const EVENT_ID = `specialist-task:${TASK_ID}:2026-08-26T10%3A00%3A00%2B03%3A00:telegram`;

/**
 * Транзакция задачи. Реляционные методы drizzle оставлены живыми специально: тест обязан УВИДЕТЬ,
 * если запись в очередь вернётся вторым путём мимо объявленного корня.
 */
function fakeTx() {
  return {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };
}

function delivery(): SpecialistTaskReadyOutgoingDelivery {
  return {
    organizationId: 'a0000000-0000-4000-8000-000000000001',
    eventId: EVENT_ID,
    kind: 'specialist_task_reminder',
    channel: 'telegram',
    successOutcome: { type: 'specialistTask.reminder.markSent', taskId: TASK_ID },
    nextRetryAt: '2026-08-26T07:00:00.000Z',
    intent: {
      type: 'message.send',
      meta: { eventId: EVENT_ID, occurredAt: '2026-08-22T12:49:44.000Z', source: 'telegram' },
      payload: { recipient: { chatId: '364943522' }, message: { text: 'Напоминание' } },
    },
  };
}

function compiled(call: [unknown, SQL]) {
  return dialect.sqlToQuery(call[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('завершение задачи снимает её напоминание объявленным корнем, а не записью в таблицу', async () => {
  fakes.runWebappSql.mockResolvedValue({ rows: [{ result: { writtenEventIds: [] } }] });
  const tx = fakeTx();

  const written = await createPgOutgoingDeliveryQueueWritePort().replaceSpecialistTaskReminderGeneration(
    tx as never,
    { taskId: TASK_ID, deliveries: [], reason: 'SPECIALIST_TASK_REMINDER_CANCELLED' },
  );

  expect(written).toEqual([]);
  // Ровно одно обращение к базе — и это вызов корня, а не DML по очереди. До перевода на корень
  // здесь шёл UPDATE public.outgoing_delivery_queue под `app_staff`, у которого на очереди нет
  // ни одной привилегии: маршрут «Выполнить» отвечал 500.
  expect(fakes.runWebappSql).toHaveBeenCalledTimes(1);
  const { sql: text, params } = compiled(fakes.runWebappSql.mock.calls[0] as [unknown, SQL]);
  expect(text).toContain('app.replace_specialist_task_reminder_generation(');
  expect(text).not.toMatch(/outgoing_delivery_queue/i);
  expect(params).toEqual([TASK_ID, '[]', 'SPECIALIST_TASK_REMINDER_CANCELLED']);
  // Второго пути к строке очереди нет: реляционные операторы транзакции не тронуты.
  expect(tx.insert).not.toHaveBeenCalled();
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.execute).not.toHaveBeenCalled();
  // Корень зовётся НА ТОЙ ЖЕ транзакции, что и запись задачи: иначе задача закрылась бы, а её
  // напоминание осталось бы живым при откате.
  expect(fakes.runWebappSql.mock.calls[0]?.[0]).toBe(tx);
});

it('поколение напоминания едет корнем целиком и получает отпечаток материализации', async () => {
  fakes.runWebappSql
    .mockResolvedValueOnce({ rows: [{ result: { writtenEventIds: [EVENT_ID] } }] })
    .mockResolvedValueOnce({ rows: [{ refreshed: true }] });
  const tx = fakeTx();

  const written = await createPgOutgoingDeliveryQueueWritePort().replaceSpecialistTaskReminderGeneration(
    tx as never,
    { taskId: TASK_ID, deliveries: [delivery()], reason: 'SPECIALIST_TASK_REMINDER_SUPERSEDED' },
  );

  expect(written).toEqual([EVENT_ID]);
  const generation = compiled(fakes.runWebappSql.mock.calls[0] as [unknown, SQL]);
  expect(generation.sql).toContain('app.replace_specialist_task_reminder_generation(');
  expect(JSON.parse(generation.params[1] as string)).toEqual([
    {
      eventId: EVENT_ID,
      channel: 'telegram',
      payloadJson: {
        intent: delivery().intent,
        successOutcome: { type: 'specialistTask.reminder.markSent', taskId: TASK_ID },
        bookkeeping: { botMarkerRequired: true },
      },
      maxAttempts: 6,
      nextRetryAt: '2026-08-26T07:00:00.000Z',
    },
  ]);

  const refresh = compiled(fakes.runWebappSql.mock.calls[1] as [unknown, SQL]);
  expect(refresh.sql).toContain('app.refresh_specialist_task_reminder_materialization(');
  expect(refresh.params).toEqual([EVENT_ID]);
  expect(tx.insert).not.toHaveBeenCalled();
  expect(tx.update).not.toHaveBeenCalled();
});

it('строка без отпечатка материализации роняет транзакцию задачи, а не уезжает в доставку', async () => {
  fakes.runWebappSql
    .mockResolvedValueOnce({ rows: [{ result: { writtenEventIds: [EVENT_ID] } }] })
    .mockResolvedValueOnce({ rows: [{ refreshed: false }] });

  await expect(
    createPgOutgoingDeliveryQueueWritePort().replaceSpecialistTaskReminderGeneration(
      fakeTx() as never,
      { taskId: TASK_ID, deliveries: [delivery()], reason: 'SPECIALIST_TASK_REMINDER_SUPERSEDED' },
    ),
  ).rejects.toThrow('specialist_task_reminder_materialization_refresh_failed');
});

it('корень, не назвавший записанные строки, — отказ, а не молчаливый успех', async () => {
  fakes.runWebappSql.mockResolvedValue({ rows: [{ result: null }] });

  await expect(
    createPgOutgoingDeliveryQueueWritePort().replaceSpecialistTaskReminderGeneration(
      fakeTx() as never,
      { taskId: TASK_ID, deliveries: [], reason: 'SPECIALIST_TASK_REMINDER_DELETED' },
    ),
  ).rejects.toThrow('specialist_task_reminder_generation_invalid');
});
