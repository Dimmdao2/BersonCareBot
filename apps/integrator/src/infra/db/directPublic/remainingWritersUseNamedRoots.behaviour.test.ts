/**
 * D17 шаг 2b — поведение реляционного писателя `public.user_channel_bindings` (метка «бот
 * заблокирован»), доступного через chokepoint `writeDirectPublic` (третий, `operatorHealthDrizzle`,
 * зовёт корень без внедряемого `DbPort` и проверяется в
 * `../repos/operatorHealthUsesNamedRootsOnly.behaviour.test.ts`).
 *
 * Предмет проверки тот же, что у шага 1: НАБЛЮДАЕМЫЙ выход слоя записи — какой оператор реально
 * уходит в базу, с каким позиционным набором аргументов и ПОД КАКИМ принципалом. Заглушка одна и
 * она на границе (`DbPort`); всё остальное — настоящий код живого маршрута.
 *
 * Что тест обязан ловить (арбитры прогнаны руками):
 *   • вернуть реляционный `INSERT`/`UPDATE` по канонной таблице вместо корня — красный на «в базу
 *     ушёл не корень»;
 *   • переставить аргументы корня местами — красный на позиционном наборе;
 *   • снять обёртку принципала или подставить чужую организацию — красный на `principalAtCall`
 *     и на аргументе организации.
 *
 * Второй писатель, ранее покрытый здесь же (`recordMessengerPhoneBindBlocked`, разбор конфликта
 * привязки номера), удалён вместе с `user.phone.link` (identity cleanup 2026-08-26) — webapp
 * owns the confirmed-phone write end-to-end, integrator no longer decides or records a merge
 * conflict under any name.
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { RECIPIENT_BLOCKED_BOT_REASON } from '../../delivery/recipientBotBlocked.js';
import { runWithInfraPrincipal, runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';
import { getCurrentDatabasePrincipal } from '../../principal/organizationPrincipal.js';
import {
  clearUserChannelBotBlocked,
  markUserChannelBotBlocked,
} from '../repos/userChannelBotBlocked.js';

const ORG_ROW = 'a0000000-0000-4000-8000-0000000000a1';
const ORG_OTHER = 'b0000000-0000-4000-8000-0000000000b2';
const PLATFORM_USER = 'c0000000-0000-4000-8000-0000000000c3';

type Executed = {
  text: string;
  params: unknown[];
  principalKind: string | undefined;
  principalOrganizationId: string | undefined;
};

function recordingDb(row: Record<string, unknown> = {}): { db: DbPort; executed: Executed[] } {
  const executed: Executed[] = [];
  const db: DbPort = {
    async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const principal = getCurrentDatabasePrincipal() as
        | { kind?: string; organizationId?: string }
        | undefined;
      executed.push({
        text,
        params,
        principalKind: principal?.kind,
        principalOrganizationId: principal?.organizationId,
      });
      return { rows: [row] as T[], rowCount: 1 };
    },
    async tx(): Promise<never> {
      throw new Error('a named root must not receive an open relation transaction');
    },
  };
  return { db, executed };
}

/**
 * Ни один исполненный оператор не пишет в таблицу отношением, и ровно один зовёт корень.
 * Первая половина — арбитр возврата реляционного писателя: она смотрит ВЕСЬ выход слоя, а не
 * только первый оператор, поэтому «а мы ещё и продублируем в таблицу» тоже становится красным.
 */
function expectOnlyNamedRootTouches(
  executed: Executed[],
  root: string,
  relation: string,
): Executed {
  for (const call of executed) {
    expect(call.text).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+public\\.${relation}`, 'i'));
    expect(call.text).not.toMatch(new RegExp(`UPDATE\\s+public\\.${relation}`, 'i'));
    expect(call.text).not.toMatch(new RegExp(`DELETE\\s+FROM\\s+public\\.${relation}`, 'i'));
  }
  const rootCalls = executed.filter((call) => call.text.includes(root));
  expect(rootCalls).toHaveLength(1);
  return rootCalls[0]!;
}

describe('D17 шаг 2b — метка «бот заблокирован»', () => {
  it('постановка уходит одним корнем под организационным принципалом живого маршрута', async () => {
    const { db, executed } = recordingDb();

    await runWithOrganizationPrincipal(ORG_ROW, () =>
      markUserChannelBotBlocked(db, {
        platformUserId: PLATFORM_USER,
        channel: 'telegram',
        externalId: '777',
      }),
    );

    const call = expectOnlyNamedRootTouches(
      executed,
      'app.integrator_set_user_channel_bot_blocked',
      'user_channel_bindings',
    );
    expect(call.principalKind).toBe('organization');
    expect(call.principalOrganizationId).toBe(ORG_ROW);
    expect(call.params).toEqual([
      ORG_ROW,
      PLATFORM_USER,
      'telegram',
      '777',
      true,
      RECIPIENT_BLOCKED_BOT_REASON,
    ]);
  });

  it('снятие — та же дверь с состоянием false и без причины, а не второй писатель', async () => {
    const { db, executed } = recordingDb();

    await runWithOrganizationPrincipal(ORG_ROW, () =>
      clearUserChannelBotBlocked(db, {
        platformUserId: PLATFORM_USER,
        channel: 'max',
        externalId: '42',
      }),
    );

    const call = expectOnlyNamedRootTouches(
      executed,
      'app.integrator_set_user_channel_bot_blocked',
      'user_channel_bindings',
    );
    expect(call.params[4]).toBe(false);
    expect(call.params[5]).toBeNull();
  });

  it('чужой организации не достаётся: аргумент организации следует за принципалом строки очереди', async () => {
    const { db, executed } = recordingDb();

    await runWithOrganizationPrincipal(ORG_OTHER, () =>
      markUserChannelBotBlocked(db, {
        platformUserId: PLATFORM_USER,
        channel: 'telegram',
        externalId: '777',
      }),
    );

    const call = executed[0]!;
    // Организация берётся из окружающего принципала — ТОЙ ЖЕ, которую видит `app.current_org_id()`
    // в политиках `rev10_tenant_insert_216`/`rev10_tenant_update_216`. Корень сверяет их между
    // собой и, повторив стену дословно, не даёт поставить метку человеку чужой клиники.
    expect(call.params[0]).toBe(ORG_OTHER);
    expect(call.principalOrganizationId).toBe(ORG_OTHER);
    expect(call.params[0]).toBe(call.principalOrganizationId);
  });

  it('строка очереди оператора: без организационного принципала корень зовётся без организации', async () => {
    const { db, executed } = recordingDb();

    await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      markUserChannelBotBlocked(db, {
        platformUserId: null,
        channel: 'telegram',
        externalId: '777',
      }),
    );

    // Ровно то же, что и сегодня с реляционной записью: у `app_operational_delivery_worker` прав
    // на эту таблицу нет, и запись не приземляется. Наблюдаемо здесь — принципал не
    // организационный и организации в аргументе нет, значит корень откажет
    // `integrator_user_channel_bot_blocked_principal_required`.
    const call = executed[0]!;
    expect(call.principalKind).toBe('infra');
    expect(call.params[0]).toBeNull();
  });

  it('канал не мессенджера и пустой субъект до базы не доходят вовсе', async () => {
    const { db, executed } = recordingDb();

    await runWithOrganizationPrincipal(ORG_ROW, async () => {
      await markUserChannelBotBlocked(db, {
        platformUserId: PLATFORM_USER,
        channel: 'email',
        externalId: '777',
      });
      await markUserChannelBotBlocked(db, {
        platformUserId: null,
        channel: 'telegram',
        externalId: null,
      });
    });

    expect(executed).toHaveLength(0);
  });
});
