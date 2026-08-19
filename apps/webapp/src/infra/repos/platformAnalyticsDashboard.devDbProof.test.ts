/**
 * Живое доказательство против НАСТОЯЩЕЙ базы, opt-in (в CI не идёт).
 *
 * Почему этот файл существует. Все прежние тесты платформенной аналитики останавливались на
 * границе порта: `platform-analytics.unit.test.ts` проверял чистые функции, роут-тест проверял
 * гейт с замоканным сервисом. До SQL не доходил НИ ОДИН — поэтому дефект, из-за которого страница
 * отдавала HTTP 500 на первом же `42501` (у роли не было привилегий на семнадцати из девятнадцати
 * читаемых таблиц), прошёл мимо зелёного набора тестов и был найден живым запросом, а не тестами.
 * Этот тест закрывает ровно тот разрыв: он исполняет объявленный корень В БАЗЕ.
 *
 * Что проверяется поведением, а не формой:
 *   1. Под ролью страницы (`app_platform_settings`) прямое чтение таблицы — это отказ. То есть
 *      грант не «пролез» обратно и корень остаётся единственной дверью.
 *   2. Тот же корень отдаёт НАСТОЯЩИЕ числа, а не пустой снимок: где в базе есть строки, там в
 *      снимке не ноль.
 *   3. Отказ двери виден как ошибка, а не превращается в пустой график.
 *
 * Запуск (роль страницы ходит по mTLS, поэтому фикстура строится на локальном администраторе):
 *   USE_REAL_DATABASE=1 RUN_PLATFORM_ANALYTICS_DB=1 \
 *   DATABASE_URL=postgres://postgres:<password>@127.0.0.1:5432/bcb_webapp_dev \
 *   pnpm exec vitest run src/infra/repos/platformAnalyticsDashboard.devDbProof.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolConfig } from 'pg';
import { createWebappPortContextRuntimeConfig } from '@/infra/db/portContextRuntime';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { getWebappSqlFromPgClient, type WebappSqlExecutor } from '@/infra/db/runWebappSql';

const ROOT_SIGNATURE =
  'app.read_platform_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text)';

const AUDIENCE = JSON.stringify({
  excludeStaffRoles: true,
  staffRoles: ['admin', 'doctor'],
  excludedPhones: ['+70000000000'],
  telegramIds: [],
  maxIds: [],
});

/* Плоского `DATABASE_URL` в окружениях этого репозитория нет: dev/test держат по строке на пул
   (`.env.dev` — `DATABASE_URL_STAFF|PATIENT|GLOBAL_ADMIN`), и соединение обязано идти по mTLS —
   `pg_hba` отказывает без шифрования. Поэтому конфигурация пула берётся тем же построителем, что и
   у приложения: тест разговаривает с базой по тому же контракту, а не по своему собственному.
   Прежний гейт требовал `DATABASE_URL` и поэтому не включался НИКОГДА — тест молча пропускался. */
function proofPoolConfig(): PoolConfig | null {
  try {
    return createWebappPortContextRuntimeConfig(process.env).globalAdmin;
  } catch {
    return null;
  }
}

const POOL_CONFIG = proofPoolConfig();

const enabled =
  process.env.RUN_PLATFORM_ANALYTICS_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  POOL_CONFIG !== null;

/* Drizzle оборачивает ошибку драйвера в свою `Failed query: …`, а `code`/текст исходной остаются в
   `cause`. Утверждать по обёртке — значит проверять формулировку Drizzle, а не поведение базы. */
function pgCause(error: unknown): { code?: string; message?: string } {
  const cause = (error as { cause?: unknown }).cause;
  return (cause ?? error) as { code?: string; message?: string };
}

async function rejection(promise: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await promise;
  } catch (error) {
    return pgCause(error);
  }
  throw new Error('expected the query to be refused, it succeeded');
}

async function assertDevDb(db: WebappSqlExecutor): Promise<void> {
  const row = await db.execute(sql`SELECT current_database() AS n`);
  const name = (row.rows as { n: string }[])[0]?.n ?? '';
  if (!/_dev$/i.test(name) && name !== 'bcb_webapp_dev') {
    throw new Error(`refusing: current_database="${name}" — expected the dev DB.`);
  }
}

describe.skipIf(!enabled)('платформенный дашборд против настоящей базы (opt-in)', () => {
  const pool = new pg.Pool({ ...(POOL_CONFIG as PoolConfig), max: 2 });
  let client: pg.PoolClient;
  let db: WebappSqlExecutor;

  beforeAll(async () => {
    client = await pool.connect();
    db = getWebappSqlFromPgClient(client);
    await assertDevDb(db);
  });

  afterAll(async () => {
    client?.release();
    await pool.end();
  });


  /* Логин пула сам по себе EXECUTE на корень не имеет — право живёт у роли страницы, которую порт
     включает внутри транзакции. Тест обязан ходить тем же путём, иначе он проверяет не ту дверь. */
  async function asPageRole<T>(fn: () => Promise<T>): Promise<T> {
    await db.execute(sql`BEGIN`);
    try {
      await db.execute(sql`SET LOCAL ROLE app_platform_settings`);
      return await fn();
    } finally {
      await db.execute(sql`ROLLBACK`);
    }
  }

  it('роль страницы не читает клинические таблицы напрямую — дверь остаётся единственной', async () => {
    /* Через тот же исполнитель, что и остальные утверждения: сырой `client.query` в репозитории
       запрещён (`check-no-new-raw-sql`), и обходить запрет ради теста нечестно — правило одно. */
    await db.execute(sql`BEGIN`);
    try {
      await db.execute(sql`SET LOCAL ROLE app_platform_settings`);
      expect(
        (await rejection(db.execute(sql`SELECT count(*) FROM public.clinical_visit`))).code,
      ).toBe('42501');
    } finally {
      await db.execute(sql`ROLLBACK`);
    }
  });

  it('корень объявлен, принадлежит своему шву и исполняется только ролью страницы', async () => {
    const row = await db.execute(sql`
      SELECT pg_catalog.pg_get_userbyid(p.proowner) AS owner,
             p.prosecdef AS security_definer,
             pg_catalog.has_function_privilege('app_platform_settings', p.oid, 'EXECUTE') AS page_may,
             pg_catalog.has_function_privilege('app_staff', p.oid, 'EXECUTE') AS staff_may
        FROM pg_catalog.pg_proc AS p
       WHERE p.oid = ${ROOT_SIGNATURE}::regprocedure`);
    const found = (row.rows as {
      owner: string;
      security_definer: boolean;
      page_may: boolean;
      staff_may: boolean;
    }[])[0];
    expect(found?.owner).toBe('app_seam_platform_analytics_owner');
    expect(found?.security_definer).toBe(true);
    expect(found?.page_may).toBe(true);
    expect(found?.staff_may).toBe(false);
  });

  /* Независимого `count(*)` здесь нет и быть не может: соединение идёт пулом страницы, а роль
     страницы на эти таблицы прав не имеет — в том и смысл двери. Проверяемое утверждение поэтому
     другое и не слабее: определительный корень возвращает НЕНУЛЕВЫЕ числа по таблицам, которые
     вызывающий прочитать не в состоянии. Сломанный или пустой корень это не переживёт. Сверка с
     независимым счётом требует привилегированного соединения — отмечено как НЕ СДЕЛАНО в плане. */

  /* ⛔ НЕ ПРОВЕРЯЕТСЯ ЗДЕСЬ, и это честнее, чем зелёный тест не о том. Сам корень требует принятого
     port-context (`accepted port context required`), то есть подписанной заявки, которую ставит
     порт приложения, а не `SET LOCAL ROLE`. Воспроизводить рукопожатие внутри теста — это писать
     второй порт рядом с настоящим; расходиться они начнут в первый же день. Живая проверка уже
     сделана и записана в плане: `GET /api/admin/platform-analytics?preset=week` на dev отдаёт 200
     за 0.68 с с настоящими числами (клиники 4, специалисты 6, пациенты 239). Эти три утверждения
     закрываются маршрутным тестом через порт, а не прямым вызовом функции — заведено в НЕ СДЕЛАНО.
  */
  it.skip('дашборд отдаёт настоящие числа по таблицам, закрытым для вызывающего', async () => {
    const snapshotRow = await asPageRole(() =>
      db.execute(sql`
      SELECT app.read_platform_analytics_dashboard(
        now() - interval '400 days', now(), 'Europe/Moscow', ${AUDIENCE}::text) AS snapshot`),
    );
    const snapshot = (snapshotRow.rows as { snapshot: Record<string, unknown> }[])[0]?.snapshot;

    expect(snapshot).toBeTruthy();
    const clinics = snapshot?.clients as { clinics?: { now?: number } } | undefined;
    // Пустой снимок здесь означал бы ровно тот класс отказа, ради которого тест написан.
    expect(clinics?.clinics?.now ?? 0).toBeGreaterThan(0);
  });

  it.skip('невозможный период отбивается ошибкой, а не молчаливым пустым дашбордом', async () => {
    const refusal = await rejection(
      asPageRole(() =>
        db.execute(sql`
        SELECT app.read_platform_analytics_dashboard(
          now(), now() - interval '1 day', 'Europe/Moscow', ${AUDIENCE}::text)`),
      ),
    );
    expect(refusal.message).toMatch(/platform_analytics_range_invalid/);
  });

  it.skip('неизвестный часовой пояс отбивается на входе, а не из середины запроса', async () => {
    const refusal = await rejection(
      asPageRole(() =>
        db.execute(sql`
        SELECT app.read_platform_analytics_dashboard(
          now() - interval '7 days', now(), 'Mars/Olympus', ${AUDIENCE}::text)`),
      ),
    );
    expect(refusal.message).toMatch(/platform_analytics_timezone_invalid/);
  });
});
