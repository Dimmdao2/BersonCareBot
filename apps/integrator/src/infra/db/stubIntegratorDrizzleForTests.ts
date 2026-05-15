import { vi } from 'vitest';
import { projectionOutbox } from './schema/integratorQueues.js';

/**
 * Минимальная заглушка Drizzle для unit-тестов с фиктивным `DbPort`:
 * репозитории вызывают `getIntegratorDrizzleSession(port)` и не должны
 * падать на реальный пул, если на `port` нет боевого `integratorDrizzle`.
 */
export type ProjectionOutboxInsertCapture = {
  projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[];
};

function insertValuesChain(
  table: unknown,
  vals: Record<string, unknown>,
  capture?: ProjectionOutboxInsertCapture,
) {
  const done = Promise.resolve(undefined);
  if (capture && table === projectionOutbox && 'eventType' in vals && 'idempotencyKey' in vals) {
    capture.projectionInserts.push({
      eventType: String(vals.eventType),
      idempotencyKey: String(vals.idempotencyKey),
      payload: vals.payload as Record<string, unknown>,
    });
  }
  const afterConflict = {
    returning: <T>() =>
      Promise.resolve([
        {
          updated_at: '2025-01-01T00:00:00.000Z',
          created_at: '2025-01-01T00:00:00.000Z',
        },
      ] as T[]),
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      done.then(onFulfilled as never, onRejected),
  };
  return {
    onConflictDoNothing: () => done,
    onConflictDoUpdate: () => afterConflict,
    returning: <T>() =>
      Promise.resolve([
        {
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ] as T[]),
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      done.then(onFulfilled as never, onRejected),
  };
}

/** После `.from()` / join — `where` / `orderBy` / `limit` (цепочки reminders и др.). */
const selectAfterFrom = {
  innerJoin: () => selectAfterFrom,
  leftJoin: () => selectAfterFrom,
  where: () => selectAfterFrom,
  orderBy: () => Promise.resolve([] as unknown[]),
  limit: () => Promise.resolve([] as unknown[]),
};

/**
 * @param capture — если задан, `insert(projectionOutbox).values()` наполняет `projectionInserts`
 * (замена перехвата `db.query` с `INSERT INTO projection_outbox`).
 */
export function stubIntegratorDrizzleForTests(capture?: ProjectionOutboxInsertCapture): unknown {
  return {
    insert: (table: unknown) => ({
      values: (vals: Record<string, unknown>) => insertValuesChain(table, vals, capture),
    }),
    execute: vi.fn(() => Promise.resolve({ rows: [] as unknown[] })),
    select: () => ({
      from: () => selectAfterFrom,
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: 'x' }]),
        }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(undefined),
    }),
  };
}
