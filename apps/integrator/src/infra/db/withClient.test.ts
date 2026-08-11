/**
 * УРОВЕНЬ 0, пункт 3 (D20_INTEGRATOR_MAP.md): принципал арендатора и гигиена клиента пула.
 * Цена ошибки — данные одной клиники в руках другой.
 *
 * ── КАК ЭТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ТАК ──────────────────────────────────────
 * Проверяемое поведение из карты: «клиент возвращён в пул → на нём НЕ осталось SET ROLE/SET LOCAL
 * предыдущего арендатора». Это поведение СЕССИИ PostgreSQL, а не возвращаемого значения. Поэтому
 * тест поднимает МОДЕЛЬ сессии: фейковый `PoolClient`, который реально исполняет приходящие к нему
 * команды `SET ROLE` / `RESET ROLE` / `app.install_signed_context()` / `app.release_principal_context()`
 * и хранит получившееся состояние. Утечка тогда наблюдаема буквально: пул отдаёт ОДИН И ТОТ ЖЕ
 * физический коннект второму арендатору, и мы смотрим, с какой ролью и с чьим контекстом он пришёл.
 *
 * Модель сессии построена по фактическому коду `@bersoncare/db-principal` (`applySignedDbPrincipal`,
 * `releaseSignedDbPrincipal`, `setDbOperationalRuntimeRole`), а не по догадкам.
 *
 * ⚠️ ЧЕГО ЭТОТ ФАЙЛ НЕ ДОКАЗЫВАЕТ: настоящий RLS. Модель проверяет, что интегратор ОТДАЁТ базе
 * правильную последовательность команд и не оставляет коннект грязным. Что сама PostgreSQL при этом
 * действительно откажет в чужих строках — доказывается только на живой базе; см. раздел
 * «Что НЕ покрыто» в D20_LEVEL0_TESTS_REPORT.md.
 *
 * У каждого `it` в комментарии — свой арбитр. Арбитры прогнаны руками, вывод — в отчёте.
 */
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runWithBootstrapPrincipal,
  runWithInfraPrincipal,
  runWithOrganizationPrincipal,
} from '../principal/organizationPrincipal.js';
import {
  checkoutIntegratorPoolClient,
  withIntegratorPoolClient,
  withIntegratorPoolTransaction,
} from './withClient.js';

const ORG_A = 'a0000000-0000-4000-8000-00000000000a';
const ORG_B = 'b0000000-0000-4000-8000-00000000000b';

/** Наблюдаемое состояние сессии PostgreSQL — то, что «остаётся на коннекте». */
type SessionState = {
  /** Текущая роль после SET ROLE / RESET ROLE. null = роль по умолчанию (логин-роль). */
  role: string | null;
  /** Организация, установленная подписанным контекстом. null = контекст отпущен. */
  organizationId: string | null;
  /** Открыта ли транзакция. */
  inTransaction: boolean;
};

type FakeSession = {
  client: PoolClient;
  state: SessionState;
  log: string[];
  /** Снимки состояния, сделанные снаружи в интересные моменты. */
  snapshots: { at: string; state: SessionState }[];
  snapshot(at: string): void;
  released: number;
  releaseErrors: unknown[];
};

/**
 * Один физический коннект, который умеет исполнять ровно те команды, которые ему шлёт
 * `withClient.ts` через `@bersoncare/db-principal`, и запоминает результат.
 */
function createFakeSession(): FakeSession {
  const state: SessionState = { role: null, organizationId: null, inTransaction: false };
  const log: string[] = [];
  const session = {
    state,
    log,
    snapshots: [] as { at: string; state: SessionState }[],
    released: 0,
    releaseErrors: [] as unknown[],
    snapshot(at: string) {
      session.snapshots.push({ at, state: { ...state } });
    },
  } as FakeSession;

  const client = {
    async query(text: string, values?: unknown[]) {
      log.push(text);
      if (text === 'SELECT pg_backend_pid() AS backend_pid') {
        return { rows: [{ backend_pid: 4242 }] };
      }
      if (text.startsWith('SET ROLE ')) {
        state.role = text.slice('SET ROLE '.length).trim();
        return { rows: [] };
      }
      if (text === 'RESET ROLE') {
        state.role = null;
        return { rows: [] };
      }
      if (text.includes('app.install_signed_context')) {
        // Порядок параметров — из installSignedDbPrincipalContext:
        // (nonce, backendPid, expiresEpoch, organizationId, patientUserId, integratorUserId, signature)
        state.organizationId = (values?.[3] as string | null) ?? null;
        return { rows: [] };
      }
      if (text.includes('app.release_principal_context')) {
        state.organizationId = null;
        return { rows: [] };
      }
      if (text === 'BEGIN') {
        state.inTransaction = true;
        return { rows: [] };
      }
      if (text === 'COMMIT' || text === 'ROLLBACK') {
        state.inTransaction = false;
        return { rows: [] };
      }
      if (text.startsWith("SELECT set_config('app.")) {
        // legacy-guc путь; в locked-режиме сюда не заходим
        return { rows: [] };
      }
      return { rows: [] };
    },
    release(err?: unknown) {
      session.released += 1;
      if (err !== undefined) session.releaseErrors.push(err);
    },
  } as unknown as PoolClient;

  session.client = client;
  return session;
}

/** Пул, который ВСЕГДА отдаёт один и тот же физический коннект — так и ловится утечка между арендаторами. */
function poolReusingOneConnection(session: FakeSession): Pool & { connects: number } {
  const pool = {
    connects: 0,
    async connect() {
      pool.connects += 1;
      return session.client;
    },
  } as unknown as Pool & { connects: number };
  return pool;
}

const PRINCIPAL_ENV = ['DB_PRINCIPAL_CONTEXT_MODE', 'DB_PRINCIPAL_SIGNING_SECRET'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(PRINCIPAL_ENV.map((key) => [key, process.env[key]]));
  process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
  process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-signing-secret';
});

afterEach(() => {
  for (const key of PRINCIPAL_ENV) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('клиент пула: контекст арендатора не переживает возврат в пул', () => {
  it('дано: коннект отработал под клиникой A и вернулся в пул → когда его берёт клиника B → тогда на нём нет ни роли, ни организации A', async () => {
    // Это и есть «протёкший SET ROLE = данные одной клиники в руках другой». Пул намеренно отдаёт
    // ОДИН физический коннект обоим арендаторам — так проверяется именно очистка, а не везение.
    // АРБИТР: в releasePreparedIntegratorClient() убрать вызов
    // `await clearDbPrincipalFromConnection(client, options)` — снимок «после возврата A» покажет
    // role=app_staff и organizationId=ORG_A, и тест покраснеет.
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    await runWithOrganizationPrincipal(ORG_A, () =>
      withIntegratorPoolClient(pool, async () => {
        session.snapshot('внутри работы клиники A');
      }),
    );
    session.snapshot('после возврата клиники A в пул');

    await runWithOrganizationPrincipal(ORG_B, () =>
      withIntegratorPoolClient(pool, async () => {
        session.snapshot('внутри работы клиники B');
      }),
    );
    session.snapshot('после возврата клиники B в пул');

    expect(pool.connects).toBe(2); // один и тот же коннект выдан дважды
    expect(session.snapshots).toEqual([
      { at: 'внутри работы клиники A', state: { role: 'app_staff', organizationId: ORG_A, inTransaction: false } },
      { at: 'после возврата клиники A в пул', state: { role: null, organizationId: null, inTransaction: false } },
      { at: 'внутри работы клиники B', state: { role: 'app_staff', organizationId: ORG_B, inTransaction: false } },
      { at: 'после возврата клиники B в пул', state: { role: null, organizationId: null, inTransaction: false } },
    ]);
    expect(session.released).toBe(2);
    expect(session.releaseErrors).toEqual([]);
  });

  it('дано: техническая роль воркера доставки → когда коннект вернулся в пул → тогда роль снята', async () => {
    // Роль app_operational_delivery_worker шире, чем нужно тенанту. Оставшись на коннекте, она даст
    // следующему арендатору права воркера над очередью доставки чужой клиники.
    // АРБИТР: тот же — убрать clearDbPrincipalFromConnection() из releasePreparedIntegratorClient();
    // снимок «после возврата» покажет role=app_operational_delivery_worker.
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, () =>
      withIntegratorPoolClient(pool, async () => {
        session.snapshot('внутри тика воркера');
      }),
    );
    session.snapshot('после возврата воркера в пул');

    expect(session.snapshots).toEqual([
      {
        at: 'внутри тика воркера',
        state: { role: 'app_operational_delivery_worker', organizationId: null, inTransaction: false },
      },
      { at: 'после возврата воркера в пул', state: { role: null, organizationId: null, inTransaction: false } },
    ]);
  });

  it('дано: работа под клиникой A упала → когда исключение вышло наружу → тогда коннект всё равно очищен и возвращён', async () => {
    // Иначе один упавший запрос навсегда отравляет коннект в пуле для всех последующих арендаторов.
    // АРБИТР: в withIntegratorPoolClient() заменить `finally { await releasePrepared... }`
    // на вызов после `return` (то есть только на успешном пути) — снимок покажет грязную сессию.
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    await expect(
      runWithOrganizationPrincipal(ORG_A, () =>
        withIntegratorPoolClient(pool, async () => {
          throw new Error('запрос клиники A упал');
        }),
      ),
    ).rejects.toThrow('запрос клиники A упал');

    session.snapshot('после падения');
    expect(session.snapshots).toEqual([
      { at: 'после падения', state: { role: null, organizationId: null, inTransaction: false } },
    ]);
    expect(session.released).toBe(1);
  });

  it('дано: транзакция клиники A упала → когда откат → тогда ROLLBACK выполнен и коннект очищен', async () => {
    // АРБИТР: в withIntegratorPoolTransaction() убрать блок `catch { await client.query('ROLLBACK') }`
    // — проверка наличия ROLLBACK в журнале команд покраснеет, а в бою коннект вернулся бы в пул
    // с открытой транзакцией чужой клиники.
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    await expect(
      runWithOrganizationPrincipal(ORG_A, () =>
        withIntegratorPoolTransaction(pool, async () => {
          throw new Error('транзакция клиники A упала');
        }),
      ),
    ).rejects.toThrow('транзакция клиники A упала');

    expect(session.log).toContain('BEGIN');
    expect(session.log).toContain('ROLLBACK');
    expect(session.log).not.toContain('COMMIT');
    expect(session.state).toEqual({ role: null, organizationId: null, inTransaction: false });
  });
});

describe('работа без разрешённого принципала не доходит до базы', () => {
  it('дано: locked-режим и принципал не установлен → когда берём клиента → тогда отказ ДО pool.connect()', async () => {
    // «Работа без принципала не читает и не пишет данные чужой клиники» — и это должно случиться
    // раньше, чем коннект вообще будет взят, иначе широкая логин-роль уже получит доступ.
    // АРБИТР: в checkoutIntegratorPoolClient() убрать
    // `assertIntegratorLockedPrincipalClassified(principalApplyOptions)` — pool.connects станет 1,
    // и тест покраснеет на проверке «в базу не ходили».
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    await expect(checkoutIntegratorPoolClient(pool)).rejects.toThrow(
      'DB principal context is required before integrator scoped DB access in locked mode',
    );
    expect(pool.connects).toBe(0);
    expect(session.log).toEqual([]);
  });

  it('дано: locked-режим и техническая работа с НЕразрешённым источником → когда берём клиента → тогда отказ ДО pool.connect()', async () => {
    // Списки allowedLockedInfraSources/BootstrapSources — это перечень мест, которым позволено
    // работать без арендатора. Незнакомый источник обязан отвергаться, а не «выполниться под широкой ролью».
    // АРБИТР: в assertAllowedTechnicalPrincipal() убрать проверку `!allowedLockedInfraSources.has(source)`
    // — оба вызова пройдут, pool.connects станет 2, тест покраснеет.
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    expect(() =>
      runWithInfraPrincipal({ source: 'неизвестный-источник' }, () =>
        checkoutIntegratorPoolClient(pool),
      ),
    ).toThrow('Unknown integrator infra source');

    await expect(
      runWithBootstrapPrincipal({ source: 'неизвестный-источник' }, () =>
        checkoutIntegratorPoolClient(pool),
      ),
    ).rejects.toThrow('DB bootstrap principal source is not allowed');

    expect(pool.connects).toBe(0);
  });

  it('дано: locked-режим и разрешённый технический источник → когда берём клиента → тогда работа идёт', async () => {
    // Обратная сторона предыдущего: гейт не должен глушить штатные пути (иначе доставка встанет молча).
    // АРБИТР: удалить строку 'worker:outgoing-delivery-tick' из allowedLockedInfraSources —
    // тест покраснеет броском вместо успешного чекаута.
    const session = createFakeSession();
    const pool = poolReusingOneConnection(session);

    await runWithInfraPrincipal({ source: 'worker:outgoing-delivery-tick' }, async () => {
      const client = await checkoutIntegratorPoolClient(pool);
      expect(client).toBe(session.client);
    });

    expect(pool.connects).toBe(1);
  });
});
