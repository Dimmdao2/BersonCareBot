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

/** Разбирает объявленные строки артефакта: имя → отношение, вид, команда, роль, выражение USING. */
export function declaredPolicies(policyNames) {
  const lines = readFileSync(GENERATED_ARTIFACT, 'utf8').split('\n');
  return policyNames.map(([table, name]) => {
    const line = lines.find((candidate) => candidate.includes(`CREATE POLICY "${name}"`));
    assert.ok(line, `${name}: строки нет в сгенерированном артефакте — декларация и тест разошлись`);
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
 * @param {[string, string][]} policyNames пары `[отношение, имя политики]`
 */
export function assertDeclaredPoliciesDeployed(psql, policyNames) {
  for (const declared of declaredPolicies(policyNames)) {
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
