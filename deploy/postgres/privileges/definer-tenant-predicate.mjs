/**
 * СВОЙСТВО: чтение стенованной таблицы внутри SECURITY DEFINER привязано к принципалу порта.
 *
 * ЗАЧЕМ. `SECURITY DEFINER` исполняется правами владельца функции, и RLS его не сужает. Стену,
 * которую снаружи держала политика `rev10_tenant_select_*`, тело обязано повторить САМО — иначе
 * корень оказывается ШИРЕ прежнего реляционного чтения и молча отдаёт строки чужой клиники. На
 * 22.08 такую стену в телах держали поимённо: на каждый корень делали инъекцию руками. Это защита
 * КОНКРЕТНЫХ корней, а не правила: следующий корень, написанный без предиката, не покраснел бы
 * нигде.
 *
 * ЧТО ИМЕННО ПРОВЕРЯЕТСЯ (свойство, а не подстрока). Гейт по вхождению `current_org_id` зелёный на
 * функции, где предикат есть, но применён НЕ К ТОМУ отношению, и красный на честной функции с
 * другим написанием. Здесь вместо подстроки строится граф ОДНОГО SQL-оператора:
 *
 *   1. отношение оператора привязывается к своему псевдониму (`from public.x as y` → y);
 *   2. равенство `<псевдоним>.<колонка> = <принципал>` СЕМЯ: этот псевдоним привязан;
 *      принципал — это `app.current_org_id()` и три его соседа, переменная, значение которой
 *      приходит только от них, колонка CTE/производной таблицы, вычисленной из них, и параметр,
 *      который тело сверило с принципалом и отказало при расхождении;
 *   3. равенство `<псевдоним A>.<колонка> = <псевдоним B>.<колонка>` — РЕБРО: привязанность течёт
 *      по join'ам и EXISTS'ам (ровно так стена и написана: `platform_users` привязан не сам по
 *      себе, а через `be_organization_members`/`org_enrollments`);
 *   4. два псевдонима, чьи колонки приравнены к ОДНОМУ параметру, тоже соединены ребром;
 *   5. непривязанный псевдоним стенованной таблицы — находка, с именем функции и отношения.
 *
 * Свойство ловится, а не написание: замена `app.current_org_id()` на другой аксессор, другой
 * порядок join'ов, другое имя псевдонима — проверка остаётся зелёной. Перенос предиката на соседнее
 * отношение — краснеет.
 *
 * ═══ ЧЕГО ЭТА ПРОВЕРКА НЕ ЛОВИТ (честная граница; лексика на это не способна) ═══
 *
 * Строго доказать «строка принадлежит клинике вызывающего» без планировщика нельзя. Ниже — ровно
 * то, что здесь НЕ поймано, чтобы гейту не верили больше, чем он стоит:
 *
 *  — ДИЗЪЮНКЦИЯ. `where u.organization_id = app.current_org_id() or <что угодно>` считается
 *    привязкой. Предикат в OR может быть обесценен вторым дизъюнктом.
 *  — ВНЕШНИЕ СОЕДИНЕНИЯ. Равенство в `ON` у `LEFT JOIN` не сужает сохраняемую сторону, а здесь
 *    считается ребром так же, как у `INNER JOIN`.
 *  — АНТИ-СОЕДИНЕНИЯ. `NOT EXISTS`/`NOT IN` разбираются как обычное равенство: смысл отрицания
 *    не учитывается.
 *  — ОБЛАСТЬ ВИДИМОСТИ ВНУТРИ ОДНОГО ОПЕРАТОРА. Псевдонимы всех подзапросов оператора лежат в
 *    одном пространстве имён: два независимых подзапроса, из которых привязан только один, дадут
 *    зелёный на обоих.
 *  — «ПРОЧИТАЛИ, ПОТОМ ОТКАЗАЛИ». `select r.organization_id into v … ; if v is distinct from
 *    app.current_org_id() then raise` засчитывается стеной: наружу строка не вышла. Но чужая
 *    строка ПРОЧИТАНА, и её существование утекает по коду отказа. Что тело действительно
 *    отказывает — проверяется по наличию `raise`/раннего `return`, а не по разбору условия.
 *  — КЛЮЧ, ПРОВЕРЕННЫЙ РАНЬШЕ. Ключ, которым стенованный оператор нашёл строку, дальше считается
 *    проверенным (`where id = v_id` после `… where id = v_id and organization_id = <принципал>`).
 *    Это верно, только если тело отказывает при «не нашли»; наличие отказа проверяется, его
 *    правильность — нет.
 *  — СМЫСЛ КОЛОНКИ. Ребро строится по любому равенству колонок; что связаны именно ключ и внешний
 *    ключ, никто не доказывает.
 *  — ЗАПИСЬ. Проверяются ЧТЕНИЯ (`SELECT`, источники `FROM`/`USING`). Само целевое отношение
 *    `INSERT`/`UPDATE`/`DELETE` — другое свойство (стена записи), и здесь оно не проверяется.
 *  — МЕЖПРОЦЕДУРНОСТЬ. Организация, полученная из ответа соседнего корня, здесь невидима: такие
 *    корни несут пометку `crossesTenantWall` с названной причиной.
 *
 * Против этих дыр стоит не лексика, а поведенческая проверка `tenant-isolation-wall.devDbProof`
 * и живые инъекции; здесь — гейт, который не даёт НОВОМУ корню появиться без предиката молча.
 */

const SCHEMAS = ['app', 'app_ext', 'app_control', 'integrator', 'public'];

/** Слова, стоящие там, где мог бы стоять псевдоним таблицы, но им не являющиеся. */
const NOT_AN_ALIAS = new Set([
  'as', 'on', 'where', 'order', 'group', 'having', 'limit', 'offset', 'for', 'inner', 'left',
  'right', 'full', 'cross', 'join', 'using', 'set', 'values', 'returning', 'select', 'and', 'or',
  'union', 'except', 'intersect', 'window', 'fetch', 'into', 'from', 'loop', 'then', 'if', 'else',
  'end', 'exists', 'not', 'is', 'null', 'lateral', 'with', 'distinct', 'perform', 'return',
]);

/** Значения, которые выглядят идентификатором, но колонкой не являются. */
const NOT_A_COLUMN = new Set([
  'true', 'false', 'null', 'now', 'current_date', 'current_timestamp', 'statement_timestamp',
  'clock_timestamp', 'found',
]);

const OPERAND = '(?:[a-z_][a-z0-9_]*\\.)?[a-z_][a-z0-9_]*(?:\\s*\\(\\s*\\))?(?:::[a-z_][a-z0-9_ ]*)?';
const EQUALITY = new RegExp(
  `(${OPERAND})\\s*(?:=|is\\s+not\\s+distinct\\s+from)\\s*(${OPERAND})`,
  'g',
);
const INEQUALITY = new RegExp(`(${OPERAND})\\s*(?:is\\s+distinct\\s+from|<>)\\s*(${OPERAND})`, 'g');
const IS_NULL = new RegExp(`(${OPERAND})\\s+is\\s+null\\b`, 'g');
const INTO_LIST = /\binto\s+((?:strict\s+)?[a-z_][a-z0-9_.,\s]*?)\s+from\b/;

const escapeCall = (call) => call.replace(/[.()]/g, (character) => `\\${character}`);

/* ============================================================================================
 * РАЗБОР ТЕЛА
 * ========================================================================================== */

/** Тело, разбитое по `;` верхнего уровня: скобки и строковые литералы уважаются. */
export function splitStatements(body) {
  const statements = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'") {
      index += 1;
      while (index < body.length && !(body[index] === "'" && body[index + 1] !== "'")) {
        if (body[index] === "'") index += 1;
        index += 1;
      }
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ';' && depth === 0) { statements.push(body.slice(start, index)); start = index + 1; }
  }
  statements.push(body.slice(start));
  return statements.filter((statement) => statement.trim().length > 0);
}

/** Индекс закрывающей скобки к открывающей на позиции `open`, либо -1. */
function closingParen(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
}

/**
 * Отношения оператора и их псевдонимы. Цель `INSERT INTO` сюда не попадает вовсе (у неё нет
 * предиката), цель `UPDATE`/`DELETE` помечается `writeTarget` — читающие проверки её пропускают.
 */
export function statementBindings(text) {
  const schemas = SCHEMAS.join('|');
  const writeTargets = new Set([...text.matchAll(
    new RegExp(`\\b(?:update\\s+(?:only\\s+)?|delete\\s+from\\s+)((?:${schemas})\\.[a-z_][a-z0-9_]*)`, 'g'),
  )].map((match) => match[1]));
  const pattern = new RegExp(
    `\\b(?:from|join|using|update(?:\\s+only)?|into)\\s+((?:${schemas})\\.[a-z_][a-z0-9_]*)\\b`
    + '(?:\\s+as)?(?:\\s+([a-z_][a-z0-9_]*))?', 'g',
  );
  const bindings = [];
  for (const match of text.matchAll(pattern)) {
    const relationAt = match.index + match[0].indexOf(match[1]);
    // `app.some_function(...)` в предложении — вызов, а не источник строк.
    if (text[relationAt + match[1].length] === '(') continue;
    const head = text.slice(Math.max(0, relationAt - 20), relationAt);
    if (/\binsert\s+into\s*$/.test(head)) continue;
    const alias = match[2] && !NOT_AN_ALIAS.has(match[2])
      ? match[2]
      : match[1].slice(match[1].indexOf('.') + 1);
    bindings.push({
      relation: match[1],
      alias,
      writeTarget: /\b(?:update(?:\s+only)?|delete\s+from)\s*$/.test(head) && writeTargets.has(match[1]),
    });
  }
  return bindings;
}

/* ============================================================================================
 * ЧТО СЧИТАЕТСЯ ПРИНЦИПАЛОМ
 * ========================================================================================== */

/**
 * Транзитивное замыкание аксессоров принципала.
 *
 * Затравка — объявленные скалярные аксессоры контракта port-context (`app.current_org_id()` и
 * соседи). Дальше аксессором признаётся функция, которая НЕ ЧИТАЕТ ни одного отношения и
 * возвращает ровно принципал (`app.require_staff_security_self_user_id()` — обёртка с отказом
 * поверх `app.current_patient_user_id()`). Требование «возвращает», а не «упоминает», обязательно:
 * обёртка, которой принципал передан аргументом, отдаёт наружу совсем другое значение.
 */
export function principalAccessorClosure(functions, seedSignatures) {
  let calls = seedSignatures
    .filter((signature) => signature.endsWith('()'))
    .map((signature) => signature.toLowerCase())
    .sort();
  for (let round = 0; round < 8; round += 1) {
    const before = calls.length;
    for (const fn of functions) {
      const call = `${fn.name}()`;
      if (calls.includes(call)) continue;
      const statements = splitStatements(fn.body);
      if (statements.some((statement) => statementBindings(statement).length > 0)) continue;
      const returned = [...fn.body.matchAll(/\breturn\s+([^;]+)/g)].map((match) => match[1].trim());
      if (returned.length === 0) continue;
      const derived = principalDerivedVariables(fn.body, [], calls);
      const isPrincipal = (expression) => {
        const clean = expression.replace(/::[a-z_][a-z0-9_ ]*$/, '').trim();
        return calls.includes(clean) || derived.has(clean);
      };
      if (returned.every(isPrincipal)) calls = [...calls, call].sort();
    }
    if (calls.length === before) break;
  }
  return calls;
}

/**
 * Переменные тела, значение которых может прийти ТОЛЬКО от принципала.
 *
 * Три источника: присваивание (`v_org := app.current_org_id()`, включая форму DECLARE
 * `v_org uuid := …`), присваивание из уже помеченной переменной и параметр, который тело сверило с
 * принципалом и ОТКАЗАЛО при расхождении (`if p_org is distinct from app.current_org_id() then
 * raise exception`). Переменная, которой где-то присваивают и не-принципал, из набора выбывает:
 * такая переменная стеной не является. `seed` — значения, доказанные извне (см. `verifiedHandles`);
 * их это выбывание не касается, иначе `SELECT … INTO` тут же снял бы собственное доказательство.
 */
export function principalDerivedVariables(body, seed, principalCalls) {
  const tainted = new Set(seed);
  const seeded = new Set(seed);
  const assignments = [];
  for (const chunk of splitStatements(body)) {
    const at = chunk.indexOf(':=');
    if (at < 0) continue;
    const line = chunk.slice(0, at).split('\n').pop();
    const head = line.replace(/^\s*(?:declare|begin)\b/, '').match(/[a-z_][a-z0-9_]*/);
    if (head) assignments.push([head[0], chunk.slice(at + 2)]);
  }
  for (const match of body.matchAll(new RegExp(INTO_LIST.source, 'g'))) {
    for (const name of match[1].replace(/^strict\s+/, '').split(',')) {
      assignments.push([name.trim().split('.')[0], '<строка из запроса>']);
    }
  }
  const fromPrincipal = (expression) => principalCalls.some((call) => expression.includes(call))
    || [...tainted].some((name) => new RegExp(`\\b${name}\\b`).test(expression));
  for (let round = 0; round < 8; round += 1) {
    let grew = false;
    for (const [name, expression] of assignments) {
      if (tainted.has(name) || !fromPrincipal(expression)) continue;
      tainted.add(name);
      grew = true;
    }
    if (!grew) break;
  }
  for (const chunk of splitStatements(body)) {
    if (!/\braise\s+exception\b/.test(chunk)) continue;
    for (const match of chunk.matchAll(INEQUALITY)) {
      const [, left, right] = match;
      const principalSide = (side) => principalCalls.includes(side) || tainted.has(side);
      if (/^p_/.test(left) && principalSide(right)) { tainted.add(left); seeded.add(left); }
      if (/^p_/.test(right) && principalSide(left)) { tainted.add(right); seeded.add(right); }
    }
  }
  for (const [name, expression] of assignments) {
    if (!tainted.has(name) || seeded.has(name)) continue;
    const stillPrincipal = principalCalls.some((call) => expression.includes(call))
      || [...tainted].some((other) => other !== name && new RegExp(`\\b${other}\\b`).test(expression));
    if (!stillPrincipal) tainted.delete(name);
  }
  return tainted;
}

/**
 * Колонки, которые ВЫЧИСЛЯЮТ принципал внутри самого оператора: CTE или производная таблица
 * `(select app.current_org_id() as organization_id) as context`. Дальше `context.organization_id` —
 * тот же принципал, только под именем колонки; без этого честно написанный корень краснел бы.
 */
export function principalColumnRefs(text, principalCalls) {
  const refs = new Set();
  const collect = (inner, prefix) => {
    for (const call of principalCalls) {
      const pattern = new RegExp(`${escapeCall(call)}\\s+as\\s+([a-z_][a-z0-9_]*)`, 'g');
      for (const alias of inner.matchAll(pattern)) refs.add(`${prefix}.${alias[1]}`);
    }
  };
  for (const match of text.matchAll(/\(\s*select\b/g)) {
    const close = closingParen(text, match.index);
    if (close < 0) continue;
    const tail = text.slice(close + 1).match(/^\s*(?:as\s+)?([a-z_][a-z0-9_]*)/);
    if (tail && !NOT_AN_ALIAS.has(tail[1])) collect(text.slice(match.index + 1, close), tail[1]);
  }
  for (const match of text.matchAll(/(?:\bwith|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingParen(text, open);
    if (close < 0) continue;
    collect(text.slice(open + 1, close), match[1]);
  }
  return refs;
}

function classify(operand, aliasIndex, tainted, soleAlias, principalRefs, principalCalls) {
  const clean = operand.replace(/::[a-z_][a-z0-9_ ]*$/, '').trim();
  if (principalCalls.includes(clean) || principalRefs.has(clean)) return { kind: 'principal' };
  const dot = clean.lastIndexOf('.');
  if (dot < 0) {
    if (tainted.has(clean)) return { kind: 'principal' };
    // Незаквалифицированная колонка однозначна ровно тогда, когда отношение в операторе одно.
    if (soleAlias && !NOT_A_COLUMN.has(clean) && !/^[pv]_/.test(clean) && !clean.endsWith('()')) {
      return { kind: 'column', alias: soleAlias, column: clean };
    }
    return { kind: 'value', text: clean };
  }
  const alias = clean.slice(0, dot);
  if (aliasIndex.has(alias)) return { kind: 'column', alias, column: clean.slice(dot + 1) };
  return { kind: 'value', text: clean };
}

/* ============================================================================================
 * ГРАФ ОДНОГО ОПЕРАТОРА
 * ========================================================================================== */

/**
 * Именованные подзапросы оператора (CTE и производные таблицы) и отношения, привязанные ВНУТРИ
 * каждого. Без них цепочка `… join public.x as y on y.organization_id = ctx.organization_id`
 * обрывается на `ctx`: это не таблица, и равенство ни с чем не связывается — честно написанный
 * корень краснел бы. Псевдонимы всех подзапросов оператора и так лежат в одном пространстве имён
 * (см. «ОБЛАСТЬ ВИДИМОСТИ ВНУТРИ ОДНОГО ОПЕРАТОРА» в шапке), поэтому подзапрос соединяется ребром
 * со своим содержимым, а не разбирается отдельной областью.
 */
function subqueryAliases(text) {
  const bodies = new Map();
  const record = (name, innerText) => {
    if (NOT_AN_ALIAS.has(name)) return;
    bodies.set(name, `${bodies.get(name) ?? ''} ${innerText}`);
  };
  for (const match of text.matchAll(/(?:\bwith|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingParen(text, open);
    if (close >= 0) record(match[1], text.slice(open + 1, close));
  }
  for (const match of text.matchAll(/\(\s*select\b/g)) {
    const close = closingParen(text, match.index);
    if (close < 0) continue;
    const tail = text.slice(close + 1).match(/^\s*(?:as\s+)?([a-z_][a-z0-9_]*)/);
    if (tail) record(tail[1], text.slice(match.index + 1, close));
  }
  const inside = new Map();
  for (const [name, innerText] of bodies) {
    const aliases = new Set(statementBindings(innerText).map((binding) => binding.alias));
    // Подзапрос, построенный на ДРУГОМ подзапросе, наследует его привязанность: цепочка
    // `exact_context` → `effective` → присоединённое отношение обрывалась бы на первом же звене.
    for (const reference of innerText.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)\b/g)) {
      if (bodies.has(reference[1]) && reference[1] !== name) aliases.add(reference[1]);
    }
    inside.set(name, aliases);
  }
  return inside;
}

/** Псевдонимы оператора, привязанные к принципалу — напрямую или по цепочке равенств. */
export function boundAliases(text, tainted, principalCalls) {
  const principalRefs = principalColumnRefs(text, principalCalls);
  const bindings = statementBindings(text);
  const subqueries = subqueryAliases(text);
  const aliasIndex = new Map(bindings.map((binding) => [binding.alias, binding.relation]));
  for (const name of subqueries.keys()) if (!aliasIndex.has(name)) aliasIndex.set(name, null);
  const soleAlias = bindings.length === 1 ? bindings[0].alias : null;
  const seeded = new Set();
  const edges = new Map();
  const sharedKeys = new Map();
  const of = (operand) => classify(operand, aliasIndex, tainted, soleAlias, principalRefs, principalCalls);
  const addEdge = (from, to) => {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  };
  const shareKey = (value, alias) => {
    if (!/^[pv]_[a-z0-9_]+$/.test(value.text)) return;
    if (!sharedKeys.has(value.text)) sharedKeys.set(value.text, new Set());
    sharedKeys.get(value.text).add(alias);
  };

  // Глобальная ветка стены `platform-role+clinic`: строка без организации по построению не
  // принадлежит ни одной клинике, и сужать её организационным предикатом нечем.
  for (const match of text.matchAll(IS_NULL)) {
    const operand = of(match[1]);
    if (operand.kind === 'column' && operand.column === 'organization_id') seeded.add(operand.alias);
  }

  // Оператор, единственное действие которого — отказ, наружу не отдаёт ни строки. Поэтому сверка
  // «строка принадлежит другой организации» здесь такая же стена, как равенство в WHERE.
  const refusalOnly = /\braise\s+exception\b/.test(text)
    && !/\b(?:into|returning|insert\s+into|update\s+|delete\s+from)\b/.test(text);
  if (refusalOnly) {
    for (const match of text.matchAll(INEQUALITY)) {
      const left = of(match[1]);
      const right = of(match[2]);
      if (left.kind === 'column' && right.kind === 'principal') seeded.add(left.alias);
      if (right.kind === 'column' && left.kind === 'principal') seeded.add(right.alias);
    }
  }

  for (const match of text.matchAll(EQUALITY)) {
    const left = of(match[1]);
    const right = of(match[2]);
    if (left.kind === 'column' && right.kind === 'principal') seeded.add(left.alias);
    else if (right.kind === 'column' && left.kind === 'principal') seeded.add(right.alias);
    else if (left.kind === 'column' && right.kind === 'column' && left.alias !== right.alias) {
      addEdge(left.alias, right.alias);
      addEdge(right.alias, left.alias);
    } else if (left.kind === 'column' && right.kind === 'value') shareKey(right, left.alias);
    else if (right.kind === 'column' && left.kind === 'value') shareKey(left, right.alias);
  }
  for (const group of sharedKeys.values()) {
    for (const one of group) for (const other of group) if (one !== other) addEdge(one, other);
  }
  for (const [name, aliases] of subqueries) {
    for (const alias of aliases) { addEdge(name, alias); addEdge(alias, name); }
  }

  const reached = new Set(seeded);
  const queue = [...seeded];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const next of edges.get(current) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return { bindings, reached };
}

/** Переменные и параметры, которыми стенованный оператор НАШЁЛ строку. */
function statementKeys(text, tainted, principalCalls) {
  const principalRefs = principalColumnRefs(text, principalCalls);
  const bindings = statementBindings(text);
  const aliasIndex = new Map(bindings.map((binding) => [binding.alias, binding.relation]));
  const soleAlias = bindings.length === 1 ? bindings[0].alias : null;
  const keys = new Set();
  for (const match of text.matchAll(EQUALITY)) {
    const left = classify(match[1], aliasIndex, tainted, soleAlias, principalRefs, principalCalls);
    const right = classify(match[2], aliasIndex, tainted, soleAlias, principalRefs, principalCalls);
    if (left.kind === 'column' && right.kind === 'value' && /^[pv]_/.test(right.text)) keys.add(right.text);
    if (right.kind === 'column' && left.kind === 'value' && /^[pv]_/.test(left.text)) keys.add(left.text);
  }
  return keys;
}

/**
 * Значения, ДОКАЗАННЫЕ телом: строка, прочитанная из-за стены, и ключ, которым её нашли, дальше
 * сами являются ключами своей клиники. Засчитывается только там, где тело ОТКАЗЫВАЕТ (`raise`
 * либо ранний `return` в стороже): без отказа «не нашли» продолжает работу с непроверенным ключом.
 */
function verifiedHandles(body, tainted, principalCalls) {
  const statements = splitStatements(body);
  const isGuard = (statement) => /\braise\s+exception\b/.test(statement)
    || (/^\s*(?:if|elsif)\b/.test(statement) && /\breturn\b/.test(statement));
  const refuses = statements.map((statement, index) => isGuard(statement)
    || statements.slice(index + 1).some(isGuard));
  for (let round = 0; round < 8; round += 1) {
    let grew = false;
    for (const [index, statement] of statements.entries()) {
      const { bindings, reached } = boundAliases(statement, tainted, principalCalls);
      if (bindings.length === 0 || !bindings.every((binding) => reached.has(binding.alias))) continue;
      const add = (name) => {
        if (!name || tainted.has(name)) return;
        tainted.add(name);
        grew = true;
      };
      const into = statement.match(INTO_LIST);
      if (into) for (const raw of into[1].replace(/^strict\s+/, '').split(',')) add(raw.trim().split('.')[0]);
      if (refuses[index]) for (const key of statementKeys(statement, tainted, principalCalls)) add(key);
    }
    if (!grew) break;
    for (const name of principalDerivedVariables(body, [...tainted], principalCalls)) tainted.add(name);
  }
  return tainted;
}

/**
 * Операторы «прочитали, потом отказали»: `select r.organization_id into v … ;` и ниже сторож,
 * сверяющий `v` с принципалом. Строка чужой клиники в переменную попала, но наружу не вышла.
 */
function refusedAfterRead(body, tainted, principalCalls) {
  const statements = splitStatements(body);
  const refused = new Set();
  const principalSide = [
    ...principalCalls.map(escapeCall),
    ...[...tainted].map((name) => `${name}\\b`),
  ].join('|');
  for (const [index, statement] of statements.entries()) {
    const into = statement.match(INTO_LIST);
    if (!into) continue;
    const names = into[1].replace(/^strict\s+/, '').split(',')
      .map((raw) => raw.trim().split('.')[0]).filter(Boolean);
    for (const later of statements.slice(index + 1)) {
      if (!/\braise\s+exception\b/.test(later) && !/^\s*(?:if|elsif)\b[\s\S]*\breturn\b/.test(later)) continue;
      const compares = names.some((name) => new RegExp(
        `\\b${name}(?:\\.[a-z_][a-z0-9_]*)?\\s*(?:is\\s+distinct\\s+from|<>|=)\\s*(?:${principalSide})`,
      ).test(later));
      if (compares) { refused.add(statement); break; }
    }
  }
  return refused;
}

/* ============================================================================================
 * ВЫВОД
 * ========================================================================================== */

/**
 * Чтения стенованных отношений в теле, не привязанные к принципалу порта.
 * Возвращает `[{ relation, alias, statement }]`; пустой массив = все чтения за стеной.
 */
export function unboundTenantReads(body, isWalled, principalCalls) {
  const tainted = verifiedHandles(body, principalDerivedVariables(body, [], principalCalls), principalCalls);
  const refused = refusedAfterRead(body, tainted, principalCalls);
  const findings = [];
  for (const statement of splitStatements(body)) {
    if (refused.has(statement)) continue;
    const { bindings, reached } = boundAliases(statement, tainted, principalCalls);
    for (const binding of bindings) {
      if (binding.writeTarget || !isWalled(binding.relation)) continue;
      if (reached.has(binding.alias)) continue;
      findings.push({ relation: binding.relation, alias: binding.alias, statement: statement.trim() });
    }
  }
  return findings;
}

/* ============================================================================================
 * КТО ИЗ ВЫЗЫВАЮЩИХ ВООБЩЕ НЕСЁТ ОРГАНИЗАЦИЮ
 * ========================================================================================== */

/**
 * Классы контекста порта, у которых принятый контекст ОБЯЗАН нести организацию, — прочитанные из
 * ЖИВОГО тела `app.install_port_context`, а не переписанные сюда списком.
 *
 * Матрица классов там и есть источник истины: `context_class = 'staff' and not (… organization_id
 * is not null …)` отказывает установке контекста без организации. Класс, у которого разбор не
 * нашёл ни одного `organization_id is not null`, организацию не несёт (`pre_session`, `platform`,
 * `service`). У класса `integrator` условие разветвлено по целевой роли — ветки разбираются
 * отдельно, поэтому `app_integrator_request` организацию несёт, а `app_integrator_resolver` нет.
 *
 * Ключ результата — либо `<класс>`, либо `<класс>/<роль>`, если тело разветвило условие по роли.
 */
export function organizationBearingContextClasses(installPortContextBody) {
  const marks = [...installPortContextBody.matchAll(/\(p_claims\.context_class = '([a-z_]+)'/g)]
    .map((match) => ({ contextClass: match[1], at: match.index }));
  if (marks.length === 0) {
    throw new Error('тело app.install_port_context не содержит матрицы классов контекста — разбор сломан, а не матрица');
  }
  const carries = new Map();
  for (const [index, mark] of marks.entries()) {
    const end = index + 1 < marks.length ? marks[index + 1].at : installPortContextBody.length;
    const clause = installPortContextBody.slice(mark.at, end);
    const roleBranches = [...clause.matchAll(/\(p_claims\.target_role = '([a-z_]+)'/g)];
    if (roleBranches.length === 0) {
      carries.set(mark.contextClass, /organization_id is not null/.test(clause));
      continue;
    }
    for (const [branchIndex, branch] of roleBranches.entries()) {
      const branchEnd = branchIndex + 1 < roleBranches.length
        ? roleBranches[branchIndex + 1].index : clause.length;
      carries.set(
        `${mark.contextClass}/${branch[1]}`,
        /organization_id is not null/.test(clause.slice(branch.index, branchEnd)),
      );
    }
  }
  return carries;
}

/**
 * Рантайм-роли, которые входят в базу С организацией: целевые роли объявленных возможностей порта,
 * чей класс контекста несёт организацию. Ровно они — арендаторы, от которых стена и защищает.
 */
export function tenantRuntimeRoles(declaration, installPortContextBody) {
  const carries = organizationBearingContextClasses(installPortContextBody);
  const roles = new Set();
  for (const capability of Object.values(declaration.portContext.capabilities)) {
    const perRole = `${capability.contextClass}/${capability.targetRole}`;
    const key = carries.has(perRole) ? perRole : capability.contextClass;
    if (carries.get(key)) roles.add(capability.targetRole);
  }
  return roles;
}
