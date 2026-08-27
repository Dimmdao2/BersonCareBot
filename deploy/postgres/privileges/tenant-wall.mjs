/**
 * ОДИН источник ответа на вопрос «какие отношения несут стену арендатора».
 *
 * До 22.08 этот ответ существовал ровно в одном файле — `tenant-isolation-wall.devDbProof.test.mjs`,
 * где он был локальной константой. Как только вторая проверка (гейт организационного предиката в
 * телах SECURITY DEFINER) начала спрашивать то же самое, список стал бы вторым — и разъехался бы
 * молча: одна проверка считает таблицу стенованной, вторая нет, и никто не краснеет. Поэтому он
 * вынесен сюда, а оба файла спрашивают ЗДЕСЬ (AGENTS.md §5, один общий проход).
 *
 * Сам СПИСОК ТАБЛИЦ здесь не лежит и лежать не может: предметы берутся из декларации по объявленной
 * стене. Таблица, добавленная в декларацию завтра, попадает под обе проверки сама.
 */

/**
 * Стены, которые несут организационный предикат. Остальные org-таблицы (`platform-role`) арендной
 * роли не открыты вовсе и предметом этих проверок не являются.
 */
export const TENANT_WALLS = new Set([
  'clinic',
  'clinic+patient',
  'reference-org-copy',
  'platform-role+clinic',
]);

/**
 * Стенованные арендой отношения одной базы: живые (`ACTIVE`) таблицы, чья ОБЪЯВЛЕННАЯ стена входит
 * в `TENANT_WALLS`. Стену определяет исключительно `wall`; поле `org` переписи здесь не при чём —
 * оно значит «перепись ИЗМЕРИЛА колонку organization_id», а не «у таблицы есть стена клиники», и
 * требование его держало вне проверки 50 стенованных таблиц (blind-audit F1, 2026-08-19/20).
 */
export function tenantWalledRelations(declaration, database) {
  const declared = declaration.databases[database];
  if (!declared) throw new Error(`декларация не знает базы '${database}'`);
  return Object.entries(declared.tables)
    .filter(([, table]) => TENANT_WALLS.has(table.wall) && table.disposition === 'ACTIVE')
    .map(([name]) => name)
    .sort();
}

/** Объединение по всем объявленным базам — для проверок, которые идут по телам, а не по одной базе. */
export function tenantWalledRelationsAcrossDatabases(declaration, databases) {
  const union = new Set();
  for (const database of databases) {
    for (const relation of tenantWalledRelations(declaration, database)) union.add(relation);
  }
  return union;
}

/**
 * Роли, у которых своя строка стены арендатора. `clinic` — роли, привязанные к ОДНОЙ клинике:
 * их ветка обязана сравнивать организацию строки с текущей. `patient` — пациентская роль: по
 * шаблону стены (`WALL_TEMPLATES['clinic+patient']`) её ветка идёт ПО СВОЕЙ СТРОКЕ, поэтому ей
 * достаточно собственного ключа человека, а организация в ветке — усиление, а не требование.
 */
export const TENANT_CLINIC_ROLES = new Set([
  'app_staff', 'app_clinic_billing', 'app_tenant_service', 'app_integrator_tenant_service',
  'app_integrator_request', 'app_integrator_resolver',
]);
export const TENANT_PATIENT_ROLE = 'app_patient';

/** Организационный предикат в любом объявленном виде: прямая колонка или EXISTS по родителю. */
const ORGANIZATION_PREDICATE = /current_org_id\(\)/u;
/** Собственный ключ человека — то, чем шаблон стены разрешает ограничить пациентскую ветку. */
const OWN_ROW_PREDICATE = /current_patient_user_id\(\)|current_actor_user_id\(\)/u;
/** Ветка, которая не пускает никого, стены не нарушает: пускать нечего. */
const DENIES_EVERYTHING = /^\(*\s*false\s*\)*$/iu;

/**
 * Ветка ролевого `CASE` внутри квала политики. Возвращает `null`, когда роль в квале отдельной
 * веткой не разобрана — тогда предметом проверки становится ВЕСЬ квал, что и требуется: политика
 * `(current_user = 'app_staff'::name)` без организации обязана краснеть.
 */
function roleCaseBranch(predicate, role) {
  const heads = [
    `WHEN current_user = '${role}'::name THEN `,
    ...[...predicate.matchAll(/WHEN current_user IN \(([^)]*)\) THEN /gu)]
      .filter((match) => match[1].includes(`'${role}'`))
      .map((match) => match[0]),
  ];
  for (const head of heads) {
    const at = predicate.indexOf(head);
    if (at === -1) continue;
    const start = at + head.length;
    let depth = 0;
    let end = start;
    for (; end < predicate.length; end += 1) {
      const char = predicate[end];
      if (char === '(') depth += 1;
      else if (char === ')') {
        if (depth === 0) break;
        depth -= 1;
      } else if (
        depth === 0
        && (predicate.startsWith('WHEN ', end)
          || predicate.startsWith('ELSE ', end)
          || predicate.startsWith('END', end))
      ) break;
    }
    return predicate.slice(start, end).trim();
  }
  return null;
}

/**
 * ИНВАРИАНТ A1. Каждая живая таблица, которая НЕСЁТ колонку `organization_id` (`org: true` — это
 * измеренный переписью факт наличия колонки), обязана сравнивать её с текущей организацией в
 * КАЖДОЙ разрешающей политике каждой арендной роли. До 27.08 это держалось на двух независимых
 * ручных списках внутри `declaration.ts` (`specialized` и `REV10_EXPLICIT_ORG_COLUMN`), и
 * `public.content_access_grants_webapp` попала в первый, но не во второй: сгенерированная политика
 * проверяла только имя роли, поэтому сотрудник любой клиники читал ВСЮ таблицу, включая токены
 * доступа чужих пациентов.
 *
 * Проверка идёт по объявленным политикам, а не по тексту SQL-артефакта: предмет — тот самый
 * предикат, который станет политикой в базе, поэтому переформатирование артефакта её не трогает, а
 * удаление предиката красит.
 */
export function tenantPredicateViolations(declaration, database) {
  const declared = declaration.databases[database];
  if (!declared) throw new Error(`декларация не знает базы '${database}'`);
  const violations = [];
  for (const [relation, table] of Object.entries(declared.tables)) {
    if (table.disposition !== 'ACTIVE' || table.org !== true) continue;
    for (const policy of table.policies ?? []) {
      if ('todo' in policy || policy.as !== 'PERMISSIVE') continue;
      for (const role of policy.to ?? []) {
        const clinicBound = TENANT_CLINIC_ROLES.has(role);
        if (!clinicBound && role !== TENANT_PATIENT_ROLE) continue;
        for (const qualifier of ['using', 'withCheck']) {
          const predicate = policy[qualifier];
          if (predicate === undefined) continue;
          const branch = roleCaseBranch(predicate, role) ?? predicate;
          if (DENIES_EVERYTHING.test(branch.trim())) continue;
          if (ORGANIZATION_PREDICATE.test(branch)) continue;
          if (!clinicBound && OWN_ROW_PREDICATE.test(branch)) continue;
          violations.push({
            database, relation, policy: policy.name, role, qualifier, branch,
            reason: clinicBound
              ? 'permissive tenant policy of an organization-scoped relation has no organization predicate'
              : 'permissive patient policy has neither an organization nor an own-row predicate',
          });
        }
      }
    }
  }
  return violations;
}

/** Одна строка на нарушение — текст читает и человек в ревью, и упавший гейт. */
export function describeTenantPredicateViolation(violation) {
  return `${violation.database} ${violation.relation} ${violation.policy} [${violation.role}.${violation.qualifier}]:`
    + ` ${violation.reason}; предикат: ${violation.branch}`;
}
