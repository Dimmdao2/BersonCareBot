/**
 * ГЕЙТ: корень SECURITY DEFINER, доступный арендатору и читающий таблицу со стеной арендатора,
 * обязан нести в теле привязку к принципалу порта — либо НАЗВАННУЮ причину, почему её нет.
 *
 * Вопрос владельца 22.08, дословно: «то что мы сделали безопасно тоже и ограничение сделано так
 * что в соседней функции его не забудут поставить?». Замер: не забудут — не гарантировало ничто.
 * Поведенческая проверка `tenant-isolation-wall.devDbProof` доказывает изоляцию через ПОЛИТИКИ, а
 * `SECURITY DEFINER` исполняется правами владельца и политику обходит. Стену в телах держали
 * поимённо — инъекцией на каждый приземлённый корень. Следующий корень, написанный без предиката,
 * не покраснел бы нигде и молча отдавал бы строки чужой клиники.
 *
 * ЧТО ЗДЕСЬ ОРАКУЛ, А ЧТО ВЫВОДИТСЯ:
 *   — предметы (стенованные отношения) — из декларации по объявленной стене, через общий
 *     `tenant-wall.mjs`; ни одного имени таблицы в этом файле нет;
 *   — арендные роли — из матрицы классов ЖИВОГО тела `app.install_port_context`, скрещённой с
 *     объявленными возможностями порта; ни одного имени роли в этом файле нет;
 *   — тела — из ДЕЙСТВУЮЩИХ артефактов схемы (snapshot + активные forward-миграции), то есть из
 *     того, что приедет в кластер, а не из пересказа в декларации;
 *   — свойство и граница его точности — в шапке `definer-tenant-predicate.mjs`, раздел
 *     «ЧЕГО ЭТА ПРОВЕРКА НЕ ЛОВИТ». Читать до того, как ей поверить.
 *
 * Проверяется ПОВЕДЕНИЕ разбора, а не текст исходника: ни одна проверка ниже не спрашивает, есть ли
 * в теле подстрока `current_org_id`. Инъекции в конце файла показывают четыре вещи: снятый предикат
 * краснеет и называет виновника, перенос предиката на СОСЕДНЕЕ отношение краснеет (гейт по подстроке
 * остался бы зелёным), другое написание той же стены остаётся зелёным, пометка без причины краснеет.
 * Одна из инъекций идёт по ЖИВОМУ телу корня D17, а не по фикстуре, и после неё тело побайтно прежнее.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';
import { activeSchemaArtifacts, latestArtifactFunctions } from './function-body-surface.mjs';
import {
  boundAliases,
  organizationBearingContextClasses,
  principalAccessorClosure,
  principalDerivedVariables,
  tenantRuntimeRoles,
  unboundTenantReads,
} from './definer-tenant-predicate.mjs';
import { assertNameCensus } from './name-census.mjs';
import { tenantWalledRelationsAcrossDatabases } from './tenant-wall.mjs';

const DATABASES = ['bersoncarebot_test', 'bcb_webapp_dev'];
const INSTALL_PORT_CONTEXT = 'app.install_port_context';

const artifactBodies = () => new Map(latestArtifactFunctions(activeSchemaArtifacts())
  .map((fn) => [fn.name, fn]));

/** Затравка замыкания — объявленные скалярные аксессоры контракта port-context, не список здесь. */
const declaredContextAccessors = () => Object.entries(declaration.portContext.functions)
  .filter(([signature, fn]) => fn.bodyRelationSurfaceContract === 'port-context' && signature.endsWith('()'))
  .map(([signature]) => signature)
  .filter((signature) => /^app\.current_[a-z_]+\(\)$/.test(signature));

function analysis() {
  const bodies = artifactBodies();
  const install = bodies.get(INSTALL_PORT_CONTEXT);
  assert.ok(install, `${INSTALL_PORT_CONTEXT} отсутствует в артефактах — сверять матрицу классов не с чем`);
  const principalCalls = principalAccessorClosure([...bodies.values()], declaredContextAccessors());
  const tenantRoles = tenantRuntimeRoles(declaration, install.body);
  const walled = tenantWalledRelationsAcrossDatabases(declaration, DATABASES);
  const isWalled = (relation) => walled.has(relation);

  const subjects = [];
  for (const [signature, fn] of Object.entries(declaration.portContext.functions)) {
    if (fn.security !== 'DEFINER') continue;
    if (!(fn.execute ?? []).some((role) => tenantRoles.has(role))) continue;
    const body = bodies.get(signature.slice(0, signature.indexOf('(')).toLowerCase());
    if (!body) continue;
    subjects.push({
      signature,
      fn,
      unbound: unboundTenantReads(body.body, isWalled, principalCalls),
    });
  }
  return { bodies, principalCalls, tenantRoles, walled, subjects };
}

const markerOf = (fn, relation) => (fn.relationSurfaces ?? [])
  .find((surface) => surface.relation === relation)?.crossesTenantWall;

/* ============================================================================================
 * ЧТО СЧИТАЕТСЯ ПРЕДМЕТОМ — выведено, а не вписано
 * ========================================================================================== */

test('арендные роли выведены из живой матрицы классов, а не из списка в проверке', () => {
  const bodies = artifactBodies();
  const carries = organizationBearingContextClasses(bodies.get(INSTALL_PORT_CONTEXT).body);
  // Класс, установка которого требует организацию, — арендный; класс, у которого её быть не может,
  // стеной арендатора не защищён вовсе. Разбор обязан различать оба, иначе он не разбор.
  assert.ok([...carries.values()].some(Boolean), 'ни один класс контекста не требует организации — разбор сломан');
  assert.ok([...carries.values()].some((value) => !value), 'все классы требуют организацию — разбор сломан');

  const roles = tenantRuntimeRoles(declaration, bodies.get(INSTALL_PORT_CONTEXT).body);
  assert.ok(roles.size > 0);
  // Роль, которую сама матрица описала отдельной веткой БЕЗ организации, арендной быть не может —
  // именно на этой ветке разбор «по классу целиком» дал бы неверный ответ.
  for (const [key, value] of carries) {
    if (value || !key.includes('/')) continue;
    assert.equal(roles.has(key.slice(key.indexOf('/') + 1)), false,
      `${key}: матрица классов запрещает организацию, а роль признана арендной`);
  }
  assertNameCensus('tenantRuntimeRoles', roles, 'рантайм-роли, входящие в базу с организацией');
});

test('предметы гейта — стенованные таблицы декларации, а не список в файле', () => {
  const walled = tenantWalledRelationsAcrossDatabases(declaration, DATABASES);
  assert.ok(walled.size > 100, `стенованных отношений всего ${walled.size} — декларация или разбор сломаны`);
  for (const database of DATABASES) {
    for (const [name, table] of Object.entries(declaration.databases[database].tables)) {
      if (table.disposition !== 'ACTIVE') continue;
      // Таблица под стеной клиники обязана быть предметом; вне её — не обязана. Это ровно то же
      // правило, по которому предметы берёт поведенческая проверка изоляции.
      if (table.wall === 'clinic' || table.wall === 'clinic+patient') {
        assert.ok(walled.has(name), `${database}: ${name} несёт стену ${table.wall}, но не предмет`);
      }
      if (table.wall === 'platform-role' || table.wall === 'closed') {
        assert.equal(walled.has(name), false, `${database}: ${name} (${table.wall}) попал в предметы`);
      }
    }
  }
});

test('аксессоры принципала замкнуты транзитивно и не вбирают обёртки над чужими корнями', () => {
  const bodies = artifactBodies();
  const seed = declaredContextAccessors();
  assert.ok(seed.length >= 4, `объявленных скалярных аксессоров контекста ${seed.length} — затравка пуста`);
  const calls = principalAccessorClosure([...bodies.values()], seed);
  for (const accessor of seed) assert.ok(calls.includes(accessor), accessor);
  // Обёртка, которой принципал передан АРГУМЕНТОМ, возвращает не принципал — и аксессором не
  // становится. Иначе любой корень «за деньги клиники» стал бы стеной сам себе.
  const wrapper = [...bodies.values()].find((fn) => fn.name === 'app.saas_billing_effective_tariff_for_current_org');
  if (wrapper) assert.equal(calls.includes(`${wrapper.name}()`), false, wrapper.name);
  assertNameCensus('principalAccessorClosure', calls, 'аксессоры принципала порта');
});

/* ============================================================================================
 * САМ ГЕЙТ
 * ========================================================================================== */

test('каждое чтение стенованной таблицы в арендном DEFINER-корне привязано к принципалу либо названо', () => {
  const { subjects } = analysis();
  assert.ok(subjects.length > 100, `предметов всего ${subjects.length} — разбор тел или декларация сломаны`);

  const unexplained = [];
  for (const { signature, fn, unbound } of subjects) {
    for (const relation of [...new Set(unbound.map((finding) => finding.relation))].sort()) {
      const marker = markerOf(fn, relation);
      if (marker && typeof marker.why === 'string' && marker.why.trim().length >= 40) continue;
      unexplained.push(marker
        ? `${signature} -> ${relation}: пометка crossesTenantWall без внятной причины`
        : `${signature} -> ${relation}: чтение стенованной таблицы не привязано к принципалу порта`);
    }
  }
  assert.deepEqual(unexplained.sort(), [], [
    'SECURITY DEFINER обходит RLS: перечисленные чтения возвращают строку любой клиники,',
    'потому что тело не сузило их принципалом порта и причина этого нигде не названа.',
    'Либо предикат в теле (миграция), либо `crossesTenantWall: { why: … }` на этой поверхности.',
  ].join('\n'));
});

test('пометка crossesTenantWall не живёт там, где предикат на месте, и набор помеченных пар записан', () => {
  const { subjects } = analysis();
  const marked = [];
  const stale = [];
  for (const { signature, fn, unbound } of subjects) {
    const unboundRelations = new Set(unbound.map((finding) => finding.relation));
    for (const surface of fn.relationSurfaces ?? []) {
      if (!surface.crossesTenantWall) continue;
      marked.push(`${signature} -> ${surface.relation}`);
      // Пометка, которой больше нечего объяснять, — выключенная проверка, забытая после того, как
      // предикат в тело всё-таки поставили. Такая пометка снимает будущую регрессию молча.
      if (!unboundRelations.has(surface.relation)) stale.push(`${signature} -> ${surface.relation}`);
    }
  }
  assert.deepEqual(stale.sort(), [],
    'пометка стоит на чтении, которое УЖЕ привязано к принципалу: снять пометку, а не проверку');
  assertNameCensus('definerRootsCrossingTenantWall', marked,
    'пары «арендный DEFINER-корень → стенованное отношение», читаемые без организационного предиката');
});

test('пометка на функции, которую арендатор позвать не может, не заводится', () => {
  const bodies = artifactBodies();
  const tenantRoles = tenantRuntimeRoles(declaration, bodies.get(INSTALL_PORT_CONTEXT).body);
  const outside = [];
  for (const [signature, fn] of Object.entries(declaration.portContext.functions)) {
    if ((fn.relationSurfaces ?? []).every((surface) => !surface.crossesTenantWall)) continue;
    if (!(fn.execute ?? []).some((role) => tenantRoles.has(role))) outside.push(signature);
  }
  assert.deepEqual(outside.sort(), [],
    'пометка объясняет отсутствие ОРГАНИЗАЦИОННОГО предиката; у неарендного вызывающего организации нет вовсе');
});

/* ============================================================================================
 * ИНЪЕКЦИИ — проверка ловит СВОЙСТВО, а не написание
 * ========================================================================================== */

const PRINCIPAL = ['app.current_org_id()', 'app.current_patient_user_id()'];
const WALLED = new Set(['public.fixture_notes', 'public.fixture_members', 'public.fixture_people']);
const isFixtureWalled = (relation) => WALLED.has(relation);

test('инъекция: снятый организационный предикат краснеет и называет отношение поимённо', () => {
  const withWall = `
    v_org uuid := app.current_org_id();
    select note.body into v_body from public.fixture_notes as note
     where note.id = p_note_id and note.organization_id = v_org;
  `;
  assert.deepEqual(unboundTenantReads(withWall, isFixtureWalled, PRINCIPAL), []);

  const withoutWall = withWall.replace(' and note.organization_id = v_org', '');
  const findings = unboundTenantReads(withoutWall, isFixtureWalled, PRINCIPAL);
  assert.deepEqual(findings.map((finding) => `${finding.relation}~${finding.alias}`),
    ['public.fixture_notes~note']);
  // Инъекция, которая ничего не заменила, «доказывает» стену, ничего не сделав: текст обязан был
  // измениться (D17, где первый вариант инъекции молча давал 0 → 0).
  assert.notEqual(withoutWall, withWall);
});

test('инъекция: предикат, перенесённый на СОСЕДНЕЕ отношение, краснеет — гейт по подстроке не заметил бы', () => {
  const rightRelation = `
    v_org uuid := app.current_org_id();
    select note.body from public.fixture_notes as note
     inner join public.fixture_members as member on member.id = p_member_id
     where note.organization_id = v_org;
  `;
  // Стена стоит на `fixture_notes`; `fixture_members` присоединён по параметру и НЕ связан с ней.
  assert.deepEqual(unboundTenantReads(rightRelation, isFixtureWalled, PRINCIPAL)
    .map((finding) => finding.relation), ['public.fixture_members']);

  const wrongRelation = rightRelation.replace('note.organization_id = v_org', 'member.organization_id = v_org');
  // Подстрока `current_org_id` на месте, число её вхождений то же, а стена теперь не на той таблице.
  assert.equal((wrongRelation.match(/current_org_id/g) ?? []).length,
    (rightRelation.match(/current_org_id/g) ?? []).length);
  assert.deepEqual(unboundTenantReads(wrongRelation, isFixtureWalled, PRINCIPAL)
    .map((finding) => finding.relation), ['public.fixture_notes']);
});

test('инъекция: другое написание той же стены остаётся зелёным', () => {
  // Ни одной подстроки `current_org_id` рядом с отношением: организация приходит переменной, к
  // которой она попала через параметр, сверенный с принципалом и отказавший при расхождении.
  const validatedParameter = `
    if p_organization_id is distinct from app.current_org_id() then
      raise exception 'mismatch' using errcode = '42501';
    end if;
    select person.id from public.fixture_people as person
     where exists (select 1 from public.fixture_members as member
                    where member.platform_user_id = person.id
                      and member.organization_id = p_organization_id);
  `;
  assert.deepEqual(unboundTenantReads(validatedParameter, isFixtureWalled, PRINCIPAL), []);

  // Стена через CTE, вычисляющую принципал: `fixture_people` привязан цепочкой, а не напрямую.
  const throughCte = `
    with principal as (select app.current_org_id() as organization_id)
    select person.id from principal
      join public.fixture_members as member on member.organization_id = principal.organization_id
      join public.fixture_people as person on person.id = member.platform_user_id;
  `;
  assert.deepEqual(unboundTenantReads(throughCte, isFixtureWalled, PRINCIPAL), []);

  // Тот же корень без сверки параметра: организация приходит снаружи, стены нет.
  const unvalidated = validatedParameter.replace(
    /if p_organization_id is distinct from app\.current_org_id\(\) then[\s\S]*?end if;/, '',
  );
  assert.notEqual(unvalidated, validatedParameter);
  assert.deepEqual(unboundTenantReads(unvalidated, isFixtureWalled, PRINCIPAL)
    .map((finding) => finding.relation).sort(), ['public.fixture_members', 'public.fixture_people']);
});

test('инъекция: пометка без причины краснеет так же, как отсутствие пометки', () => {
  const body = 'select note.body from public.fixture_notes as note where note.id = p_note_id;';
  const unbound = unboundTenantReads(body, isFixtureWalled, PRINCIPAL);
  assert.equal(unbound.length, 1);

  const verdictFor = (marker) => {
    const fn = { relationSurfaces: [{ relation: 'public.fixture_notes', crossesTenantWall: marker }] };
    const found = markerOf(fn, 'public.fixture_notes');
    return Boolean(found && typeof found.why === 'string' && found.why.trim().length >= 40);
  };
  assert.equal(verdictFor(undefined), false, 'пометки нет — краснеет');
  assert.equal(verdictFor({ why: '' }), false, 'пустая причина — выключенная проверка');
  assert.equal(verdictFor({ why: 'потом' }), false, 'отписка вместо причины — выключенная проверка');
  assert.equal(
    verdictFor({ why: 'строка найдена по неугадываемому секрету приглашения до вступления в клинику' }),
    true,
  );
});

test('инъекция в ЖИВОЙ корень: снятая стена краснеет поимённо, возвращённая — зеленеет', () => {
  const { bodies, principalCalls, walled } = analysis();
  const isWalled = (relation) => walled.has(relation);
  // Корень D17, ради которого владелец и задал вопрос: стена в его теле выписана дословно, потому
  // что SECURITY DEFINER обходит политику `rev10_tenant_select_*`.
  const root = bodies.get('app.integrator_read_channel_binding_identity');
  assert.ok(root, 'корень D17 отсутствует в артефактах — инъекция проверила бы пустоту');
  assert.deepEqual(unboundTenantReads(root.body, isWalled, principalCalls), [],
    'у живого корня D17 стена в теле — если тут не пусто, сломан разбор, а не корень');

  // Вырезаем ровно организационный предикат обеих веток стены. Инъекция, которая ничего не
  // заменила, «доказывает» стену, ничего не сделав, — поэтому подстановка обязана изменить текст.
  const wounded = root.body.replaceAll('.organization_id = v_org', '.organization_id is not distinct from tenant_staff.organization_id');
  assert.notEqual(wounded, root.body, 'инъекция не нашла что резать — проверка ничего не доказала');

  const findings = unboundTenantReads(wounded, isWalled, principalCalls);
  assert.ok(findings.length > 0, 'снятая стена осталась незамеченной');
  // Виновник назван поимённо, и это именно те отношения, которые стена и держала.
  assert.deepEqual([...new Set(findings.map((finding) => finding.relation))].sort(),
    ['public.be_organization_members', 'public.org_enrollments', 'public.platform_users',
      'public.user_channel_bindings', 'public.user_contacts']);

  // Вернули — снова зелено, и тело побайтно прежнее: инъекция жила только в памяти проверки.
  assert.deepEqual(unboundTenantReads(root.body, isWalled, principalCalls), []);
  assert.equal(bodies.get('app.integrator_read_channel_binding_identity').body, root.body);
});

test('разбор различает переменную-принципал и переменную, в которую пишут что попало', () => {
  const clean = 'v_org uuid := app.current_org_id();';
  assert.ok(principalDerivedVariables(clean, [], PRINCIPAL).has('v_org'));

  const overwritten = `${clean}\n v_org := p_organization_id;`;
  assert.equal(principalDerivedVariables(overwritten, [], PRINCIPAL).has('v_org'), false,
    'переменную перезаписали параметром — стеной она быть перестала');

  // Псевдоним, привязанный к такой переменной, привязанным уже не считается.
  const body = `${overwritten}\n select note.body from public.fixture_notes as note where note.organization_id = v_org;`;
  assert.deepEqual(unboundTenantReads(body, isFixtureWalled, PRINCIPAL).map((f) => f.relation),
    ['public.fixture_notes']);
});

test('разбор считает глобальную строку `organization_id is null` не арендной, а левое соединение — соединением', () => {
  const globalRow = `
    select setting.value_json from public.fixture_notes as setting
     where setting.key = p_key and setting.organization_id is null;
  `;
  assert.deepEqual(unboundTenantReads(globalRow, isFixtureWalled, PRINCIPAL), []);

  const joined = `
    v_org uuid := app.current_org_id();
    select member.id, person.display_name
      from public.fixture_members as member
      left join public.fixture_people as person on person.id = member.platform_user_id
     where member.organization_id = v_org;
  `;
  // Внешнее соединение здесь засчитано привязкой — это НАЗВАННАЯ граница разбора, а не случайность
  // (шапка `definer-tenant-predicate.mjs`, «ВНЕШНИЕ СОЕДИНЕНИЯ»).
  assert.deepEqual(unboundTenantReads(joined, isFixtureWalled, PRINCIPAL), []);
});

test('разбор не путает целевое отношение записи с чтением, а вызов функции — с источником строк', () => {
  const write = 'update public.fixture_notes set body = p_body where id = p_note_id;';
  assert.deepEqual(unboundTenantReads(write, isFixtureWalled, PRINCIPAL), [],
    'цель UPDATE — не чтение; стена записи проверяется не здесь');

  const call = 'select x.id from app.fixture_notes(p_arg) as x;';
  assert.deepEqual(boundAliases(call, new Set(), PRINCIPAL).bindings, [],
    'вызов функции разобран как источник строк');
});
