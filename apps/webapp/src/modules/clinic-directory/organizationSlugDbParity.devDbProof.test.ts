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

/**
 * Второй предмет того же файла: прежнее имя клиники остаётся её псевдонимом НАВСЕГДА.
 *
 * Поломка, которую ловит: кто-то ослабляет `app.guard_organization_slug_claim_mutation` или сужает
 * `uq_organization_slug_claims_slug` предикатом по `kind` — и прежнее имя возвращается в общий пул.
 * Последствие — ровно тот захват адреса, от которого правило и строилось: пациент идёт по старой
 * ссылке `/book/{старое-имя}` и попадает в ЧУЖУЮ клинику, где оставляет контакты и данные о
 * здоровье. Дорого и молча одновременно: страница открывается нормально, ошибки нет ни у кого,
 * заметить можно только по жалобе человека.
 *
 * Oracle — решение владельца, а не реализация: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §12
 * «Слаг, once занятый организацией, никогда не достаётся ДРУГОЙ организации… Но та же организация
 * может вернуть себе своё же прежнее имя». Поэтому здесь проверяются обе стороны правила: три
 * запрета и одна РАЗРЕШЁННАЯ дверь — иначе «починка», запрещающая всё подряд, прошла бы молча.
 *
 * Почему против базы, а не фейковым портом: гарантия живёт в триггере и уникальном индексе, их
 * фейк не воспроизводит (§10b). Всё пишется в транзакции с обязательным ROLLBACK; обе проверки
 * полноты (`alias_complete`, `rename_complete`) — DEFERRABLE INITIALLY DEFERRED, то есть до commit
 * не срабатывают, а немедленный guard иммутабельности срабатывает — именно он здесь и проверяется.
 */
const ALIAS_SLUG = 'dbproof-former-name';
const CURRENT_SLUG = 'dbproof-present-name';

/**
 * Разыгрывает переименованную клинику и её соседа, пробует `attempt` и ВСЕГДА откатывает.
 * Возвращает `ACCEPTED` либо `REJECTED: <текст отказа базы>`.
 */
function aliasVerdict(attempt: string): string {
  return psql(`
BEGIN;
-- Заведение организации тянет за собой посев справочников, к предмету проверки не относящийся.
-- Отключение живёт только внутри транзакции и уезжает вместе с ROLLBACK.
ALTER TABLE public.be_organizations DISABLE TRIGGER be_organizations_reference_catalog_snapshot;
DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_foreign uuid := gen_random_uuid();
  v_alias uuid;
BEGIN
  INSERT INTO public.be_organizations (id, title) VALUES
    (v_org, 'devDbProof renamed clinic'),
    (v_foreign, 'devDbProof foreign clinic');
  INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
    VALUES ('${CURRENT_SLUG}', 'current', v_org);
  INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
    VALUES ('${ALIAS_SLUG}', 'alias', v_org)
    RETURNING id INTO v_alias;
  BEGIN
    ${attempt}
    PERFORM set_config('bcb.verdict', 'ACCEPTED', false);
  EXCEPTION WHEN others THEN
    PERFORM set_config('bcb.verdict', 'REJECTED: ' || SQLERRM, false);
  END;
END $$;
SELECT current_setting('bcb.verdict');
ROLLBACK;
`);
}

describe.skipIf(!enabled)('прежнее имя клиники не возвращается в общий пул', () => {
  it('псевдоним нельзя удалить', () => {
    expect(aliasVerdict(`DELETE FROM public.organization_slug_claims WHERE id = v_alias;`)).toMatch(
      /^REJECTED.*durable organization slug claims cannot be deleted/u,
    );
  });

  it('псевдоним нельзя переписать на другую организацию', () => {
    expect(
      aliasVerdict(
        `UPDATE public.organization_slug_claims SET organization_id = v_foreign WHERE id = v_alias;`,
      ),
    ).toMatch(/^REJECTED.*aliases are immutable outside same-organization reclaim/u);
  });

  it('другая организация не может занять это же имя заново', () => {
    expect(
      aliasVerdict(
        `INSERT INTO public.organization_slug_claims (slug, kind, organization_id)
         VALUES ('${ALIAS_SLUG}', 'current', v_foreign);`,
      ),
      // Именно уникальность, а не формат имени: заглавный вариант отбивался бы
      // `organization_slug_claims_slug_format_check` и защита была бы ложной (замерено 11.09).
    ).toMatch(/^REJECTED.*unique|^REJECTED.*uq_organization_slug_claims_slug/u);
  });

  it('та же организация возвращает себе своё прежнее имя — дверь открыта', () => {
    expect(
      aliasVerdict(
        `UPDATE public.organization_slug_claims SET kind = 'alias'
           WHERE organization_id = v_org AND kind = 'current';
         UPDATE public.organization_slug_claims SET kind = 'current' WHERE id = v_alias;`,
      ),
    ).toBe('ACCEPTED');
  });
});
