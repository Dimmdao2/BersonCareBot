/**
 * ОДНА проверка для всех живых доказательств платформенного чтения: объявленное в декларации прав
 * действительно РАЗВЁРНУТО на базе.
 *
 * Зачем отдельный модуль (12.09.2026, по находке независимого аудита). Доказательства платформенного
 * чтения создают проверяемые политики по точным именам внутри своей транзакции и откатывают их вместе
 * с фикстурами — так они проверяют ФОРМУ предиката, не завися от того, дошёл ли reconcile до DEV. Но у
 * этой конструкции есть слепое пятно: если политик на базе НЕТ ВОВСЕ, тест всё равно зелёный, потому
 * что сравнивает прогон сам с собой. Замерено аудитором: со снесёнными политиками страница показывала
 * ноль платформенных комплексов, а файл — 7/7 зелёных; со снесённой только дочерней карточка
 * открывалась с пустым составом — снова зелено. Сценарий не гипотетический: reconcile из feat уже
 * сносил политики неприземлённой ветки.
 *
 * Поэтому здесь второй, независимый oracle: строки берутся из СГЕНЕРИРОВАННОГО артефакта DEV и
 * сверяются с `pg_policies` — имя, отношение, permissive/restrictive, команда, грантополучатель и
 * предикат. Предикаты сравниваются НЕ текстом файла с текстом базы (PostgreSQL переписывает выражение
 * по-своему), а через пробную политику с выражением из артефакта, созданную и откаченную в той же
 * транзакции: нормализатор один, значит расхождение означает расхождение.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const GENERATED_ARTIFACT = new URL('../generated/privileges.bcb_webapp_dev.sql', import.meta.url);

/**
 * Политика адресуется парой «отношение + ПРЕФИКС имени», а НЕ полным именем с номером.
 *
 * Хвостовой номер в `rev10_*_193` — это не идентификатор таблицы, а ЕЁ ПОЗИЦИЯ В МАССИВЕ:
 * `declaration.ts` раскладывает `Object.entries(APP_TABLES)` через `index` и печатает
 * `rev10_context_gate_${index + 1}`, `rev10_named_root_owner_gate_${index + 1}`,
 * `rev10_tenant_${op}_${index + 1}`, `rev10_seam_business_${index + 1}`,
 * `rev10_platform_lfk_read_${index + 1}`. Любая новая таблица, вставшая в алфавитном порядке раньше,
 * перенумеровывает ВСЁ, что за ней: `public.system_settings` успела побывать _198, _199 и _200.
 *
 * Поэтому хардкод полного имени — сторож, который краснеет на чужой безобидной таблице и чинится
 * только перепечатыванием числа вслепую. Пара `[отношение, префикс]` называет ровно тот инвариант,
 * который проверяется («на этом отношении объявлена политика такого рода»), и переживает любой сдвиг
 * нумерации. Номер вычитывается из артефакта в момент прогона.
 */
function policyLines(artifact = GENERATED_ARTIFACT) {
  return readFileSync(artifact, 'utf8').split('\n').filter((line) => line.startsWith('CREATE POLICY "'));
}

function findPolicyLine(lines, relation, policyPrefix) {
  const head = new RegExp(
    `^CREATE POLICY "(${policyPrefix}\\d+)" ON "public"\\."${relation}" `,
    'u',
  );
  const matched = lines.flatMap((line) => {
    const name = head.exec(line)?.[1];
    return name ? [{ name, line }] : [];
  });
  assert.ok(matched.length > 0,
    `${policyPrefix}* на public.${relation}: такой политики нет в сгенерированном артефакте — `
    + 'декларация и тест разошлись по СУТИ, а не по номеру');
  assert.equal(matched.length, 1,
    `${policyPrefix}* на public.${relation}: артефакт объявляет несколько подходящих политик `
    + `(${matched.map(({ name }) => name).join(', ')}) — префикс адресует неоднозначно`);
  return matched[0];
}

/**
 * Имя объявленной политики по паре `[отношение, префикс]` — для подстановки в сырой SQL теста.
 * `artifact` задают те тесты, у которых артефакт параметризован именем базы.
 */
export function declaredPolicyName(relation, policyPrefix, artifact = GENERATED_ARTIFACT) {
  return findPolicyLine(policyLines(artifact), relation, policyPrefix).name;
}

/** Разбирает объявленные строки артефакта: отношение + префикс → вид, команда, роль, выражение USING. */
export function declaredPolicies(policySelectors, artifact = GENERATED_ARTIFACT) {
  const lines = policyLines(artifact);
  return policySelectors.map(([table, policyPrefix]) => {
    const { name, line } = findPolicyLine(lines, table, policyPrefix);
    const parsed = new RegExp(
      `^CREATE POLICY "${name}" ON "public"\\."([a-z_]+)" AS (PERMISSIVE|RESTRICTIVE)`
      + ' FOR ([A-Z]+) TO "([a-z_]+)" USING \\((.+)\\);$',
      'u',
    ).exec(line);
    assert.ok(parsed, `${name}: строка артефакта не разобралась:\n${line}`);
    const [, relation, permissive, command, role, using] = parsed;
    assert.equal(relation, table, `${name}: артефакт ставит политику не на то отношение`);
    return { name, table, permissive, command, role, using };
  });
}

/**
 * @param {(sql: string) => { stdout: string }} psql запускалка запросов вызывающего теста
 * @param {[string, string][]} policySelectors пары `[отношение, префикс имени политики]`
 */
export function assertDeclaredPoliciesDeployed(psql, policySelectors) {
  for (const declared of declaredPolicies(policySelectors)) {
    const probe = `conformance_probe_${declared.name}`;
    const seen = new Map(psql(`
BEGIN;
SELECT 'LIVE_SHAPE|' || count(*)::text FROM pg_policies
 WHERE schemaname = 'public' AND tablename = '${declared.table}' AND policyname = '${declared.name}'
   AND permissive = '${declared.permissive}' AND cmd = '${declared.command}'
   AND roles::text = '{${declared.role}}';
CREATE POLICY ${probe} ON public.${declared.table} AS ${declared.permissive}
  FOR ${declared.command} TO ${declared.role} USING (${declared.using});
SELECT 'QUAL_MATCH|' || ((
  (SELECT qual FROM pg_policies WHERE tablename = '${declared.table}' AND policyname = '${declared.name}')
  IS NOT DISTINCT FROM
  (SELECT qual FROM pg_policies WHERE tablename = '${declared.table}' AND policyname = '${probe}')
))::text;
ROLLBACK;`).stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('|'))
      .map((line) => line.split('|')));

    assert.equal(seen.get('LIVE_SHAPE'), '1',
      `${declared.name}: на базе нет политики объявленной формы (отношение ${declared.table}, `
      + `${declared.permissive}/${declared.command}, роль ${declared.role}). Права объявлены, но не `
      + 'развёрнуты — примени сгенерированный артефакт на DEV, иначе интерфейс молча теряет '
      + 'платформенный слой, а форменные проверки этого файла остаются зелёными.');
    assert.equal(seen.get('QUAL_MATCH'), 'true',
      `${declared.name}: предикат живой политики отличается от объявленного в артефакте`);
  }
}
