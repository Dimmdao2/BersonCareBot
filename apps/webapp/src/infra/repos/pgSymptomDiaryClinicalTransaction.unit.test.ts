/**
 * Дневник симптомов внутри клинической транзакции (мост «жалоба врача → симптом пациента»).
 *
 * Ловимые поломки, обе молчаливые:
 *
 * 1. Запись дневника, сделанная из клинической транзакции, уходит отдельным соединением/коммитом.
 *    Тогда откат жалобы оставляет у пациента осиротевшее отслеживание с замером, которого во
 *    врачебной карте уже нет: две карточки одного человека расходятся, и никто об этом не узнаёт.
 * 2. Обратная поломка: SECURITY DEFINER-корень пациента («в моменте» из кабинета) переводят на ту
 *    же транзакционную сессию. `runWebappNamedRoot` физически отказывает на транзакции
 *    («named root must start before the relation transaction») — у пациента ломается сама
 *    возможность добавить запись по симптому, ради которой мост и делался.
 *
 * Oracle — worker-brief `patient-clinical-symptom-bridge-20260908.md` (п. 2 «reuse существующего
 * пути записи», п. 6 fail-closed) и контракт `runWebappNamedRoot` в `infra/db/runWebappSql.ts`.
 *
 * Гарантий RLS/PostgreSQL файл не заявляет: здесь проверяется маршрутизация сессии в приложении.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PATIENT_ID = '22222222-2222-4222-8222-222222222222';
const TRACKING_ID = '55555555-5555-4555-8555-555555555555';

const principal = vi.hoisted(() => ({ kind: 'staff' as 'staff' | 'patient' }));
const fakes = vi.hoisted(() => ({ getDrizzle: vi.fn() }));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: principal.kind }),
  getCurrentDbPrincipalOrganizationId: () => ORGANIZATION_ID,
  portTypedArgsForFunctionIdentity: (_identity: string, args: readonly unknown[]) => args,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: fakes.getDrizzle }));
vi.mock('@/infra/db/portContextRuntime', () => ({
  runWithWebappPortOperation: (_descriptor: unknown, fn: () => unknown) => fn(),
}));

import { runInDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { pgSymptomDiaryPort } from './pgSymptomDiary';

const dialect = new PgDialect();

type Executed = { on: 'pool' | 'transaction'; params: unknown[] };

/**
 * Пул и транзакция — два РАЗНЫХ исполнителя, каждый помечает свои statement'ы. Признак транзакции —
 * `rollback`: ровно по нему `runWebappNamedRoot` отказывает корню пациента.
 */
function fakeSessions(rows: Record<string, unknown>[]) {
  const executed: Executed[] = [];
  const record = (on: 'pool' | 'transaction') => async (fragment: SQL) => {
    executed.push({ on, params: dialect.sqlToQuery(fragment).params });
    return { rows };
  };
  const transactionSession = { execute: record('transaction'), rollback: () => undefined };
  const poolSession = {
    execute: record('pool'),
    transaction: async (fn: (inner: typeof transactionSession) => Promise<unknown>) =>
      fn(transactionSession),
  };
  fakes.getDrizzle.mockReturnValue(poolSession);
  return executed;
}

const STAFF_ENTRY_ROW = {
  id: 'entry-1',
  user_id: PATIENT_ID,
  platform_user_id: PATIENT_ID,
  tracking_id: TRACKING_ID,
  value_0_10: 5,
  entry_type: 'instant',
  recorded_at: '2026-09-08T09:00:00.000Z',
  source: 'webapp',
  notes: null,
  created_at: '2026-09-08T09:00:00.000Z',
  symptom_title: 'Боль в колене',
};

beforeEach(() => {
  vi.clearAllMocks();
  principal.kind = 'staff';
});

describe('дневник симптомов и открытая клиническая транзакция', () => {
  it('врачебная запись severity исполняется на транзакции вызывающего, а не на пуле', async () => {
    const executed = fakeSessions([STAFF_ENTRY_ROW]);

    await runInDrizzleMutationTransaction(async () => {
      await pgSymptomDiaryPort.addEntry({
        userId: PATIENT_ID,
        trackingId: TRACKING_ID,
        value0_10: 5,
        entryType: 'instant',
        recordedAt: '2026-09-08T09:00:00.000Z',
        source: 'webapp',
        notes: null,
      });
    });

    const statements = executed.filter((e) => e.params.includes(TRACKING_ID));
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.every((e) => e.on === 'transaction')).toBe(true);
    // Организация принципала уезжает в САМУ строку замера: без неё арендная стена отказывает
    // записи (проверяем параметры именно этого statement, а не установку контекста транзакции).
    const insert = statements.find((e) => e.params.includes(5));
    expect(insert).toBeDefined();
    expect(insert!.params).toContain(ORGANIZATION_ID);
  });

  it('запись пациента «в моменте» остаётся на SECURITY DEFINER-корне и не переезжает в транзакцию', async () => {
    principal.kind = 'patient';
    const executed = fakeSessions([{ entry: STAFF_ENTRY_ROW }]);

    await runInDrizzleMutationTransaction(async () => {
      await pgSymptomDiaryPort.addEntry({
        userId: PATIENT_ID,
        trackingId: TRACKING_ID,
        value0_10: 3,
        entryType: 'instant',
        recordedAt: '2026-09-08T09:30:00.000Z',
        source: 'webapp',
        notes: null,
      });
    });

    // Корень исполнен, и исполнен именно на пуле: транзакцию он бы отверг с ошибкой контракта.
    // Корень узнаётся по своему транскрипту аргументов (id отслеживания + значение + тип записи),
    // тогда как соседний дочитывающий statement несёт один параметр.
    const namedRoot = executed.filter((e) => e.params.includes(TRACKING_ID) && e.params.length > 1);
    expect(namedRoot).toHaveLength(1);
    expect(namedRoot[0].on).toBe('pool');
  });
});
