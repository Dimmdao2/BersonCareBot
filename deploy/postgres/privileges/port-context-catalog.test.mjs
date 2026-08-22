import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { declaration } from './declaration.ts';
import { assertNameCensus } from './name-census.mjs';
import {
  generatePortContextCapabilitySeedSql,
  renderPortContextRuntimeEnv,
  resolvePortContextCapabilities,
} from './generate.mjs';

const PORTS = ['webapp', 'integrator'];

const DECLARATION_PATH = fileURLToPath(new URL('./declaration.ts', import.meta.url));

// Повторный ключ в объектном литерале JS — не ошибка и не предупреждение: побеждает последнее
// определение, а первое исчезает ДО того, как декларацию увидит хоть один импорт. Поэтому найти
// потерю можно только в исходнике декларации: любая проверка, которая сверяет уже загруженный
// объект с другим видом того же объекта, потеряет строку на ОБЕИХ сторонах и останется зелёной.
// Разбор идёт настоящим парсером TypeScript, а не текстовым поиском: значение имеет позиция ключа
// в дереве (какому литералу он принадлежит), а не то, как строка выглядит.
function findDuplicateObjectKeys(sourcePath) {
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );
  const duplicates = [];
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const firstLine = new Map();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)
          && !ts.isMethodDeclaration(property)) continue;
        const { name } = property;
        if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) continue;
        const key = name.text;
        if (firstLine.has(key)) duplicates.push(`${key}: объявлен на :${firstLine.get(key)}, вытеснен на :${lineOf(property)}`);
        else firstLine.set(key, lineOf(property));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return duplicates;
}

test('no declared key is silently overwritten by a later twin in the same object literal', () => {
  // Живой отказ, который это ловит: дверь порта интегратора на корень поддержки была объявлена
  // ключом, уже занятым дверью порта вебаппа. Объявление интегратора исчезло до генерации, в
  // артефакты уехало 5 возможностей вместо 6, отбор возможности по `functionIdentity` перестал
  // находить дверь, и запись в `support_delivery_events` прекратилась — молча, под видом
  // «передний план упал, доедет повтором». Разные двери на один корень различаются ключом
  // (`integrator_port_*`), а `runtimeName` у них может совпадать: он уникален В ПРЕДЕЛАХ порта.
  assert.deepEqual(findDuplicateObjectKeys(DECLARATION_PATH), []);
});

test('the generator library refuses a mistaken direct CLI invocation', () => {
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    new URL('./generate.mjs', import.meta.url).pathname,
    '--all',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /generate-cli\.mjs/);
});

test('one declaration renders the exact DB catalog and both runtime JSON catalogs', () => {
  const rows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  // Резолвер обязан отдать РОВНО объявленный каталог возможностей, один в один. Счёт «236» не
  // отличал потерянную возможность от лишней и не называл ни ту, ни другую; сверка имён с самим
  // каталогом (второй копии не заводим — AGENTS.md §5) называет обе стороны расхождения.
  assert.deepEqual(
    rows.map((row) => row.name).sort(),
    Object.keys(declaration.portContext.capabilities).sort(),
    'resolved capabilities must be exactly the declared capability catalog',
  );
  const duplicateIds = rows.map((row) => row.capabilityId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  assert.deepEqual(duplicateIds.map((id) => rows.filter((row) => row.capabilityId === id)
    .map((row) => `${row.port}/${row.name}`).join(' = ')), [], 'capability IDs must stay unique');
  assert.ok(new Set(rows.map((row) => [
    row.port,
    row.sessionLogin,
    row.targetRole,
    row.contextClass,
    row.purpose,
    row.functionIdentity ?? '',
  ].join('\0'))).size <= rows.length, 'capability IDs remain the authority even when descriptive tuples coincide');

  for (const port of PORTS) {
    const rendered = renderPortContextRuntimeEnv(
      declaration,
      'test',
      'bersoncarebot_test',
      port,
    );
    const descriptors = JSON.parse(rendered.value);
    // Лишнее имя в рантайм-каталоге — дверь, которой нет в декларации: приложение получит
    // дескриптор, который никто не сверял. Счёт портов этого не называл.
    assert.deepEqual(
      Object.keys(descriptors).sort(),
      rows.filter((row) => row.port === port).map((row) => row.runtimeName).sort(),
      `${port} runtime catalog must carry exactly the resolved capabilities`,
    );
    for (const row of rows.filter((candidate) => candidate.port === port)) {
      assert.deepEqual(descriptors[row.runtimeName], {
        capabilityId: row.capabilityId,
        targetRole: row.targetRole,
        contextClass: row.contextClass,
        purpose: row.purpose,
        ...(row.functionIdentity ? { functionIdentity: row.functionIdentity } : {}),
        ...(row.runtimeSources?.length ? { runtimeSources: row.runtimeSources } : {}),
      });
    }
  }

  const integrator = JSON.parse(renderPortContextRuntimeEnv(
    declaration, 'test', 'bersoncarebot_test', 'integrator',
  ).value);
  const webapp = JSON.parse(renderPortContextRuntimeEnv(
    declaration, 'test', 'bersoncarebot_test', 'webapp',
  ).value);
  for (const name of ['delivery', 'scheduler', 'service', 'resolver']) {
    assert.equal(integrator[name].purpose, 'relation');
    if (name !== 'resolver') assert.ok(integrator[name].runtimeSources.length > 0);
  }
  for (const name of ['worker', 'telemetry']) {
    assert.equal(webapp[name].purpose, 'relation');
    assert.ok(webapp[name].runtimeSources.length > 0);
  }
  assert.equal(webapp.pre_session, undefined, 'anonymous bootstrap has no relation-wide fallback');
  assert.equal(webapp.tenant_service, undefined);
  assert.equal(webapp.service, undefined);

  const roots = rows.filter((row) => row.functionIdentity);
  // Дверь без `functionIdentity` — это возможность со сквозным `purpose: 'relation'`: доступ к
  // отношениям целиком вместо одного именованного корня. Счётчик корней («221») падал бы числом
  // 220 и не сказал бы, КАКАЯ дверь разъехалась в relation-wide. Поэтому фиксируем поимённо
  // ДОПОЛНЕНИЕ — оно короткое и меняться не должно вовсе.
  assertNameCensus(
    'relationWideCapabilities',
    rows.filter((row) => !row.functionIdentity).map((row) => `${row.port}/${row.name}`),
    'capabilities that hold relation-wide access instead of one named root',
  );
  const identityResolvers = roots.filter(
    (row) => row.functionIdentity === 'app.pre_session_resolve_identity(uuid,text)',
  );
  assert.deepEqual(
    identityResolvers.map((row) => [row.runtimeName, row.sessionLogin]),
    [
      ['globalAdmin_identity_resolve', 'bcb_test_webapp_global_admin'],
      ['patient_identity_resolve', 'bcb_test_webapp_patient'],
      ['staff_identity_resolve', 'bcb_test_webapp_staff'],
    ],
  );
});

test('relation capability mutations are visible to the declaration-owned seed', () => {
  const mutated = structuredClone(declaration);
  const descriptor = mutated.portContext.capabilities.integrator_delivery_relation;
  descriptor.contextClass = 'integrator';
  const seed = generatePortContextCapabilitySeedSql(mutated, 'bersoncarebot_test');
  const original = generatePortContextCapabilitySeedSql(declaration, 'bersoncarebot_test');
  assert.notEqual(seed, original);
  assert.match(seed, /'app_operational_delivery_worker'::name, 'integrator'::app\.port_context_class/);
});

test('capability IDs are stable per database and do not cross environments', () => {
  const testRows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  const devRows = resolvePortContextCapabilities(declaration, 'bcb_webapp_dev');
  assert.deepEqual(
    resolvePortContextCapabilities(declaration, 'bersoncarebot_test'),
    testRows,
  );
  assert.equal(
    testRows.some((row) => devRows.some((candidate) => candidate.capabilityId === row.capabilityId)),
    false,
  );
});

test('every descriptor target is SET-able by its exact session login', () => {
  assert.doesNotThrow(() => resolvePortContextCapabilities(declaration, 'bersoncarebot_test'));

  const unreachable = structuredClone(declaration);
  const staffLogin = unreachable.envMapping.test.bcb_test_webapp_staff;
  staffLogin.memberships = staffLogin.memberships.filter((membership) => membership.role !== 'app_worker');
  assert.throws(
    () => resolvePortContextCapabilities(unreachable, 'bersoncarebot_test'),
    /bcb_test_webapp_staff must have exactly one SET-able membership in app_worker/,
  );
});

test('staff and global-admin login memberships stay disjoint at the platform boundary', () => {
  const staff = declaration.envMapping.test.bcb_test_webapp_staff.memberships.map(({ role }) => role);
  const globalAdmin = declaration.envMapping.test.bcb_test_webapp_global_admin.memberships.map(({ role }) => role);
  assert.equal(staff.includes('app_platform_settings') || staff.includes('app_platform_admin'), false);
  for (const role of ['app_staff', 'app_patient', 'app_clinic_billing', 'app_worker']) {
    assert.equal(globalAdmin.includes(role), false, role);
  }
  assert.deepEqual(globalAdmin, ['app_platform_settings', 'app_platform_admin']);
});

// Регистрация специалиста («открыто → создать клинику») и регистрация клиента с паролем идут под
// bootstrap-принципалом: именованного корня в области видимости нет — рантайм ищет обобщённое имя
// `pre_session`, его в каталоге нет и не должно быть, и запрос падает 500
// («Missing declared webapp port capability: pre_session»). Единственная защита от возврата — чтобы
// КАЖДЫЙ корень этого пути был объявлен возможностью класса `pre_session`: тогда рантайм резолвит
// его по `functionIdentity` и обобщённое имя не запрашивается вовсе. Список — корни пути, а не текст
// исходника: он держится тем, что происходит с живым человеком, а не тем, как написан вызов.
const BOOTSTRAP_REGISTRATION_ROOTS = [
  'app.email_password_register_pending(text,text,text,text,text,text)',
  'app.email_password_find_user_id_by_email_challenge(uuid)',
  'app.email_password_delete_unverified_registration(uuid)',
  'app.email_password_find_login_candidate(text)',
  'app.get_specialist_signup_intent_by_challenge(uuid)',
  'app.email_auth_start_challenge(uuid,text,text,bigint,text,text)',
  'app.email_auth_find_email_challenge_for_confirm(uuid,uuid)',
  'app.email_auth_increment_email_challenge_attempts(uuid)',
  'app.email_auth_find_email_owner_conflict(uuid,text)',
  'app.email_auth_verify_user_email(uuid,text)',
  'app.email_auth_delete_email_challenges_for_user(uuid)',
];

test('every registration root the bootstrap principal calls resolves as a pre_session capability', () => {
  for (const dbName of ['bersoncarebot_test', 'bcb_webapp_dev']) {
    const env = dbName === 'bersoncarebot_test' ? 'test' : 'dev';
    const descriptors = JSON.parse(
      renderPortContextRuntimeEnv(declaration, env, dbName, 'webapp').value,
    );
    // Ровно та ветка, которой резолвит рантайм для bootstrap-принципала в области именованного
    // корня: совпадение по `functionIdentity` И `contextClass === 'pre_session'`.
    for (const identity of BOOTSTRAP_REGISTRATION_ROOTS) {
      const matches = Object.entries(descriptors).filter(
        ([, descriptor]) => descriptor.functionIdentity === identity
          && descriptor.contextClass === 'pre_session',
      );
      assert.equal(
        matches.length,
        1,
        `${dbName}: ${identity} must resolve to exactly one pre_session capability, got ${matches.length}`,
      );
      assert.equal(matches[0][1].targetRole, 'app_pre_session', identity);
      const declared = declaration.portContext.functions[identity];
      assert.deepEqual(
        declared.execute,
        ['app_pre_session'],
        `${identity}: EXECUTE принадлежит роли контекста, иначе корень отдаёт 42501 уже после резолва`,
      );
    }
    // Обобщённой возможности с именем `pre_session` быть не должно: она открыла бы реляционный
    // доступ всему, что бежит до сессии, вместо перечисленных корней.
    assert.equal(
      Object.hasOwn(descriptors, 'pre_session'),
      false,
      `${dbName}: a generic 'pre_session' capability must never exist`,
    );
  }
});

// D17. Логин интегратора носил РОЛЬ ВЕБАППА `app_tenant_service` и ходил под ней в тринадцать
// дверей своего порта. Двери, где корень принадлежит интегратору одному, переведены на его
// собственную роль `app_integrator_request`; остаток назван поимённо. Счётчик здесь не годится:
// «три» не сказало бы, КАКАЯ дверь снова уехала на чужую роль, а именно это и есть регрессия —
// интегратор получает 62 отношения арендаторского стола вебаппа, включая ПДн `platform_users`.
// Перепись обязана пустеть, а не расти: пока она непуста, членство логина в `app_tenant_service`
// снять нельзя.
test('integrator port doors on the webapp tenant role are named, and the list only shrinks', () => {
  const rows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  assertNameCensus(
    'integratorDoorsOnTheWebappTenantRole',
    rows
      .filter((row) => row.port === 'integrator' && row.targetRole === 'app_tenant_service')
      .map((row) => `${row.runtimeName} -> ${row.functionIdentity ?? 'relation-wide'}`),
    'integrator port capabilities still reached through the webapp tenant role',
  );
});

// Опознание получателя во входящем событии. Вебхук выбирает принципал тройкой
// `integrator` → `organization` → `bootstrap` (`telegram/webhook.ts:372,377,378`), а рантайм порта
// интегратора резолвит именованный корень по паре (`functionIdentity`, класс, выведенный из
// принципала). Пока дверь была одна, работал только средний маршрут: под интеграторским рантайм
// не находил возможности и бросал, бросок доходил до `eventGateway` и человек не получал НИ ОДНОГО
// ответа на своё сообщение. Проверка держится на этом, а не на счётчике дверей: она называет, что
// резолвится под каждым из трёх принципалов.
//
// Третьей двери, bootstrap-класса, здесь быть НЕ должно: этот класс по контракту
// (`app.install_port_context`) не несёт организации, а без неё стена арендатора в теле корня не
// выполнима — дверь читала бы чужого арендатора. Под bootstrap чтение не делается вовсе
// (`repos/platformUserByChannel.ts`).
const RECIPIENT_ROOT = 'app.integrator_read_channel_binding_identity(text,text,text)';

test('the incoming-recipient root has exactly one door per webhook principal that carries a tenant', () => {
  for (const dbName of ['bersoncarebot_test', 'bcb_webapp_dev']) {
    const env = dbName === 'bersoncarebot_test' ? 'test' : 'dev';
    const descriptors = JSON.parse(
      renderPortContextRuntimeEnv(declaration, env, dbName, 'integrator').value,
    );
    const doors = Object.values(descriptors).filter(
      (descriptor) => descriptor.functionIdentity === RECIPIENT_ROOT,
    );
    // Организационный принципал резолвит класс `tenant_service`, интеграторский — `integrator`;
    // ровно по одной двери на каждый, обе — на СВОЕЙ роли порта интегратора.
    assert.deepEqual(
      doors.map((descriptor) => [descriptor.contextClass, descriptor.targetRole]).sort(),
      [['integrator', 'app_integrator_request'], ['tenant_service', 'app_integrator_request']],
      `${dbName}: ${RECIPIENT_ROOT} must open for the organization and the integrator principal, each on the integrator's own role`,
    );
    // Ветка резолвера для bootstrap-принципала (`portContextRuntime.ts:219-223`): класс
    // `pre_session` ЛИБО класс `integrator` на роли `app_integrator_resolver`.
    assert.deepEqual(
      doors.filter((descriptor) => descriptor.contextClass === 'pre_session'
        || descriptor.targetRole === 'app_integrator_resolver'),
      [],
      `${dbName}: a bootstrap-reachable door would read this root without a tenant wall`,
    );
    assert.deepEqual(
      declaration.portContext.functions[RECIPIENT_ROOT].execute,
      ['app_integrator_request'],
      'EXECUTE принадлежит одной роли: обе двери — порта интегратора, чужая роль не называется',
    );
  }
});

test('the incoming-recipient class probe stays internal to the context and identity seams', () => {
  const probe = declaration.portContext.functions['app.integrator_context_installed()'];
  assert.equal(probe.owner, 'app_seam_context_owner');
  assert.equal(probe.invocation, 'internal');
  assert.equal(probe.returns, 'boolean');
  assert.deepEqual(probe.execute, ['app_seam_identity_lookup_owner']);
  assert.deepEqual(
    Object.values(declaration.portContext.capabilities)
      .filter((capability) => capability.functionIdentity === 'app.integrator_context_installed()'),
    [],
    'an internal class probe must not become a third runtime door',
  );
});
