#!/usr/bin/env node
/**
 * Structural gate for the patient protected-data door.
 *
 * Every exported HTTP handler below `api/patient/**` and every non-public handler below
 * `api/booking/**` must fail closed through the shared patient business-access guard. The check is
 * method-level: a guarded POST in the same file cannot hide an unguarded GET.
 *
 * Escape surfaces outside this route scope remain intentionally available: the bind-email screen
 * (`app/patient/bind-email/page.tsx`), email start/resend and confirmation
 * (`api/auth/email/{start,confirm}/route.ts`) and logout (`api/auth/logout/route.ts`). They are not
 * exceptions to a patient/booking route scan.
 *
 * Граница: гейт не обещает разбирать межмодульные фабрики и импортированные обработчики,
 * значения, пришедшие через spread, или выполнять общий анализ потока данных. Spread остаётся
 * `unresolvedPotential`: путь обработчика закрывается, а путь раннего чтения может остаться без finding.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const apiRoot = path.join(appRoot, 'src', 'app', 'api');
const guardModule = '@/app-layer/guards/requireRole';
const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const acceptedGuards = new Set([
  'requirePatientApiBusinessAccess',
  // This guard delegates to requirePatientApiBusinessAccess before checking trusted phone.
  'requirePatientBookingTrustedPhoneAccess',
]);

/** Exact in-scope escape routes. Every reason must stay non-empty and on one line. */
const routeExceptions = new Map([
  [
    'patient/email-change/confirm/route.ts',
    'confirms a pending email change and must remain reachable from the email gate',
  ],
  [
    'patient/messenger/request-contact/route.ts',
    'requests the onboarding contact needed to finish patient activation',
  ],
  [
    'patient/support/route.ts',
    'support is an explicit escape from the email gate and must remain reachable',
  ],
]);

/**
 * Аудит круга 4 (MUST FIX-2): перепись брала ровно имя `route.ts`, а Next считает маршрутом любой
 * `route.<js|jsx|ts|tsx|mjs>`. Один такой файл под `api/patient/**` оставался вне надзора целиком.
 */
const ROUTE_FILE_NAMES = new Set([
  'route.ts',
  'route.tsx',
  'route.js',
  'route.jsx',
  'route.mjs',
]);

function collectRouteFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectRouteFiles(full, out);
    else if (ROUTE_FILE_NAMES.has(entry.name)) out.push(full);
  }
  return out;
}

function isGuardedRoute(relativePath) {
  return (
    relativePath.startsWith('patient/') ||
    (relativePath.startsWith('booking/') && !relativePath.startsWith('booking/public/'))
  );
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function importedGuardLocals(sourceFile) {
  const locals = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== guardModule
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (acceptedGuards.has(imported)) locals.add(element.name.text);
    }
  }
  return locals;
}

/**
 * Ratchet: a route that already entered through the shared guard may never quietly drop it, even
 * when it lives outside `api/patient/**` and `api/booking/**` (media delivery is such a place).
 */
function importsAcceptedGuard(source) {
  const sourceFile = ts.createSourceFile(
    'scope-probe.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return importedGuardLocals(sourceFile).size > 0;
}

const MAX_LOCAL_RESOLUTION_DEPTH = 32;

function lexicalScopeOf(node) {
  let current = node;
  while (current) {
    if (ts.isSourceFile(current) || ts.isBlock(current) || ts.isModuleBlock(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function parentLexicalScope(scope) {
  return lexicalScopeOf(scope?.parent);
}

function importBindsName(statement, name) {
  if (!ts.isImportDeclaration(statement) || !statement.importClause) return false;
  if (statement.importClause.name?.text === name) return true;
  const bindings = statement.importClause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) return bindings.name.text === name;
  return Boolean(bindings?.elements.some((element) => element.name.text === name));
}

function bindingMatchInName(bindingName, name, path = []) {
  if (ts.isIdentifier(bindingName)) {
    return bindingName.text === name ? { path, unresolved: false } : undefined;
  }

  if (ts.isObjectBindingPattern(bindingName)) {
    for (const element of bindingName.elements) {
      const propertyName = element.propertyName
        ? propertyNameOf(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : undefined;
      const nested = bindingMatchInName(
        element.name,
        name,
        propertyName === undefined ? path : [...path, propertyName],
      );
      if (!nested) continue;
      return element.dotDotDotToken || propertyName === undefined
        ? { path: nested.path, unresolved: true }
        : nested;
    }
    return undefined;
  }

  for (let index = 0; index < bindingName.elements.length; index += 1) {
    const element = bindingName.elements[index];
    if (ts.isOmittedExpression(element)) continue;
    const nested = bindingMatchInName(element.name, name, [...path, String(index)]);
    if (!nested) continue;
    return element.dotDotDotToken ? { path: nested.path, unresolved: true } : nested;
  }
  return undefined;
}

function directBindingInScope(scope, name) {
  if (!scope) return undefined;

  if (ts.isBlock(scope) && ts.isFunctionLike(scope.parent)) {
    const parameter = scope.parent.parameters.find((candidate) =>
      bindingMatchInName(candidate.name, name),
    );
    if (parameter) return { kind: 'unresolved', node: parameter };
  }

  const statements = scope.statements ?? [];
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return { kind: 'function', node: statement };
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const match = bindingMatchInName(declaration.name, name);
        if (!match) continue;
        if (match.unresolved) return { kind: 'unresolved', node: declaration };
        return { kind: 'variable', node: declaration, path: match.path };
      }
    }
    if (
      importBindsName(statement, name) ||
      ((ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
        statement.name?.text === name)
    ) {
      return { kind: 'unresolved', node: statement };
    }
  }
  return undefined;
}

function bindingForIdentifier(identifier, startingScope) {
  for (let scope = startingScope; scope; scope = parentLexicalScope(scope)) {
    const binding = directBindingInScope(scope, identifier.text);
    if (binding) return binding;
  }
  return undefined;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameOf(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) return propertyNameOf(unwrapExpression(name.expression));
  return undefined;
}

function variableValueTargetsOf(binding, state) {
  if (!binding.node.initializer) return { targets: [], unresolvedPotential: true };

  let resolved = valueTargetsOf(
    binding.node.initializer,
    lexicalScopeOf(binding.node),
    state,
  );
  for (const propertyName of binding.path) {
    const members = resolved.targets.map((target) =>
      memberValuesOf(target, propertyName, lexicalScopeOf(target), state),
    );
    resolved = {
      targets: members.flatMap((member) => member.targets),
      unresolvedPotential:
        resolved.unresolvedPotential ||
        members.some((member) => member.unresolvedPotential),
    };
  }
  return resolved;
}

function valueTargetsOf(expression, scope, state) {
  const current = unwrapExpression(expression);
  if (state.depth > MAX_LOCAL_RESOLUTION_DEPTH || state.seen.has(current)) {
    return { targets: [], unresolvedPotential: true };
  }
  const nextState = { depth: state.depth + 1, seen: new Set(state.seen).add(current) };

  // Проверка ведущего 16.09: получатель сам может быть обращением к свойству (`reg.a.load`).
  // Без этого перехода вложенность глубже одного уровня возвращала сам узел, и цепочка обрывалась
  // молча — ровно тот класс, ради которого разрешатель и заводился.
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    const propertyName = ts.isPropertyAccessExpression(current)
      ? current.name.text
      : current.argumentExpression && propertyNameOf(unwrapExpression(current.argumentExpression));
    if (propertyName === undefined) return { targets: [], unresolvedPotential: true };
    return memberValuesOf(current.expression, propertyName, scope, nextState);
  }

  if (!ts.isIdentifier(current)) {
    return { targets: [current], unresolvedPotential: false };
  }

  const binding = bindingForIdentifier(current, scope);
  if (!binding || binding.kind === 'unresolved') {
    return { targets: [], unresolvedPotential: true };
  }
  if (binding.kind === 'function') {
    return { targets: [binding.node], unresolvedPotential: false };
  }
  return variableValueTargetsOf(binding, nextState);
}

function memberValuesOf(receiver, propertyName, scope, state) {
  const resolvedReceivers = valueTargetsOf(receiver, scope, state);
  const targets = [];
  let unresolvedPotential = resolvedReceivers.unresolvedPotential;

  for (const target of resolvedReceivers.targets) {
    if (ts.isObjectLiteralExpression(target)) {
      let matched = false;
      for (const property of target.properties) {
        if (ts.isSpreadAssignment(property)) {
          unresolvedPotential = true;
          continue;
        }
        if (propertyNameOf(property.name) !== propertyName) continue;
        matched = true;
        if (ts.isPropertyAssignment(property)) targets.push(property.initializer);
        else if (ts.isShorthandPropertyAssignment(property)) targets.push(property.name);
        else if (ts.isMethodDeclaration(property)) targets.push(property);
        else unresolvedPotential = true;
      }
      if (!matched) unresolvedPotential = true;
      continue;
    }
    if (ts.isArrayLiteralExpression(target) && /^\d+$/.test(propertyName)) {
      const element = target.elements[Number(propertyName)];
      if (element && !ts.isOmittedExpression(element)) targets.push(element);
      else unresolvedPotential = true;
      continue;
    }
    unresolvedPotential = true;
  }

  return { targets, unresolvedPotential };
}

function mergeResolutions(resolutions) {
  return {
    bodies: resolutions.flatMap((resolution) => resolution.bodies),
    unresolvedPotential: resolutions.some((resolution) => resolution.unresolvedPotential),
  };
}

/**
 * Resolves an expression to every locally declared function body it may denote. Resolution is
 * lexical (nearest binding wins), bounded, cycle-safe, and intentionally stops at module imports.
 */
function resolveToFunctionBodies(expression, scope = lexicalScopeOf(expression), state = undefined) {
  if (!expression) return { bodies: [], unresolvedPotential: false };
  const current = unwrapExpression(expression);
  const resolutionState = state ?? { depth: 0, seen: new Set() };
  if (
    resolutionState.depth > MAX_LOCAL_RESOLUTION_DEPTH ||
    resolutionState.seen.has(current)
  ) {
    return { bodies: [], unresolvedPotential: true };
  }
  const nextState = {
    depth: resolutionState.depth + 1,
    seen: new Set(resolutionState.seen).add(current),
  };

  if (
    ts.isArrowFunction(current) ||
    ts.isFunctionExpression(current) ||
    ts.isFunctionDeclaration(current) ||
    ts.isMethodDeclaration(current)
  ) {
    return current.body
      ? { bodies: [current.body], unresolvedPotential: false }
      : { bodies: [], unresolvedPotential: true };
  }

  if (ts.isIdentifier(current)) {
    const binding = bindingForIdentifier(current, scope);
    if (!binding || binding.kind === 'unresolved') {
      return { bodies: [], unresolvedPotential: true };
    }
    if (binding.kind === 'function') {
      return resolveToFunctionBodies(binding.node, lexicalScopeOf(binding.node), nextState);
    }
    const values = variableValueTargetsOf(binding, nextState);
    const resolved = mergeResolutions(
      values.targets.map((target) =>
        resolveToFunctionBodies(target, lexicalScopeOf(target), nextState),
      ),
    );
    return {
      bodies: resolved.bodies,
      unresolvedPotential: values.unresolvedPotential || resolved.unresolvedPotential,
    };
  }

  // Проверка ведущего 16.09: объектный литерал в аргументе обёртки раньше давал ноль тел и ноль
  // подозрения, поэтому `compose({ h: real }, guardedCallback)` зеленел — один распознанный
  // защищённый callback прикрывал контейнер с настоящим обработчиком. Разбирается симметрично
  // массиву: значения свойств становятся кандидатами, spread оставляет нераспознанное.
  if (ts.isObjectLiteralExpression(current)) {
    let spread = false;
    const values = [];
    for (const property of current.properties) {
      if (ts.isSpreadAssignment(property)) { spread = true; continue; }
      if (ts.isPropertyAssignment(property)) values.push(property.initializer);
      else if (ts.isShorthandPropertyAssignment(property)) values.push(property.name);
      else if (ts.isMethodDeclaration(property)) values.push(property);
      else spread = true;
    }
    const resolved = mergeResolutions(
      values.map((value) => resolveToFunctionBodies(value, lexicalScopeOf(value), nextState)),
    );
    return {
      bodies: resolved.bodies,
      unresolvedPotential: spread || resolved.unresolvedPotential,
    };
  }

  if (ts.isArrayLiteralExpression(current)) {
    return mergeResolutions(
      current.elements
        .filter((element) => !ts.isOmittedExpression(element))
        .map((element) => resolveToFunctionBodies(element, lexicalScopeOf(element), nextState)),
    );
  }

  if (ts.isConditionalExpression(current)) {
    return mergeResolutions([
      resolveToFunctionBodies(current.whenTrue, lexicalScopeOf(current.whenTrue), nextState),
      resolveToFunctionBodies(current.whenFalse, lexicalScopeOf(current.whenFalse), nextState),
    ]);
  }

  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    const propertyName = ts.isPropertyAccessExpression(current)
      ? current.name.text
      : current.argumentExpression && propertyNameOf(unwrapExpression(current.argumentExpression));
    if (propertyName === undefined) return { bodies: [], unresolvedPotential: true };
    if (
      ts.isPropertyAccessExpression(current) &&
      (propertyName === 'call' || propertyName === 'apply' || propertyName === 'bind')
    ) {
      return resolveToFunctionBodies(current.expression, scope, nextState);
    }
    const members = memberValuesOf(current.expression, propertyName, scope, nextState);
    const resolved = mergeResolutions(
      members.targets.map((target) =>
        resolveToFunctionBodies(target, lexicalScopeOf(target), nextState),
      ),
    );
    return {
      bodies: resolved.bodies,
      unresolvedPotential: members.unresolvedPotential || resolved.unresolvedPotential,
    };
  }

  if (ts.isCallExpression(current)) {
    if (
      ts.isPropertyAccessExpression(current.expression) &&
      (current.expression.name.text === 'call' ||
        current.expression.name.text === 'apply' ||
        current.expression.name.text === 'bind')
    ) {
      return resolveToFunctionBodies(current.expression.expression, scope, nextState);
    }
    const argumentsResolution = mergeResolutions(
      current.arguments.map((argument) =>
        resolveToFunctionBodies(argument, lexicalScopeOf(argument), nextState),
      ),
    );
    return {
      bodies: argumentsResolution.bodies,
      unresolvedPotential:
        argumentsResolution.unresolvedPotential || argumentsResolution.bodies.length === 0,
    };
  }

  return { bodies: [], unresolvedPotential: false };
}

function handlerBodiesOf(initializer) {
  return resolveToFunctionBodies(initializer);
}

function exportedHandlers(sourceFile) {
  const handlers = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name &&
      httpMethods.has(statement.name.text)
    ) {
      handlers.push({
        method: statement.name.text,
        ...resolveToFunctionBodies(statement, sourceFile),
      });
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !httpMethods.has(declaration.name.text)) {
          continue;
        }
        handlers.push({ method: declaration.name.text, ...handlerBodiesOf(declaration.initializer) });
      }
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (httpMethods.has(element.name.text)) {
          handlers.push({ method: element.name.text, bodies: [], unresolvedPotential: true });
        }
      }
    }
  }
  return handlers;
}

function unwrapAwait(expression) {
  return ts.isAwaitExpression(expression) ? expression.expression : expression;
}

function guardBindingFromStatement(statement, guardLocals) {
  if (!ts.isVariableStatement(statement)) return undefined;
  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    const initializer = unwrapAwait(declaration.initializer);
    if (
      ts.isCallExpression(initializer) &&
      ts.isIdentifier(initializer.expression) &&
      guardLocals.has(initializer.expression.text)
    ) {
      return declaration.name.text;
    }
  }
  return undefined;
}

function isNotOkCondition(expression, binding) {
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isPropertyAccessExpression(expression.operand) &&
    ts.isIdentifier(expression.operand.expression)
  ) {
    return expression.operand.expression.text === binding && expression.operand.name.text === 'ok';
  }
  return false;
}

function returnsFromRejectedGuard(statement) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isReturnStatement(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return found;
}

/**
 * Аудит круга 4 (MUST FIX-1): гейт требовал, чтобы проход БЫЛ, но не требовал, чтобы он был ПЕРВЫМ.
 * Временный маршрут, который сначала звал `buildAppDeps().materialRating.getForPatient(...)`, а
 * проход проходил уже после, оставлял гейт зелёным — то есть защищённые данные читались до двери.
 *
 * Правило порядка: до строки прохода обработчик может ждать только разбор самого запроса и чтение
 * конфигурации. Любое другое ожидание — потенциальное чтение данных, и оно обязано стоять ПОСЛЕ.
 * Список намеренно короткий: расширять его — осознанное действие, а не побочный эффект правки.
 */
const PRE_GATE_PORT_ALLOWLIST = new Set(['runtimeConfig']);

/** Переменные, в которые положили `buildAppDeps()` — через них идёт доступ к данным. */
function depsLocals(body) {
  const locals = new Set();
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === 'buildAppDeps'
    ) {
      locals.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return locals;
}

/**
 * Ожидание, которое ЧИТАЕТ ДАННЫЕ: цепочка вызова уходит корнем в `buildAppDeps()` — прямо или
 * через переменную. Именно это и есть доступ к защищённым данным (порт БД централизован,
 * `saas-db-port-is-getdrizzle-central`); сессия и счётчик попыток данными не являются и сюда не
 * попадают. Порт `runtimeConfig` разрешён явно: это настройка платформы, не данные арендатора, и
 * маршрут оценки материалов законно читает флаг включённости ДО двери.
 */
function dataReadPortOf(expression, depsVars) {
  let x = expression;
  while (ts.isParenthesizedExpression(x) || ts.isAwaitExpression(x)) x = x.expression;
  if (!ts.isCallExpression(x)) return undefined;
  const segments = [];
  let node = x.expression;
  for (;;) {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.name)) segments.unshift(node.name.text);
      node = node.expression;
      continue;
    }
    if (ts.isElementAccessExpression(node)) {
      const propertyName =
        node.argumentExpression && propertyNameOf(unwrapExpression(node.argumentExpression));
      if (propertyName === undefined) return undefined;
      segments.unshift(propertyName);
      node = node.expression;
      continue;
    }
    if (ts.isCallExpression(node)) {
      node = node.expression;
      continue;
    }
    break;
  }
  const rootIsDeps =
    (ts.isIdentifier(node) && (depsVars.has(node.text) || node.text === 'buildAppDeps'));
  if (!rootIsDeps) return undefined;
  const port = segments[0];
  if (port !== undefined && PRE_GATE_PORT_ALLOWLIST.has(port)) return undefined;
  return port ?? '<deps>';
}

/**
 * Проверяет всё вычисляемое под `await`: прямые чтения в обёртках/агрегаторах и тела каждого
 * локального helper, который реально вызывается в этом выражении. Литерал функции сам по себе не
 * выполняется, поэтому в его тело заходим только через разрешённый CallExpression.
 */
function firstDataReadPortInAwaitedExpression(node, depsVars, seenBodies) {
  let found;
  const visit = (n) => {
    if (found !== undefined) return;
    if (
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isMethodDeclaration(n)
    ) {
      return;
    }

    const port = dataReadPortOf(n, depsVars);
    if (port !== undefined) {
      found = port;
      return;
    }

    if (ts.isCallExpression(n)) {
      const resolved = resolveToFunctionBodies(n.expression, lexicalScopeOf(n.expression));
      for (const body of resolved.bodies) {
        if (seenBodies.has(body)) continue;
        const nestedSeen = new Set(seenBodies).add(body);
        // The invoked helper is already below the outer await. Its body may return the data
        // promise directly (`async () => repo.read()`), without spelling another inner await.
        const nested = firstDataReadPortInAwaitedExpression(body, depsVars, nestedSeen);
        if (nested !== undefined) {
          found = nested;
          return;
        }
      }
    }

    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Первый порт данных, прочитанный внутри узла, в порядке появления. */
function firstDataReadPortIn(node, depsVars, seenBodies = new Set()) {
  let found;
  const visit = (n) => {
    if (found !== undefined) return;
    /* Круг 5, MUST FIX-5: ОБЪЯВЛЕНИЕ функции ничего не читает — читает её ВЫЗОВ. Раньше обход
       заходил в тело вложенной стрелки и находил там `await`, из-за чего законный handler, где
       helper объявлен до двери, а вызван после, объявлялся нарушением. Границу функции не
       пересекаем; сам узел, если он и есть тело обработчика, пропускаем в обход. */
    if (
      n !== node &&
      (ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n) ||
        ts.isFunctionDeclaration(n) ||
        ts.isMethodDeclaration(n))
    ) {
      return;
    }
    if (ts.isAwaitExpression(n)) {
      found = firstDataReadPortInAwaitedExpression(n.expression, depsVars, seenBodies);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function handlerPassesDoor(body, guardLocals) {
  if (!ts.isBlock(body)) return { ok: false };
  for (let index = 0; index < body.statements.length; index += 1) {
    const binding = guardBindingFromStatement(body.statements[index], guardLocals);
    if (!binding) continue;
    for (const following of body.statements.slice(index + 1)) {
      if (
        ts.isIfStatement(following) &&
        isNotOkCondition(following.expression, binding) &&
        returnsFromRejectedGuard(following.thenStatement)
      ) {
        // Порядок (круг 4, MUST FIX-1): дверь обязана стоять ВЫШЕ любого чтения данных.
        const depsVars = depsLocals(body);
        for (const earlier of body.statements.slice(0, index)) {
          const port = firstDataReadPortIn(earlier, depsVars);
          if (port !== undefined) return { ok: false, early: port };
        }
        return { ok: true };
      }
    }
  }
  return { ok: false };
}

export function checkSource(relativePath, source, exceptions = routeExceptions) {
  const inScope = isGuardedRoute(relativePath) || importsAcceptedGuard(source);
  if (!inScope) return [];

  const reason = exceptions.get(relativePath);
  if (reason !== undefined) {
    if (typeof reason !== 'string' || reason.trim() === '' || /[\r\n]/.test(reason)) {
      return [`${relativePath}: exception must have a non-empty one-line reason`];
    }
    return [];
  }

  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const guardLocals = importedGuardLocals(sourceFile);
  const findings = [];
  for (const handler of exportedHandlers(sourceFile)) {
    /* Every candidate must pass; a possibly-functional unresolved wrapper argument fails closed. */
    const verdicts = (handler.bodies ?? []).map((body) => handlerPassesDoor(body, guardLocals));
    const verdict =
      verdicts.length === 0 || handler.unresolvedPotential
        ? { ok: false }
        : (verdicts.find((v) => !v.ok) ?? { ok: true });
    if (verdict.ok) continue;
    if (verdict.early) {
      findings.push(
        `${relativePath}: exported ${handler.method} reads data through \`${verdict.early}\` BEFORE ` +
          'the shared door — move the door above every read',
      );
      continue;
    }
    findings.push(
      `${relativePath}: exported ${handler.method} must fail closed through ` +
        'requirePatientApiBusinessAccess (or requirePatientBookingTrustedPhoneAccess)',
    );
  }
  return findings;
}

function checkTree() {
  const findings = [];
  let routeCount = 0;
  let handlerCount = 0;
  let exceptionCount = 0;
  const seen = new Set();

  for (const file of collectRouteFiles(apiRoot)) {
    {
      const relativePath = path.relative(apiRoot, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf8');
      if (!isGuardedRoute(relativePath) && !importsAcceptedGuard(source)) continue;
      seen.add(relativePath);
      routeCount += 1;
      const sourceFile = ts.createSourceFile(
        relativePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      handlerCount += exportedHandlers(sourceFile).length;
      if (routeExceptions.has(relativePath)) exceptionCount += 1;
      findings.push(...checkSource(relativePath, source));
    }
  }

  for (const [relativePath, reason] of routeExceptions) {
    if (typeof reason !== 'string' || reason.trim() === '' || /[\r\n]/.test(reason)) {
      findings.push(`${relativePath}: exception must have a non-empty one-line reason`);
    } else if (!seen.has(relativePath)) {
      findings.push(`${relativePath}: exception is outside the scanned tree or the file is missing`);
    }
  }

  return { findings, routeCount, handlerCount, exceptionCount };
}

function selfTest() {
  const guardImport =
    "import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';";
  const guarded =
    "const gate = await requirePatientApiBusinessAccess(); if (!gate.ok) return gate.response;";

  const bypasses = [
    [
      'круг 9: агрегирующий await не скрывает прямое чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const [plan] = await Promise.all([buildAppDeps().treatmentProgram.getForPatient({})]); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { ${guarded} const [plan] = await Promise.all([buildAppDeps().treatmentProgram.getForPatient({})]); return Response.json(plan); }`,
    ],
    [
      'круг 9: локальный helper внутри агрегирующего await не скрывает чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const pull = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const [plan] = await Promise.all([pull()]); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const pull = async () => await buildAppDeps().treatmentProgram.getForPatient({}); ${guarded} const [plan] = await Promise.all([pull()]); return Response.json(plan); }`,
    ],
    [
      'круг 9: bracket-access в цепочке порта не скрывает прямое чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const plan = await buildAppDeps()['treatmentProgram'].getForPatient({}); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { ${guarded} const plan = await buildAppDeps()['treatmentProgram'].getForPatient({}); return Response.json(plan); }`,
    ],
    [
      'круг 9: объектная деструктуризация helper не скрывает чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const box = { pull: async () => buildAppDeps().treatmentProgram.getForPatient({}) }; const { pull } = box; const plan = await pull(); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const box = { pull: async () => buildAppDeps().treatmentProgram.getForPatient({}) }; const { pull } = box; ${guarded} const plan = await pull(); return Response.json(plan); }`,
    ],
    [
      'круг 9: массивная деструктуризация helper не скрывает чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const box = [async () => buildAppDeps().treatmentProgram.getForPatient({})]; const [pull] = box; const plan = await pull(); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const box = [async () => buildAppDeps().treatmentProgram.getForPatient({})]; const [pull] = box; ${guarded} const plan = await pull(); return Response.json(plan); }`,
    ],
    [
      'круг 9: вычислимое строковое имя свойства не скрывает чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const pull = async () => buildAppDeps().treatmentProgram.getForPatient({}); const box = { ['pull']: pull }; const plan = await box.pull(); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const pull = async () => buildAppDeps().treatmentProgram.getForPatient({}); const box = { ['pull']: pull }; ${guarded} const plan = await box.pull(); return Response.json(plan); }`,
    ],
    [
      'круг 9: вычислимое числовое имя свойства не скрывает чтение данных',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const pull = async () => buildAppDeps().treatmentProgram.getForPatient({}); const box = { [0]: pull }; const plan = await box[0](); ${guarded} return Response.json(plan); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const pull = async () => buildAppDeps().treatmentProgram.getForPatient({}); const box = { [0]: pull }; ${guarded} const plan = await box[0](); return Response.json(plan); }`,
    ],
    [
      'круг 9: неразрешимый путь деструктурированного handler закрывается',
      'patient/x/route.ts',
      `${guardImport} const box = {}; const { pull } = box; export const GET = pull;`,
      new Map(),
      'exported GET must fail closed',
      `${guardImport} const box = { pull: async () => { ${guarded} return Response.json({ ok: true }); } }; const { pull } = box; export const GET = pull;`,
    ],
    [
      'круг 6, MF1: локальный helper ВЫЗВАН до двери — читает он, а не объявление',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const deps = buildAppDeps(); const loadPlan = async () => await deps.treatmentProgram.getForPatient({}); const exposed = await loadPlan(); ${guarded} return Response.json(exposed); }`,
      new Map(),
    ],
    [
      'круг 7, MF1: alias локального helper не скрывает чтение до двери',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const f = loadPlan; const exposed = await f(); ${guarded} return Response.json(exposed); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const f = loadPlan; ${guarded} const exposed = await f(); return Response.json(exposed); }`,
    ],
    [
      'круг 7, MF1: .call локального helper не скрывает чтение до двери',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const exposed = await loadPlan.call(null); ${guarded} return Response.json(exposed); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); ${guarded} const exposed = await loadPlan.call(null); return Response.json(exposed); }`,
    ],
    [
      'круг 7, MF1: метод объектного литерала не скрывает чтение до двери',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const loaders = { loadPlan }; const exposed = await loaders.loadPlan(); ${guarded} return Response.json(exposed); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const loaders = { loadPlan }; ${guarded} const exposed = await loaders.loadPlan(); return Response.json(exposed); }`,
    ],
    [
      'круг 7, MF1: элемент массива не скрывает чтение до двери',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); const exposed = await [loadPlan][0](); ${guarded} return Response.json(exposed); }`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const loadPlan = async () => await buildAppDeps().treatmentProgram.getForPatient({}); ${guarded} const exposed = await [loadPlan][0](); return Response.json(exposed); }`,
    ],
    [
      'круг 6, MF2: настоящий обработчик спрятан первым аргументом обёртки, дверь — во втором callback',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } export const GET = wrap(actualHandler, async () => { ${guarded} return Response.json({ settled: true }); });`,
      new Map(),
    ],
    [
      'круг 7, MF2: alias обработчика не маскируется защищённым callback',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } const f = actualHandler; export const GET = compose(f, async () => { ${guarded} return Response.json({ settled: true }); });`,
      new Map(),
      'exported GET must fail closed',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { ${guarded} return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } const f = actualHandler; export const GET = compose(f, async () => { ${guarded} return Response.json({ settled: true }); });`,
    ],
    [
      'круг 7, MF2: обработчик в массиве не маскируется защищённым callback',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } export const GET = compose([actualHandler], async () => { ${guarded} return Response.json({ settled: true }); });`,
      new Map(),
      'exported GET must fail closed',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { ${guarded} return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } export const GET = compose([actualHandler], async () => { ${guarded} return Response.json({ settled: true }); });`,
    ],
    [
      'проверка ведущего: вложенный контейнер не прячет чтение до двери',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const load = async () => await buildAppDeps().materialRating.listForPatient({}); const reg = { a: { load } }; const exposed = await reg.a.load(); ${guarded} return Response.json(exposed); }`,
      new Map(),
      'reads data through `materialRating` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const load = async () => await buildAppDeps().materialRating.listForPatient({}); const reg = { a: { load } }; ${guarded} const exposed = await reg.a.load(); return Response.json(exposed); }`,
    ],
    [
      'проверка ведущего: объектный контейнер обработчика не маскируется защищённым callback',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { return Response.json(await buildAppDeps().materialRating.listForPatient({})); } export const GET = compose({ h: actualHandler }, async () => { ${guarded} return Response.json({ settled: true }); });`,
      new Map(),
      'exported GET must fail closed',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { ${guarded} return Response.json(await buildAppDeps().materialRating.listForPatient({})); } export const GET = compose({ h: actualHandler }, async () => { ${guarded} return Response.json({ settled: true }); });`,
    ],
    [
      'неразрешимый аргумент обёртки не маскируется защищённым callback',
      'patient/x/route.ts',
      `${guardImport} import { externalHandler } from './external-handler'; export const GET = compose(externalHandler, async () => { ${guarded} return Response.json({ settled: true }); });`,
      new Map(),
      'exported GET must fail closed',
      `${guardImport} const localHandler = async () => { ${guarded} return Response.json({ ok: true }); }; export const GET = compose(localHandler, async () => { ${guarded} return Response.json({ settled: true }); });`,
    ],
    [
      'круг 7, MF3: вложенное одноимённое объявление не скрывает небезопасный top-level handler',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { const exposed = await buildAppDeps().treatmentProgram.getForPatient({}); ${guarded} return Response.json(exposed); } function unrelatedScope() { async function actualHandler() { ${guarded} return Response.json({ ok: true }); } return actualHandler; } export const GET = actualHandler;`,
      new Map(),
      'reads data through `treatmentProgram` BEFORE',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { ${guarded} const exposed = await buildAppDeps().treatmentProgram.getForPatient({}); return Response.json(exposed); } function unrelatedScope() { async function actualHandler() { ${guarded} return Response.json({ ok: true }); } return actualHandler; } export const GET = actualHandler;`,
    ],
    [
      'handler without the common door',
      'patient/x/route.ts',
      'export async function GET() { return Response.json({ ok: true }); }',
      new Map(),
    ],
    [
      'only one method out of two uses the common door',
      'patient/x/route.ts',
      `${guardImport} export async function GET() { ${guarded} return Response.json({ ok: true }); } export async function PUT() { return Response.json({ ok: true }); }`,
      new Map(),
    ],
    [
      'guard result is ignored',
      'patient/x/route.ts',
      `${guardImport} export async function GET() { await requirePatientApiBusinessAccess(); return Response.json({ ok: true }); }`,
      new Map(),
    ],
    [
      'indirect handler export hides the implementation',
      'patient/x/route.ts',
      'async function read() { return Response.json({ ok: true }); } export { read as GET };',
      new Map(),
    ],
    [
      'a route outside the two areas may not drop the guard it already entered through',
      'media/[id]/route.ts',
      `${guardImport} export async function GET() { await requirePatientApiBusinessAccess(); return Response.json({ ok: true }); }`,
      new Map(),
    ],
    [
      'чтение данных стоит ВЫШЕ двери (круг 4, MUST FIX-1)',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const deps = buildAppDeps(); const leaked = await deps.materialRating.getForPatient({}); ${guarded} return Response.json({ ok: true, leaked }); }`,
      new Map(),
    ],
    [
      'маршрут с расширением .js остаётся маршрутом (круг 4, MUST FIX-2)',
      'patient/x/route.js',
      'export async function GET() { return Response.json({ ok: true }); }',
      new Map(),
    ],
    [
      'exception without a reason',
      'patient/x/route.ts',
      'export async function GET() { return Response.json({ ok: true }); }',
      new Map([['patient/x/route.ts', '']]),
    ],
  ];

  for (const [name, relativePath, source, exceptions, expectedFinding, fixedSource] of bypasses) {
    const findings = checkSource(relativePath, source, exceptions);
    if (findings.length === 0) {
      throw new Error(`self-test stayed green: ${name}`);
    }
    if (
      expectedFinding &&
      (findings.length !== 1 || !findings[0].includes(expectedFinding))
    ) {
      throw new Error(
        `self-test failed for the wrong reason: ${name}\n${findings.join('\n')}`,
      );
    }
    if (fixedSource) {
      const fixedFindings = checkSource(relativePath, fixedSource, exceptions);
      if (fixedFindings.length > 0) {
        throw new Error(
          `self-test mutation stayed red: ${name}\n${fixedFindings.join('\n')}`,
        );
      }
    }
  }

  const canonical = [
    [
      'круг 9: безопасный handler через объектную деструктуризацию остаётся разрешён',
      'patient/x/route.ts',
      `${guardImport} const box = { pull: async () => { ${guarded} return Response.json({ ok: true }); } }; const { pull } = box; export const GET = pull;`,
      new Map(),
    ],
    [
      'круг 9: безопасный handler через массивную деструктуризацию остаётся разрешён',
      'patient/x/route.ts',
      `${guardImport} const box = [async () => { ${guarded} return Response.json({ ok: true }); }]; const [pull] = box; export const GET = pull;`,
      new Map(),
    ],
    [
      'круг 9: безопасный handler в вычислимом строковом свойстве остаётся разрешён',
      'patient/x/route.ts',
      `${guardImport} const pull = async () => { ${guarded} return Response.json({ ok: true }); }; const box = { ['pull']: pull }; export const GET = box.pull;`,
      new Map(),
    ],
    [
      'one guarded method',
      'patient/x/route.ts',
      `${guardImport} export async function GET() { ${guarded} return Response.json({ ok: true }); }`,
      new Map(),
    ],
    [
      'both methods guarded, including an aliased import',
      'patient/x/route.ts',
      "import { requirePatientApiBusinessAccess as enter } from '@/app-layer/guards/requireRole'; export async function GET() { const gate = await enter(); if (!gate.ok) { return gate.response; } return Response.json({ ok: true }); } export const POST = async () => { const access = await enter(); if (!access.ok) return access.response; return Response.json({ ok: true }); };",
      new Map(),
    ],
    [
      'explicit exception with a reason',
      'patient/support/route.ts',
      'export async function POST() { return Response.json({ ok: true }); }',
      new Map([['patient/support/route.ts', 'support remains reachable from the gate']]),
    ],
    [
      'a route outside the two areas that never entered through the guard stays out of scope',
      'media/[id]/route.ts',
      'export async function GET() { return Response.json({ ok: true }); }',
      new Map(),
    ],
    [
      'чтение настройки платформы до двери законно — это не данные арендатора',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const deps = buildAppDeps(); const on = await deps.runtimeConfig.getServerBoolean('x'); if (!on) return Response.json({ ok: false }); ${guarded} return Response.json({ ok: true }); }`,
      new Map(),
    ],
    [
      'public booking is outside the protected route scope',
      'booking/public/slots/route.ts',
      'export async function GET() { return Response.json({ ok: true }); }',
      new Map(),
    ],
    [
      'объявление helper до двери — не чтение; читает его вызов после двери (круг 5, MF5)',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export async function GET() { const deps = buildAppDeps(); const read = async () => await deps.materialRating.getForPatient({}); ${guarded} return Response.json(await read()); }`,
      new Map(),
    ],
    [
      'обработчик в обёртке с дверью первой — законная форма (круг 5, MF6)',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; export const GET = makeHandler(async () => { ${guarded} const deps = buildAppDeps(); return Response.json(await deps.materialRating.getForPatient({})); });`,
      new Map(),
    ],
    [
      'круг 7, MF3: вложенное одноимённое небезопасное объявление не портит защищённый top-level handler',
      'patient/x/route.ts',
      `${guardImport} import { buildAppDeps } from '@/app-layer/di/buildAppDeps'; async function actualHandler() { ${guarded} return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } function unrelatedScope() { async function actualHandler() { return Response.json(await buildAppDeps().treatmentProgram.getForPatient({})); } return actualHandler; } export const GET = actualHandler;`,
      new Map(),
    ],
  ];

  for (const [name, relativePath, source, exceptions] of canonical) {
    const findings = checkSource(relativePath, source, exceptions);
    if (findings.length > 0) {
      throw new Error(`self-test went red: ${name}\n${findings.join('\n')}`);
    }
  }

  const mutationCount = bypasses.filter((fixture) => fixture[5]).length;
  console.log(
    `patient API business access door self-test: OK (${bypasses.length} bypass fixtures red, ` +
      `${mutationCount} safe mutations green, ${canonical.length} canonical fixtures green)`,
  );
}

if (process.argv.includes('--self-test')) selfTest();

const result = checkTree();
if (result.findings.length > 0) {
  console.error(
    `patient API business access door: ${result.findings.length} violation(s)\n` +
      result.findings.join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    `patient API business access door: OK (${result.handlerCount} handlers, ` +
      `${result.routeCount} guarded routes, ${result.exceptionCount} explicit exceptions)`,
  );
}
