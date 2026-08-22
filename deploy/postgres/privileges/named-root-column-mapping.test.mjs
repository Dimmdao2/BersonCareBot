/**
 * Отображение «параметр корня → колонка таблицы» внутри тела именованного корня.
 *
 * Пока запись шла реляционно из интегратора, эту привязку сторожил арбитр в самом вызывающем: тест
 * доставал индекс колонки ИЗ ТЕКСТА `INSERT` и сверял с ним значение, то есть ловил перестановку в
 * списке колонок при неизменном `VALUES`. D17 унёс `INSERT` в тело корня — и вместе с ним унёс
 * арбитра: вызывающий теперь передаёт позиционный набор аргументов, а привязку аргумента к колонке
 * делает миграция, которую не проверяет ни один тест, ни декларация (`relationSurfaces` знает
 * колонки, но не знает, какой параметр в какую из них попадает), ни `--check` генератора.
 *
 * Цена пропуска: перестановка `p_status`/`p_reason` в теле `app.integrator_record_notification_
 * delivery_attempt` — валидный SQL, зелёный деплой и журнал попыток доставки, в котором причина
 * отказа лежит в колонке статуса. PostgreSQL сводит два списка ПО ПОЗИЦИИ и про имена не знает.
 *
 * Правило: колонку, в которую попадает значение параметра, кормит ОДНОИМЁННЫЙ параметр. Осознанные
 * переименования существуют (колонка называется иначе, чем аргумент вызывающего) — они перечислены
 * поимённо переписью, чтобы новое расхождение нельзя было добавить молча.
 *
 * Область — именованные корни ПОРТА ИНТЕГРАТОРА: ровно те двери, которые заменили собой реляционную
 * запись интегратора и вместе с ней прежнего арбитра. Проверка идёт против ДЕЙСТВУЮЩИХ артефактов
 * схемы (generated snapshot + активные forward-миграции), то есть против того, что приедет в кластер.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { declaration } from './declaration.ts';
import { insertColumnBindings, latestArtifactFunctions } from './function-body-surface.mjs';
import { assertNameCensus } from './name-census.mjs';

const SCHEMA_SNAPSHOT = fileURLToPath(
  new URL('../generated/prod-to-target/schema-pre.sql', import.meta.url),
);
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../apps/webapp/db/drizzle-migrations', import.meta.url),
);

/** Snapshot первым, затем активные forward-миграции по имени файла — тот же порядок, что у раннера. */
const activeArtifacts = () => [
  SCHEMA_SNAPSHOT,
  ...readdirSync(MIGRATIONS_FOLDER).filter((file) => file.endsWith('.sql')).sort()
    .map((file) => join(MIGRATIONS_FOLDER, file)),
];

const integratorPortRoots = () => new Set(Object.values(declaration.portContext.capabilities)
  .filter((capability) => capability.port === 'integrator' && capability.functionIdentity)
  .map((capability) => capability.functionIdentity.slice(
    0, capability.functionIdentity.indexOf('('),
  ).toLowerCase()));

function bindingsOfIntegratorRoots() {
  const roots = integratorPortRoots();
  const found = [];
  for (const fn of latestArtifactFunctions(activeArtifacts())) {
    if (!roots.has(fn.name)) continue;
    for (const binding of insertColumnBindings(fn.body)) found.push({ ...binding, root: fn.name });
  }
  return found;
}

test('в теле каждого корня интегратора список колонок и список значений одной длины', () => {
  // Разная длина — единственный случай, когда PostgreSQL сам скажет «нет»; но скажет он это на
  // выкатке миграции, а не здесь, и уже после того, как половина цепочки применилась.
  assert.deepEqual(
    bindingsOfIntegratorRoots().filter((binding) => binding.column === null)
      .map((binding) => `${binding.root} -> ${binding.relation}: ${binding.expression}`),
    [],
  );
});

test('колонку кормит одноимённый параметр корня, а каждое исключение названо переписью', () => {
  const renames = bindingsOfIntegratorRoots()
    .filter((binding) => binding.parameter !== null && binding.parameter !== `p_${binding.column}`)
    .map((binding) => `${binding.root}: ${binding.relation}.${binding.column} <- ${binding.parameter}`);

  // Перепись, а не счётчик: перестановка двух параметров местами даёт ДВЕ новые строки с точными
  // именами колонок — читающий сразу видит, что `status` теперь кормит `p_reason`. Осознанное
  // переименование добавляется сюда явно (`BCB_UPDATE_NAME_CENSUS=1 pnpm test:db-privileges`).
  assertNameCensus(
    'integratorRootColumnParameterRenames',
    renames,
    'columns of an integrator named root fed by a differently named parameter',
  );
});
