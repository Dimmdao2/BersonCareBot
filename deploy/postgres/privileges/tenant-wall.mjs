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
