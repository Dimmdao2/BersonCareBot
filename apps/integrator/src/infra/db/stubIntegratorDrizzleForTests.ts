/**
 * Минимальная заглушка Drizzle для unit-тестов с фиктивным `DbPort`:
 * репозитории вызывают `getIntegratorDrizzleSession(port)` и не должны
 * падать на реальный пул, если на `port` нет боевого `integratorDrizzle`.
 */
export type ProjectionOutboxInsertCapture = {
  projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[];
};

function insertValuesChain(vals: Record<string, unknown>, capture?: ProjectionOutboxInsertCapture) {
  const done = Promise.resolve(undefined);
  if (capture && 'eventType' in vals && 'idempotencyKey' in vals) {
    capture.projectionInserts.push({
      eventType: String(vals.eventType),
      idempotencyKey: String(vals.idempotencyKey),
      payload: vals.payload as Record<string, unknown>,
    });
  }
  return {
    onConflictDoNothing: () => done,
    onConflictDoUpdate: () => done,
    then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      done.then(onFulfilled as never, onRejected),
  };
}

/**
 * @param capture — если задан, `insert().values()` для projection_outbox наполняет `projectionInserts`
 * (замена перехвата `db.query` с `INSERT INTO projection_outbox`).
 */
export function stubIntegratorDrizzleForTests(capture?: ProjectionOutboxInsertCapture): unknown {
  return {
    insert: () => ({
      values: (vals: Record<string, unknown>) => insertValuesChain(vals, capture),
    }),
    execute: () => Promise.resolve({ rows: [] as unknown[] }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(undefined),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(undefined),
    }),
  };
}
