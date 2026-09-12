import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { SQL } from 'drizzle-orm';

/**
 * Дверь, которую сторожит этот файл: ССЫЛКА элемента программы проверяется ОТДЕЛЬНЫМ чтением, и это
 * чтение обязано видеть ровно тот же слой, что видит врач в диалоге «Выбор из библиотеки».
 *
 * Как это сломалось живьём на S0б (12.09.2026, найдено проходом по приёмке): библиотека этапа уже
 * предлагала врачу платформенную рекомендацию и платформенный тест (`loadTreatmentProgramLibrary`
 * передаёт `includePlatformBase`), а `assertItemRefExists` для типов `recommendation` и
 * `clinical_test` сужал строку до `organization_id = <своя>`. Платформенная строка для этой
 * проверки не существовала: добавление в этап падало 500 `stages_items_failed` — на материал,
 * который приложение само только что предложило. Ветки `exercise` и `lfk_complex` платформенный
 * слой уже учитывали, то есть расходились ровно два типа каталога из четырёх.
 *
 * Oracle — не текст запроса, а ГРАНИЦА чтения: при включённом тарифе предикат КАЖДОГО каталожного
 * типа обязан пускать платформенную строку (`owner_kind = 'platform'` и `organization_id is null`),
 * при выключенном — не пускать; своя организация присутствует всегда. Проверяется настоящий
 * `switch` порта, а не переписанное в тесте условие: дверь читает через подменённый drizzle,
 * который перехватывает `where` и ничего не возвращает.
 */

const capturedWhere: { table: string; where: SQL | undefined }[] = [];

const CATALOG_TABLES = {
  exercise: 'lfkExercises',
  lfk_complex: 'lfkComplexTemplates',
  clinical_test: 'clinicalTests',
  recommendation: 'recommendations',
} as const;

let mechanicEnabled = true;

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () =>
    new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop !== 'query') return undefined;
          return new Proxy(
            {},
            {
              get: (_t2, table: string) => ({
                findFirst: async (args: { where?: SQL }) => {
                  capturedWhere.push({ table, where: args?.where });
                  return null; // строку не отдаём: интересна граница чтения, а не результат
                },
              }),
            },
          );
        },
      },
    ),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => ORGANIZATION_ID,
}));

vi.mock('@/infra/repos/pgOrgEntitlements', () => ({
  createPgOrgEntitlementsPort: () => ({}),
}));

vi.mock('@/modules/org-entitlements/service', () => ({
  isMechanicEnabled: async () => mechanicEnabled,
}));

const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';
const ITEM_REF_ID = '00000000-0000-4000-8000-0000000000a1';

const { createPgTreatmentProgramItemRefValidationPort } = await import(
  './pgTreatmentProgramItemRefValidation'
);

async function readBoundaryFor(type: keyof typeof CATALOG_TABLES): Promise<{
  sql: string;
  params: unknown[];
}> {
  capturedWhere.length = 0;
  const port = createPgTreatmentProgramItemRefValidationPort();
  await expect(port.assertItemRefExists(type, ITEM_REF_ID)).rejects.toThrow(/не найден/);
  expect(capturedWhere).toHaveLength(1);
  expect(capturedWhere[0].table).toBe(CATALOG_TABLES[type]);
  const rendered = (drizzle as unknown as { mock: () => ReturnType<typeof drizzle> })
    .mock()
    .select()
    .from({ _: { name: 'x' } } as never)
    .where(capturedWhere[0].where)
    .toSQL();
  return { sql: rendered.sql, params: rendered.params };
}

describe('граница чтения при проверке ссылки элемента программы', () => {
  beforeEach(() => {
    mechanicEnabled = true;
  });

  for (const type of Object.keys(CATALOG_TABLES) as (keyof typeof CATALOG_TABLES)[]) {
    it(`${type}: с включённым тарифом платформенная строка входит в границу чтения`, async () => {
      const { sql, params } = await readBoundaryFor(type);
      expect(params).toContain('platform');
      expect(params).toContain(ORGANIZATION_ID);
      expect(sql).toMatch(/"owner_kind" = \$\d+ and "\w+"\."organization_id" is null/);
    });

    it(`${type}: с выключенным тарифом платформенная строка в границу не входит`, async () => {
      mechanicEnabled = false;
      const { sql, params } = await readBoundaryFor(type);
      expect(params).not.toContain('platform');
      expect(params).toContain(ORGANIZATION_ID);
      expect(sql).not.toMatch(/"organization_id" is null/);
    });
  }
});
