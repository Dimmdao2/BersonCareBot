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

const enabled =
  process.env.RUN_PLATFORM_ANALYTICS_DB === '1' &&
  process.env.USE_REAL_DATABASE === '1' &&
  Boolean((process.env.DATABASE_URL ?? '').trim());

async function assertDevDb(db: WebappSqlExecutor): Promise<void> {
  const row = await db.execute(sql`SELECT current_database() AS n`);
  const name = (row.rows as { n: string }[])[0]?.n ?? '';
  if (!/_dev$/i.test(name) && name !== 'bcb_webapp_dev') {
    throw new Error(`refusing: current_database="${name}" — expected the dev DB.`);
  }
}

describe.skipIf(!enabled)('платформенный дашборд против настоящей базы (opt-in)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
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

  it('роль страницы не читает клинические таблицы напрямую — дверь остаётся единственной', async () => {
    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE app_platform_settings');
      await expect(client.query('SELECT count(*) FROM public.clinical_visit')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('ROLLBACK');
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

  it('дашборд отдаёт настоящие числа там, где в базе есть строки', async () => {
    const expected = await db.execute(sql`
      SELECT (SELECT count(*) FROM public.be_organizations WHERE is_active) AS clinics,
             (SELECT count(*) FROM public.be_specialists WHERE is_active) AS specialists`);
    const truth = (expected.rows as { clinics: string; specialists: string }[])[0];

    const snapshotRow = await db.execute(sql`
      SELECT app.read_platform_analytics_dashboard(
        now() - interval '400 days', now(), 'Europe/Moscow', ${AUDIENCE}::text) AS snapshot`);
    const snapshot = (snapshotRow.rows as { snapshot: Record<string, unknown> }[])[0]?.snapshot;

    expect(snapshot).toBeTruthy();
    const clinics = snapshot?.clinics as { now: number } | undefined;
    const specialists = snapshot?.specialists as { now: number } | undefined;
    expect(clinics?.now).toBe(Number(truth?.clinics));
    expect(specialists?.now).toBe(Number(truth?.specialists));
    // Пустой снимок здесь означал бы ровно тот класс отказа, ради которого тест написан.
    expect(Number(truth?.clinics)).toBeGreaterThan(0);
  });

  it('невозможный период отбивается ошибкой, а не молчаливым пустым дашбордом', async () => {
    await expect(
      db.execute(sql`
        SELECT app.read_platform_analytics_dashboard(
          now(), now() - interval '1 day', 'Europe/Moscow', ${AUDIENCE}::text)`),
    ).rejects.toThrow(/platform_analytics_range_invalid/);
  });

  it('неизвестный часовой пояс отбивается на входе, а не из середины запроса', async () => {
    await expect(
      db.execute(sql`
        SELECT app.read_platform_analytics_dashboard(
          now() - interval '7 days', now(), 'Mars/Olympus', ${AUDIENCE}::text)`),
    ).rejects.toThrow(/platform_analytics_timezone_invalid/);
  });
});
