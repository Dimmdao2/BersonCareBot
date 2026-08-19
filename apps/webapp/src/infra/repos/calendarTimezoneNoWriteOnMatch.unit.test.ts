/**
 * §34: «Записи в БД, когда они совпадают, нет — только сверка» (владелец, 20.08). Гарантия СИСТЕМНАЯ, а не
 * «экран не пошлёт лишний POST»: маршрут остаётся открытой дверью для второй вкладки, повторной отправки
 * формы и будущего нативного клиента.
 *
 * Отказ, который ловит тест: путь пациента идёт через definer-функцию
 * `app.set_current_patient_calendar_timezone(value, false)`, а она сравнения со старым значением НЕ делает и
 * двигает `updated_at` при каждом вызове (доказано живым прогоном на DEV, см.
 * `docs/REPORTS/TIMEZONE_RULE_34_AUDIT_2026-08-19.md`, находка 1). У сотрудника то же условие стоит прямо
 * в `WHERE`, поэтому там отказа нет — и именно эта асимметрия и была дефектом.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappSql = vi.fn(async () => ({ rows: [{ updated: true }] }));
const selectChain = { calendarTimezone: 'Europe/Moscow' as string | null };

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappSql,
  getWebappSqlDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [selectChain] }) }),
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => [{ id: 'user-1' }] }) }),
    }),
  }),
}));
vi.mock('@bersoncare/db-principal', () => ({ getCurrentDbPrincipal: () => ({ kind: 'patient' }) }));
vi.mock('@/infra/db/saasIsolationOperationContext', () => ({
  runWithWebappDbOperationFamily: async (_family: string, fn: () => unknown) => fn(),
}));

const { syncCalendarTimezoneFromDevice } = await import('./pgPatientCalendarTimezone');

describe('пояс пациента: запись только при расхождении', () => {
  beforeEach(() => {
    runWebappSql.mockClear();
    selectChain.calendarTimezone = 'Europe/Moscow';
  });

  it('совпало с устройством — в базу не идёт ни одного запроса на запись', async () => {
    const changed = await syncCalendarTimezoneFromDevice('user-1', 'Europe/Moscow');
    expect(changed).toBe(false);
    expect(runWebappSql).not.toHaveBeenCalled();
  });

  it('человек переехал — запись идёт', async () => {
    const changed = await syncCalendarTimezoneFromDevice('user-1', 'Asia/Novosibirsk');
    expect(changed).toBe(true);
    expect(runWebappSql).toHaveBeenCalledTimes(1);
  });

  it('пояса ещё нет — запись идёт', async () => {
    selectChain.calendarTimezone = null;
    const changed = await syncCalendarTimezoneFromDevice('user-1', 'Europe/Moscow');
    expect(changed).toBe(true);
    expect(runWebappSql).toHaveBeenCalledTimes(1);
  });
});
