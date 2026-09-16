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

function exportedHandlers(sourceFile) {
  const handlers = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name &&
      httpMethods.has(statement.name.text)
    ) {
      handlers.push({ method: statement.name.text, body: statement.body });
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !httpMethods.has(declaration.name.text)) {
          continue;
        }
        const initializer = declaration.initializer;
        const body =
          initializer &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          ts.isBlock(initializer.body)
            ? initializer.body
            : undefined;
        handlers.push({ method: declaration.name.text, body });
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
          handlers.push({ method: element.name.text, body: undefined });
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

/** Первый порт данных, прочитанный внутри узла, в порядке появления. */
function firstDataReadPortIn(node, depsVars) {
  let found;
  const visit = (n) => {
    if (found !== undefined) return;
    if (ts.isAwaitExpression(n)) {
      const port = dataReadPortOf(n.expression, depsVars);
      if (port !== undefined) {
        found = port;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function handlerPassesDoor(body, guardLocals) {
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
    const verdict = handler.body ? handlerPassesDoor(handler.body, guardLocals) : { ok: false };
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

  for (const [name, relativePath, source, exceptions] of bypasses) {
    if (checkSource(relativePath, source, exceptions).length === 0) {
      throw new Error(`self-test stayed green: ${name}`);
    }
  }

  const canonical = [
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
  ];

  for (const [name, relativePath, source, exceptions] of canonical) {
    const findings = checkSource(relativePath, source, exceptions);
    if (findings.length > 0) {
      throw new Error(`self-test went red: ${name}\n${findings.join('\n')}`);
    }
  }

  console.log(
    `patient API business access door self-test: OK (${bypasses.length} bypass fixtures red, ${canonical.length} canonical fixtures green)`,
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
