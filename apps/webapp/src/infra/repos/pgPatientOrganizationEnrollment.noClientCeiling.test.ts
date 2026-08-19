import { describe, expect, it, vi } from 'vitest';
import { ensureInvitedOrganizationClientRelationship } from './pgPatientOrganizationEnrollment';

/**
 * Т12 (владелец 19.08, дословно): «лимит клиентов - убрать».
 *
 * Это самый нижний этаж, на котором раньше стоял потолок: перед вставкой новой связи
 * `ensureInvitedOrganizationClientRelationship` брал advisory-lock `saas_quota:patient_count:<org>`,
 * пересчитывал `org_enrollments` и бросал `StockQuotaReachedError`, если число тарифа исчерпано.
 *
 * Тест проверяет ПОВЕДЕНИЕ записи, а не отсутствие строки в коде: фейковый `tx` считает КАЖДЫЙ
 * `execute` (advisory-lock и пересчёт идут только через него) и отвечает «связи ещё нет», сколько
 * бы клиентов у клиники уже ни было. Если потолок вернётся в любой форме — через порт квот или
 * руками, — он обязан будет и залочиться, и пересчитать; оба следа тут ловятся.
 */
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PLATFORM_USER_ID = '33333333-3333-4333-8333-333333333333';

function fakeTx(existingRelationship: { status: string } | null) {
  const executed: string[] = [];
  const inserted: unknown[] = [];
  let found = existingRelationship;
  const tx = {
    execute: vi.fn(async (query: unknown) => {
      executed.push(JSON.stringify(query));
      return { rows: [] };
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (found ? [found] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (row: unknown) => ({
        onConflictDoNothing: async () => {
          inserted.push(row);
          found = { status: 'invited' };
        },
      }),
    }),
  };
  return { tx, executed, inserted };
}

describe('ensureInvitedOrganizationClientRelationship — у клиники нет потолка по клиентам', () => {
  // «При любом числе уже существующих пациентов»: число тут вообще не участвует в решении —
  // писатель ни разу не спрашивает базу, сколько их. Прогон повторяется, чтобы «сотый» клиент
  // проходил тем же путём, что и первый.
  it.each([0, 1, 42, 10_000])(
    'заводит связь без единого SQL-обращения к счётчику (клиника уже с %i клиентами)',
    async (alreadyEnrolled) => {
      const { tx, executed, inserted } = fakeTx(null);

      const status = await ensureInvitedOrganizationClientRelationship(
        tx as any,
        ORGANIZATION_ID,
        PLATFORM_USER_ID,
      );

      expect(status).toBe('invited');
      expect(inserted).toEqual([
        { organizationId: ORGANIZATION_ID, platformUserId: PLATFORM_USER_ID, status: 'invited' },
      ]);
      // Ни advisory-lock под квоту, ни пересчёт `org_enrollments` — вообще ни одного raw-запроса.
      expect(executed).toEqual([]);
      expect(alreadyEnrolled).toBeGreaterThanOrEqual(0);
    },
  );

  it('уже заведённая связь остаётся как есть и тоже ничего не пересчитывает', async () => {
    const { tx, executed, inserted } = fakeTx({ status: 'active' });

    const status = await ensureInvitedOrganizationClientRelationship(
      tx as any,
      ORGANIZATION_ID,
      PLATFORM_USER_ID,
    );

    expect(status).toBe('active');
    expect(inserted).toEqual([]);
    expect(executed).toEqual([]);
  });
});
