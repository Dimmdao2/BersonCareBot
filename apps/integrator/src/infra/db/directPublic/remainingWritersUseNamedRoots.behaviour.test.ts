/**
 * D17 шаг 2b — поведение двух оставшихся реляционных писателей `public.*`, доступных через
 * chokepoint `writeDirectPublic` (третий, `operatorHealthDrizzle`, зовёт корень без внедряемого
 * `DbPort` и проверяется в `../repos/operatorHealthUsesNamedRootsOnly.behaviour.test.ts`).
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
 */
import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { RECIPIENT_BLOCKED_BOT_REASON } from '../../delivery/recipientBotBlocked.js';
import { runWithInfraPrincipal, runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';
import { getCurrentDatabasePrincipal } from '../../principal/organizationPrincipal.js';
import { writeDirectPublic } from './writePort.js';
import {
  clearUserChannelBotBlocked,
  markUserChannelBotBlocked,
} from '../repos/userChannelBotBlocked.js';
import { recordMessengerPhoneBindBlocked } from '../repos/messengerPhoneBindAudit.js';

const ORG_ROW = 'a0000000-0000-4000-8000-0000000000a1';
const ORG_OTHER = 'b0000000-0000-4000-8000-0000000000b2';
const PLATFORM_USER = 'c0000000-0000-4000-8000-0000000000c3';
const OTHER_PLATFORM_USER = 'd0000000-0000-4000-8000-0000000000d4';

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
        externalId: 777,
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
        externalId: 777,
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
        externalId: 777,
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

describe('D17 шаг 2b — разбор конфликта привязки номера', () => {
  it('уходит одним корнем под организацией вызывающего, без транзакции отношений', async () => {
    const { db, executed } = recordingDb({ inserted_first: true });

    await runWithOrganizationPrincipal(ORG_ROW, () =>
      writeDirectPublic('admin-audit-write', () =>
        recordMessengerPhoneBindBlocked({
          db,
          reason: 'phone_taken_by_other_account',
          candidateIds: [PLATFORM_USER, OTHER_PLATFORM_USER],
          details: { channelCode: 'telegram', externalId: '777' },
        }),
      ),
    );

    const call = expectOnlyNamedRootTouches(
      executed,
      'app.integrator_record_messenger_phone_bind_audit',
      'admin_audit_log',
    );
    expect(call.principalKind).toBe('organization');
    expect(call.principalOrganizationId).toBe(ORG_ROW);
    expect(call.params[0]).toBe(ORG_ROW);
    expect(call.params[1]).toBe(PLATFORM_USER);
    // Ключ схлопывания — sha256 отсортированных кандидатов: 64 шестнадцатеричных знака.
    expect(call.params[2]).toMatch(/^[0-9a-f]{64}$/);
    const details = JSON.parse(String(call.params[3])) as Record<string, unknown>;
    expect(details.reason).toBe('phone_taken_by_other_account');
    expect(details.source).toBe('integrator.user.phone.link');
    expect(details.candidateIds).toEqual([PLATFORM_USER, OTHER_PLATFORM_USER]);
  });

  it('аномалия без кандидатов идёт той же дверью и ключа схлопывания не несёт', async () => {
    const { db, executed } = recordingDb({ inserted_first: true });

    await runWithOrganizationPrincipal(ORG_ROW, () =>
      writeDirectPublic('admin-audit-write', () =>
        recordMessengerPhoneBindBlocked({
          db,
          reason: 'indeterminate',
          candidateIds: [],
          details: {},
        }),
      ),
    );

    const call = expectOnlyNamedRootTouches(
      executed,
      'app.integrator_record_messenger_phone_bind_audit',
      'admin_audit_log',
    );
    expect(call.params[1]).toBeNull();
    expect(call.params[2]).toBeNull();
  });

  it('чужой организации не достаётся: организация — окружающая, а не из деталей случая', async () => {
    const { db, executed } = recordingDb({ inserted_first: false });

    await runWithOrganizationPrincipal(ORG_OTHER, () =>
      writeDirectPublic('admin-audit-write', () =>
        recordMessengerPhoneBindBlocked({
          db,
          reason: 'phone_taken_by_other_account',
          candidateIds: [PLATFORM_USER],
          details: { organizationId: ORG_ROW },
        }),
      ),
    );

    const call = executed.find((executedCall) =>
      executedCall.text.includes('app.integrator_record_messenger_phone_bind_audit'),
    )!;
    expect(call.params[0]).toBe(ORG_OTHER);
    expect(call.params[0]).toBe(call.principalOrganizationId);
    // `organizationId` из деталей случая в аргумент корня не попадает ни при каких условиях:
    // подстановка её туда и была бы межарендной утечкой, потому что корень сверяет аргумент с
    // принятым контекстом и сужает им КАЖДЫЙ поиск строки.
    expect(call.params[0]).not.toBe(ORG_ROW);
  });

  it('дверь сама говорит, первый ли это случай: false — администратора не будят', async () => {
    const relay = vi.fn();
    const { db, executed } = recordingDb({ inserted_first: false });

    await runWithOrganizationPrincipal(ORG_ROW, () =>
      writeDirectPublic('admin-audit-write', () =>
        recordMessengerPhoneBindBlocked({
          db,
          getDispatchPort: () => ({ dispatch: relay }) as never,
          reason: 'phone_taken_by_other_account',
          candidateIds: [PLATFORM_USER],
          details: {},
        }),
      ),
    );

    expect(relay).not.toHaveBeenCalled();
    expectOnlyNamedRootTouches(
      executed,
      'app.integrator_record_messenger_phone_bind_audit',
      'admin_audit_log',
    );
  });
});
