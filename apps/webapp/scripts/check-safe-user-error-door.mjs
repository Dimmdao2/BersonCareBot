#!/usr/bin/env node
/**
 * Structural gate for LOG-01: a user-facing API route must not hand the text of a caught
 * exception to the doctor, the clinic or the patient.
 *
 * Why a gate and not a review rule: the leaking shape (`const msg = e instanceof Error ? e.message
 * : 'error'; return NextResponse.json({ ok: false, error: msg })`) reads like ordinary error
 * handling, and for a database driver failure that `msg` is the failed query together with table,
 * column and parameter values. Screens on a bare `fetch` print the `error` field straight into the
 * DOM, so the bypass is reachable and silent. One door already exists —
 * `respondWithSafeApiError` / `safeActionErrorText` (`@/app-layer/errors/safeUserError`) — and this
 * gate is what makes going around it fail the build instead of failing review.
 *
 * What is a violation: inside a `catch` clause of a route in the user-facing surface, a response
 * body literal (`NextResponse.json` / `Response.json` / `jsonError`) carries a client-visible key
 * whose value is derived from the caught binding. Taint flows through local variables, ternaries,
 * template literals, `String(...)`, `.message`, `.stack` and `.cause`.
 *
 * What is not a violation: passing the caught value to the door, to a logger, or to a typed
 * predicate; returning a fixed string literal code; reading an author-declared field of a typed
 * error (`e.code`, `e.reason`, `e.usage`); a value an enclosing `if` already pinned to string
 * literals (`if (message === 'branch_not_found' …) { … error: message }`). Those four shapes are
 * recognised structurally, which is why ALLOWLIST is empty: every user-facing route passes on its
 * own construction. An entry there would be an admission that a branch cannot be shown safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(appRoot, 'src');
const apiRoot = path.join(sourceRoot, 'app', 'api');

/**
 * Surface the owner's decision covers: what a doctor, a clinic or a patient can reach from a
 * cabinet or a public booking page. `admin/**`, `internal/**` and `integrator/**` are operator and
 * machine-to-machine surfaces and stay outside this gate until that is decided separately.
 */
const GUARDED_AREAS = ['doctor', 'patient', 'clinic', 'booking', 'account', 'media'];

/** Response keys a client can read and show to a human. */
const CLIENT_VISIBLE_KEYS = new Set([
  'error',
  'message',
  'details',
  'detail',
  'reason',
  'hint',
  'description',
  'text',
]);

/** Calls whose object-literal argument is an HTTP response body. */
const RESPONSE_BUILDERS = new Set(['NextResponse.json', 'Response.json', 'jsonError', 'jsonOk']);

/**
 * Properties of a caught value that carry text produced by the runtime, the database driver or a
 * provider client. Any other property (`code`, `reason`, `accessCode`, `usage`, `descriptor`) is a
 * field the author declared on a typed error, so reading it cannot surface a failed query.
 */
const RAW_TEXT_PROPERTIES = new Set(['message', 'stack', 'cause']);

/** The single sanctioned door plus sinks that keep the value server-side. */
const SAFE_SINKS = new Set([
  'respondWithSafeApiError',
  'safeActionErrorText',
  'safeUserMessage',
  'userFacingMessage',
  'classifyApiError',
  'logServerRuntimeError',
  'serializeError',
]);

/**
 * Narrow, documented exceptions. Key is `<relative route path>:<response key>`; the value states
 * why the value on that branch cannot carry exception text. Currently empty and meant to stay that
 * way — an entry here silences the gate for every future return of that key in that file, so a
 * concrete safe branch belongs in the structural rules above, not on this list.
 */
const ALLOWLIST = new Map([]);

function isRouteFile(filename) {
  return filename.endsWith(`${path.sep}route.ts`);
}

function guardedArea(relativePath) {
  const [area] = relativePath.split('/');
  return GUARDED_AREAS.includes(area) ? area : undefined;
}

function collectRouteFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectRouteFiles(full, out);
    else if (isRouteFile(full)) out.push(full);
  }
  return out;
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const target = ts.isIdentifier(expression.expression) ? expression.expression.text : undefined;
    return target ? `${target}.${expression.name.text}` : expression.name.text;
  }
  return undefined;
}

function propertyKey(property) {
  const { name } = property;
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

/**
 * Does `node` read raw text out of any tainted identifier? `e`, `e.message`, `String(e)`,
 * `` `${e}` ``, `msg` (assigned from one of those) all count. A bare reference handed to the door
 * or to a logger does not, and neither does a typed field such as `error.descriptor.code`.
 */
const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
]);

function readsTaint(node, tainted) {
  let found = false;

  const visit = (current) => {
    if (found) return;

    // A comparison yields a boolean, so `code === '42501' ? 'a' : 'b'` returns the author's
    // literal no matter what the exception said. Do not follow the operands.
    if (ts.isBinaryExpression(current) && COMPARISON_OPERATORS.has(current.operatorToken.kind)) {
      return;
    }

    if (ts.isCallExpression(current)) {
      const name = callName(current.expression);
      if (name && SAFE_SINKS.has(name)) return;
    }

    // `e.code` / `e.usage` / `error.descriptor.code`: author-declared fields of a typed error.
    if (
      (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) &&
      ts.isIdentifier(current.expression) &&
      tainted.has(current.expression.text)
    ) {
      const property = ts.isPropertyAccessExpression(current) ? current.name.text : undefined;
      if (property !== undefined && !RAW_TEXT_PROPERTIES.has(property)) return;
      found = true;
      return;
    }

    if (ts.isIdentifier(current) && tainted.has(current.text)) {
      found = true;
      return;
    }

    ts.forEachChild(current, visit);
  };

  visit(node);
  return found;
}

/** Identifiers that carry raw exception text, seeded with the catch binding. */
function taintedIdentifiers(catchClause) {
  const tainted = new Set();
  const { variableDeclaration } = catchClause;
  if (variableDeclaration && ts.isIdentifier(variableDeclaration.name)) {
    tainted.add(variableDeclaration.name.text);
  }
  if (tainted.size === 0) return tainted;

  // Local aliases: `const msg = e instanceof Error ? e.message : 'error'`, `const t = String(e)`.
  // Repeat so chains (`const a = e.message; const b = a`) settle.
  for (let pass = 0; pass < 4; pass += 1) {
    const before = tainted.size;
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
        if (readsTaint(node.initializer, tainted)) tainted.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(catchClause.block);
    if (tainted.size === before) break;
  }

  return tainted;
}

/**
 * Is `value` a bare identifier that some enclosing `if` already pinned to string literals?
 *
 * `if (message === 'branch_not_found' || message === 'service_not_found') { … error: message }`
 * can only ever put one of those literals on the wire, so it is a domain code branch and not a
 * leak. The guard has to be a pure `||` chain of `<identifier> === '<literal>'` — one loose
 * disjunct and the value is no longer pinned.
 */
function narrowedToLiterals(value, catchClause, tainted) {
  if (!ts.isIdentifier(value)) return false;

  const pinsValue = (condition) => {
    if (ts.isParenthesizedExpression(condition)) return pinsValue(condition.expression);
    if (
      ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.BarBarToken
    ) {
      return pinsValue(condition.left) && pinsValue(condition.right);
    }
    return (
      ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isIdentifier(condition.left) &&
      condition.left.text === value.text &&
      (ts.isStringLiteral(condition.right) ||
        (ts.isIdentifier(condition.right) && !tainted.has(condition.right.text)))
    );
  };

  let node = value;
  while (node && node !== catchClause) {
    const parent = node.parent;
    if (
      parent &&
      ts.isIfStatement(parent) &&
      parent.thenStatement === node &&
      pinsValue(parent.expression)
    ) {
      return true;
    }
    node = parent;
  }
  return false;
}

/**
 * Track D's shared transport door. The strict object shape matters: the older
 * `jsonError('failed', { message: raw })` response builder remains a checked response surface.
 */
function isCanonicalJsonErrorDoor(call, tainted) {
  if (callName(call.expression) !== 'jsonError' || call.arguments.length !== 1) return false;
  const [argument] = call.arguments;
  if (!ts.isObjectLiteralExpression(argument)) return false;

  const properties = new Map();
  for (const property of argument.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      properties.set(property.name.text, property.name);
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyKey(property);
    if (key) properties.set(key, property.initializer);
  }
  const error = properties.get('error');
  const fallback = properties.get('fallback');
  const logEvent = properties.get('logEvent');
  if (
    !error ||
    !ts.isIdentifier(error) ||
    !tainted.has(error.text) ||
    !fallback ||
    !ts.isObjectLiteralExpression(fallback) ||
    !logEvent ||
    !ts.isStringLiteral(logEvent)
  ) {
    return false;
  }

  const fallbackFields = new Map();
  for (const property of fallback.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const key = propertyKey(property);
    if (key) fallbackFields.set(key, property.initializer);
  }
  const fallbackCode = fallbackFields.get('code');
  const fallbackStatus = fallbackFields.get('status');
  return Boolean(
    fallbackCode &&
    ts.isStringLiteral(fallbackCode) &&
    fallbackStatus &&
    ts.isNumericLiteral(fallbackStatus),
  );
}

/** Response body literals built anywhere inside the catch block. */
function responseBodyLiterals(catchClause, tainted) {
  const bodies = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (isCanonicalJsonErrorDoor(node, tainted)) return;
      if (name && RESPONSE_BUILDERS.has(name)) {
        for (const argument of node.arguments) {
          if (ts.isObjectLiteralExpression(argument)) bodies.push(argument);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(catchClause.block);
  return bodies;
}

export function checkSource(relativePath, source) {
  const findings = [];
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);

  const visit = (node) => {
    if (ts.isCatchClause(node)) {
      const tainted = taintedIdentifiers(node);
      if (tainted.size > 0) {
        for (const body of responseBodyLiterals(node, tainted)) {
          for (const property of body.properties) {
            if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
              continue;
            }
            const key = propertyKey(property);
            if (!key || !CLIENT_VISIBLE_KEYS.has(key)) continue;

            const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
            if (!readsTaint(value, tainted)) continue;
            if (narrowedToLiterals(value, node, tainted)) continue;
            if (ALLOWLIST.has(`${relativePath}:${key}`)) continue;

            const { line } = sourceFile.getLineAndCharacterOfPosition(
              property.getStart(sourceFile),
            );
            findings.push(
              `${relativePath}:${line + 1}  response key \`${key}\` carries caught exception text. ` +
                'Return it through respondWithSafeApiError() (@/app-layer/errors/safeUserError).',
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function checkTree() {
  const findings = [];
  for (const area of GUARDED_AREAS) {
    const areaRoot = path.join(apiRoot, area);
    if (!fs.existsSync(areaRoot)) continue;
    for (const file of collectRouteFiles(areaRoot)) {
      const relativePath = path.relative(apiRoot, file).split(path.sep).join('/');
      if (!guardedArea(relativePath)) continue;
      findings.push(...checkSource(relativePath, fs.readFileSync(file, 'utf8')));
    }
  }
  return findings;
}

function selfTest() {
  const leaking = [
    [
      'ternary alias in `error`',
      'doctor/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { const msg = e instanceof Error ? e.message : 'error'; return NextResponse.json({ ok: false, error: msg }, { status: 400 }); } }",
    ],
    [
      'direct `.message` in `error`',
      'patient/x/route.ts',
      'export async function POST() { try { await run(); } catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 404 }); } }',
    ],
    [
      '`String(error)` in `message`',
      'clinic/x/route.ts',
      "export async function POST() { try { await run(); } catch (error) { return NextResponse.json({ ok: false, error: 'failed', message: String(error) }, { status: 500 }); } }",
    ],
    [
      'template literal in `detail`',
      'doctor/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { return NextResponse.json({ ok: false, error: 'failed', detail: `${e}` }, { status: 400 }); } }",
    ],
    [
      'alias chain into `details`',
      'booking/x/route.ts',
      "export async function POST() { try { await run(); } catch (err) { const raw = err.message; const shown = raw; return NextResponse.json({ ok: false, error: 'failed', details: shown }, { status: 400 }); } }",
    ],
    [
      '`stack` in `reason`',
      'account/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { return NextResponse.json({ ok: false, error: 'failed', reason: e.stack }, { status: 500 }); } }",
    ],
    [
      'jsonError public fields',
      'media/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { const msg = String(e); return jsonError('failed', { message: msg }, { status: 400 }); } }",
    ],
    [
      'shorthand property',
      'doctor/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { const message = e instanceof Error ? e.message : 'x'; return NextResponse.json({ ok: false, error: 'failed', message }, { status: 400 }); } }",
    ],
  ];

  for (const [name, relativePath, source] of leaking) {
    if (checkSource(relativePath, source).length === 0) {
      throw new Error(`self-test stayed green on a leak: ${name}`);
    }
  }

  const safe = [
    [
      'Track D jsonError door',
      'doctor/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { return jsonError({ error: e, fallback: { code: 'failed', status: 500 }, logEvent: 'doctor_x_failed' }); } }",
    ],
    [
      'door',
      'doctor/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { return respondWithSafeApiError('api/doctor/x', e, { fallbackCode: 'failed', fallbackStatus: 500 }); } }",
    ],
    [
      'fixed code plus logged exception',
      'patient/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { logger.error({ err: e }, 'failed'); return NextResponse.json({ ok: false, error: 'failed' }, { status: 500 }); } }",
    ],
    [
      'typed descriptor fields',
      'clinic/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { if (isUsageConflict(e)) { return NextResponse.json({ ok: false, code: e.code, usage: e.usage }, { status: 409 }); } return respondWithSafeApiError('api/clinic/x', e, { fallbackCode: 'failed', fallbackStatus: 500 }); } }",
    ],
    [
      'digest from the closed logger',
      'doctor/x/route.ts',
      "export async function POST() { try { await run(); } catch (e) { const { digest } = logServerRuntimeError('api/doctor/x', e); return NextResponse.json({ ok: false, error: 'failed', digest }, { status: 500 }); } }",
    ],
    [
      'author-declared field of a typed error',
      'patient/x/route.ts',
      'export async function POST() { try { await run(); } catch (e) { if (e instanceof AccessError) { return NextResponse.json({ ok: false, error: e.accessCode }, { status: 404 }); } throw e; } }',
    ],
  ];

  // The typed-field exemption must not swallow the raw text properties it sits next to.
  for (const property of ['message', 'stack', 'cause']) {
    const source = `export async function POST() { try { await run(); } catch (e) { return NextResponse.json({ ok: false, error: e.${property} }, { status: 400 }); } }`;
    if (checkSource('doctor/x/route.ts', source).length === 0) {
      throw new Error(`self-test stayed green on a leak: \`e.${property}\``);
    }
  }

  for (const [name, relativePath, source] of safe) {
    const findings = checkSource(relativePath, source);
    if (findings.length > 0) {
      throw new Error(`self-test went red on a safe shape: ${name}\n${findings.join('\n')}`);
    }
  }

  console.log(
    `safe user error door self-test: OK (${leaking.length} leak fixtures red, ${safe.length} safe shapes green)`,
  );
}

if (process.argv.includes('--self-test')) selfTest();

if (!process.argv.includes('--self-test-only')) {
  const findings = checkTree();
  if (findings.length) {
    console.error(
      `safe user error door: ${findings.length} user-facing route(s) return caught exception text\n` +
        findings.join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log('safe user error door: OK');
  }
}
