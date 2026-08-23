/**
 * Живое opt-in доказательство, что ДВА слоя защиты адреса клиники говорят одно и то же.
 *
 * Поломка, которую тест ловит: кто-то правит один слой и забывает второй — снимает метку из
 * `RESERVED_ORGANIZATION_SLUGS`, не выпустив миграцию, или наоборот меняет CHECK мимо приложения.
 * Последствие: дверь приложения и дверь базы расходятся, и запись, которую приложение считает
 * законной, отбивается кодом 23514 (пользователь видит ошибку сервера вместо типизированного
 * отказа) — либо метка перестаёт быть закрытой на одном из слоёв.
 *
 * Оракул — сама экспортируемая константа и фактическое ограничение живой базы; ни один из них не
 * читает исходный текст другого. Проверка read-only для перечня и транзакционная с обязательным
 * ROLLBACK для границ длины.
 *
 * Запуск:
 *   RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB=1 pnpm exec vitest run \
 *     src/modules/clinic-directory/organizationSlugDbParity.devDbProof.test.ts
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  RESERVED_ORGANIZATION_SLUGS,
  validateOrganizationSlugCandidate,
} from './organizationSlug';

const enabled = process.env.RUN_CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB === '1';
const DATABASE = process.env.CLINIC_DOMAIN_WRITE_CONSTRAINTS_DB ?? 'bcb_webapp_dev';

if (enabled && !/^bcb_webapp_dev$|^bersoncarebot_test$/u.test(DATABASE)) {
  throw new Error(`refusing to touch '${DATABASE}': only the named DEV/TEST databases are allowed`);
}

function psql(sql: string): string {
  return execFileSync(
    'sudo',
    [
      '-n',
      '-u',
      'postgres',
      'psql',
      '-X',
      '-A',
      '-t',
      '-q',
      '-h',
      '/var/run/postgresql',
      '-p',
      '5432',
      '-d',
      DATABASE,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

/** Метки, перечисленные в фактическом CHECK живой базы. */
function reservedLabelsInDatabase(): string[] {
  const definition = psql(`
BEGIN READ ONLY;
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.organization_slug_claims'::regclass
   AND conname = 'organization_slug_claims_slug_reserved_check';
ROLLBACK;
`);
  return [...definition.matchAll(/'([^']+)'::text/g)].map((match) => match[1]);
}

/** Границы окна длины, которые приложение фактически принимает. */
function applicationLengthWindow(): { min: number; max: number } {
  const accepted: number[] = [];
  for (let length = 1; length <= 80; length += 1) {
    if (validateOrganizationSlugCandidate('a'.repeat(length)).ok) accepted.push(length);
  }
  return { min: accepted[0], max: accepted[accepted.length - 1] };
}

/** Пишет slug в базу мимо приложения и всегда откатывает: `ACCEPTED` или `REJECTED`. */
function databaseVerdict(slug: string): string {
  expect(slug).toMatch(/^[a-z0-9-]+$/u);
  return psql(`
BEGIN;
DO $$
DECLARE
  v_org uuid;
  v_actor uuid;
BEGIN
  SELECT id INTO v_org FROM public.be_organizations ORDER BY id LIMIT 1;
  SELECT id INTO v_actor FROM public.platform_users ORDER BY id LIMIT 1;
  IF v_org IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'DEV fixture requires one organization and one platform user';
  END IF;
  BEGIN
    INSERT INTO public.organization_slug_claims
      (slug, kind, organization_id, created_by_platform_user_id)
    VALUES ('${slug}', 'reservation', v_org, v_actor);
    PERFORM set_config('bcb.verdict', 'ACCEPTED', false);
  EXCEPTION WHEN check_violation THEN
    PERFORM set_config('bcb.verdict', 'REJECTED', false);
  END;
END $$;
SELECT current_setting('bcb.verdict');
ROLLBACK;
`);
}

describe.skipIf(!enabled)('дверь приложения и дверь базы описывают один и тот же адрес', () => {
  it('перечень служебных меток в базе совпадает с перечнем приложения', () => {
    const inDatabase = reservedLabelsInDatabase();
    const inApplication = [...RESERVED_ORGANIZATION_SLUGS];

    expect(new Set(inDatabase).size).toBe(inDatabase.length);
    expect([...inDatabase].sort()).toEqual([...inApplication].sort());
  });

  it('база принимает ровно то окно длины, которое принимает приложение', () => {
    const { min, max } = applicationLengthWindow();

    expect(databaseVerdict('a'.repeat(min))).toBe('ACCEPTED');
    expect(databaseVerdict('a'.repeat(max))).toBe('ACCEPTED');
    expect(databaseVerdict('a'.repeat(min - 1))).toBe('REJECTED');
    expect(databaseVerdict('a'.repeat(max + 1))).toBe('REJECTED');
  });
});
