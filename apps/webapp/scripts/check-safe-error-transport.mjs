#!/usr/bin/env node
/**
 * S4 recurrence gate (owner plan `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`,
 * wave 03.09): a caught error's own text must never be transported into an API JSON response or
 * rendered by a React error boundary. That is exactly how `membershipErrorResponse`, the
 * `working-hours`/`calendar`/`working-days` routes and `global-error.tsx`/`SegmentRouteError.tsx`
 * put raw SQL text, table names and bound parameters in front of users before this pass. Without a
 * mechanical gate the fix degrades back one route at a time (AGENTS.md §10a, third rung).
 *
 * Parsed with the TypeScript AST, so formatting, quoting and line breaks are irrelevant.
 *
 * Rule 1 — API JSON (`apps/webapp/src/app/api/**`, production `.ts`).
 *   Analysis is per region, where a region is a `catch` block (seeded with its error binding) or the
 *   body of a function taking an `unknown` parameter — the shape of every shared `(err: unknown)`
 *   response helper. Inside a region, a name holds *error text* if its initializer reads `.message`
 *   off the error binding, or reads another name that already holds error text. Referencing error
 *   text inside the arguments of `NextResponse.json(...)` / `Response.json(...)` / `.json(...)` /
 *   `jsonError(...)` / `jsonOk(...)` is rejected.
 *
 *   The alias hop is the point: `const msg = err.message; …json({ detail: msg })` was the dominant
 *   leak shape in this repository, so a gate that only saw `err.message` written literally inside
 *   the call would have missed most of what S4 had to fix. Values merely *derived* from the error
 *   without its text (`const status = err instanceof X ? 404 : 400`) are not error text and stay
 *   free.
 *
 *   Two exemptions, both narrow:
 *   - an access narrowed by `x instanceof SomeDomainError` — a project error class, never a builtin
 *     `Error`/`TypeError`/…. Such a class authors its message from a closed set of literal codes
 *     (`InPersonBookingResolveError`, `SaasBillingTariffDowngradeBlockedError`), which is the same
 *     "known code stays distinct" guarantee `mapApiError` gives;
 *   - the shared door itself: `jsonError({ error, literalRules, fallback })` receives the raw error
 *     on purpose — that call is the sanctioned transport, not a bypass of it.
 *
 * Rule 2 — React error boundaries (production `.tsx`).
 *   A component whose props destructure both `error` and `reset` (the App Router boundary shape:
 *   `error.tsx`, `global-error.tsx`, `SegmentRouteError.tsx`) must not read `.message` off that
 *   binding anywhere in its body — not only inside JSX. The live leak was
 *   `const message = error.message || '…'` followed by `{message}`, so a JSX-only rule is not a
 *   gate. Passing the whole `error` to a classifier (`isChunkLoadFailure(error)`) stays allowed:
 *   that reads no message inside the boundary.
 *
 * Structured logging is untouched by both rules: `logger.error({ err })` reads no `.message`, and
 * `logger.error({ operatorErrorDetail: error })` is not a JSON-response call.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';

const appRoot = join(import.meta.dirname, '..');
const sourceRoot = join(appRoot, 'src');
const apiRoot = join(sourceRoot, 'app', 'api');

const RESPONSE_CALL_PROPERTY_NAMES = new Set(['json']);
const RESPONSE_CALL_IDENTIFIER_NAMES = new Set(['jsonError', 'jsonOk']);
const BUILTIN_ERROR_CLASS_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'EvalError',
  'URIError',
  'ReferenceError',
  'AggregateError',
]);

/**
 * Frozen legacy debt, not an exemption (AGENTS.md §10a, third rung: a form check is allowed only as
 * a temporary measure that keeps debt from growing, and only with its removal condition named).
 *
 * Every file below returns a caught error's own text, but that text is an *authored* refusal — the
 * Russian validation sentences `modules/treatment-program*`, `modules/courses`, `modules/comments`
 * throw, or a stable English code — which the doctor and patient screens display today. Collapsing
 * them to one generic code would delete real product feedback, so they are outside the S4 owner
 * scope (`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, wave 03.09, families:
 * `route.ts` with a direct `error.message`, server actions, `global-error.tsx`, both
 * `SegmentRouteError.tsx`). They still leak an unknown internal failure the same way, which is a
 * named finding for the owner, not a licence.
 *
 * Removal condition: a family leaves this list when its module throws a dedicated authored-error
 * class and the route narrows on it — the construction `InPersonBookingResolveError` and
 * `OperatorHealthProbeConfigInvalidError` already use, and the exemption this gate already honours.
 * The recorded count is the ceiling: a new site in a listed file fails the gate, and a file that
 * drops below its count (or reaches zero) must update this list in the same change.
 */
const FROZEN_LEGACY_ERROR_TEXT_SITES = new Map(Object.entries({
  'src/app/api/admin/auth-registration-events/route.ts': 1,
  'src/app/api/admin/doctor-analytics-appointments/route.ts': 1,
  'src/app/api/admin/platform-user-registration-stats/route.ts': 1,
  'src/app/api/admin/platform-user-subscriber-stats/route.ts': 1,
  'src/app/api/doctor/booking-engine/patient-packages/[id]/consume/route.ts': 1,
  'src/app/api/doctor/booking-engine/patient-packages/[id]/recalc/route.ts': 1,
  'src/app/api/doctor/clients/[userId]/lfk-complex-exercises/[exerciseRowId]/route.ts': 1,
  'src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts': 1,
  'src/app/api/doctor/clinical-tests/route.ts': 1,
  'src/app/api/doctor/comments/[id]/route.ts': 1,
  'src/app/api/doctor/comments/patients/route.ts': 1,
  'src/app/api/doctor/comments/route.ts': 2,
  'src/app/api/doctor/courses/[id]/route.ts': 1,
  'src/app/api/doctor/courses/route.ts': 1,
  'src/app/api/doctor/material-ratings/detail/route.ts': 1,
  'src/app/api/doctor/measure-kinds/route.ts': 2,
  'src/app/api/doctor/recommendations/[id]/route.ts': 1,
  'src/app/api/doctor/recommendations/route.ts': 2,
  'src/app/api/doctor/test-sets/[id]/items/route.ts': 1,
  'src/app/api/doctor/test-sets/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/discussion/messages/[messageId]/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/editor-batch/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/hide/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/route.ts': 2,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stage-items/[itemId]/route.ts': 2,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/groups/reorder/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/groups/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-freeform-recommendation/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-lfk-complex/route.ts': 2,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-test-set/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/reorder/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/route.ts': 2,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/reorder/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/stages/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/test-attempts/[attemptId]/accept/route.ts': 1,
  'src/app/api/doctor/treatment-program-instances/[instanceId]/test-results/[resultId]/route.ts': 1,
  'src/app/api/doctor/treatment-program-promo/refresh/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/[id]/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/[id]/stages/reorder/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/[id]/stages/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/stage-groups/[groupId]/route.ts': 3,
  'src/app/api/doctor/treatment-program-templates/stage-items/[itemId]/route.ts': 3,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/groups/reorder/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/groups/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/from-lfk-complex/route.ts': 3,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/from-test-set/route.ts': 2,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/reorder/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/items/route.ts': 1,
  'src/app/api/doctor/treatment-program-templates/stages/[stageId]/route.ts': 3,
  'src/app/api/integrator/patient-notifications/web-push/route.ts': 1,
  'src/app/api/patient/courses/[courseId]/enroll/route.ts': 1,
  'src/app/api/patient/reminders/create/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/checklist-today/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/media/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/discussion/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/mark-viewed/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/checklist/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/complete/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/observation-note/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/start-new-test-attempt/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/test-attempt/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/test-result/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/touch/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/passage-stats/route.ts': 1,
  'src/app/api/patient/treatment-program-instances/[instanceId]/plan-opened/route.ts': 1,
  'src/app/api/patient/treatment-program-promo/action/route.ts': 3,
}));

function listProductionSource(dir, extension) {
  return readdirSync(dir).flatMap((name) => {
    const absolute = join(dir, name);
    if (statSync(absolute).isDirectory()) return listProductionSource(absolute, extension);
    return name.endsWith(extension) && !name.includes('.test.') && !name.endsWith('.d.ts')
      ? [absolute]
      : [];
  });
}

function parse(filename, source, scriptKind) {
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function forEachDescendant(node, visit) {
  ts.forEachChild(node, (child) => {
    visit(child);
    forEachDescendant(child, visit);
  });
}

/**
 * Visits only the sub-nodes that are *values*. Property keys (`{ error: 'x' }`), member names
 * (`a.message`) and binding property names are identifiers too, and treating them as references is
 * what makes a naive walk flag every object with an `error` field.
 */
function forEachValueNode(node, visit) {
  const walk = (current) => {
    if (visit(current) === false) return;
    if (ts.isPropertyAssignment(current)) {
      if (ts.isComputedPropertyName(current.name)) walk(current.name.expression);
      walk(current.initializer);
      return;
    }
    if (ts.isPropertyAccessExpression(current)) {
      walk(current.expression);
      return;
    }
    if (ts.isBindingElement(current)) {
      if (current.initializer) walk(current.initializer);
      return;
    }
    ts.forEachChild(current, walk);
  };
  ts.forEachChild(node, walk);
}

function readsErrorText(node, errorNames, textNames) {
  let found = false;
  const check = (candidate) => {
    if (found) return false;
    if (
      ts.isPropertyAccessExpression(candidate) &&
      candidate.name.text === 'message' &&
      ts.isIdentifier(candidate.expression) &&
      errorNames.has(candidate.expression.text)
    ) {
      found = true;
      return false;
    }
    if (ts.isIdentifier(candidate) && textNames.has(candidate.text)) {
      found = true;
      return false;
    }
    return undefined;
  };
  if (check(node) === false) return found;
  forEachValueNode(node, check);
  return found;
}

/** `<errorBinding> instanceof SomeProjectErrorClass` anywhere inside `node`. */
function narrowsToProjectErrorClass(node, errorNames) {
  let found = false;
  const visit = (candidate) => {
    if (found) return;
    if (
      ts.isBinaryExpression(candidate) &&
      candidate.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
      ts.isIdentifier(candidate.left) &&
      errorNames.has(candidate.left.text) &&
      ts.isIdentifier(candidate.right) &&
      !BUILTIN_ERROR_CLASS_NAMES.has(candidate.right.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

/** Walks up to the region root looking for a guard that narrowed the error to a project class. */
function guardedByProjectErrorClass(node, region, errorNames) {
  for (let current = node.parent; current && current !== region; current = current.parent) {
    if (ts.isIfStatement(current) && narrowsToProjectErrorClass(current.expression, errorNames))
      return true;
    if (
      ts.isConditionalExpression(current) &&
      narrowsToProjectErrorClass(current.condition, errorNames)
    ) {
      return true;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      narrowsToProjectErrorClass(current.left, errorNames)
    ) {
      return true;
    }
  }
  return false;
}

function isResponseJsonCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee))
    return RESPONSE_CALL_PROPERTY_NAMES.has(callee.name.text);
  if (ts.isIdentifier(callee)) return RESPONSE_CALL_IDENTIFIER_NAMES.has(callee.text);
  return false;
}

/** `jsonError({ error, literalRules, fallback })` — the shared door receiving the raw failure. */
function isSharedDoorCall(node) {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'jsonError') return false;
  const [first] = node.arguments;
  return (
    first !== undefined &&
    ts.isObjectLiteralExpression(first) &&
    first.properties.some(
      (property) =>
        property.name !== undefined &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'fallback',
    )
  );
}

/** Names inside one region that hold the caught error's text, to a fixed point. */
function collectErrorTextNames(region, errorNames) {
  const textNames = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    forEachDescendant(region, (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        !textNames.has(node.name.text) &&
        readsErrorText(node.initializer, errorNames, textNames)
      ) {
        textNames.add(node.name.text);
        grew = true;
      }
    });
  }
  return textNames;
}

function regionFindings(sourceFile, region, errorNames) {
  const textNames = collectErrorTextNames(region, errorNames);
  const findings = [];
  const inspectCall = (call) => {
    if (isSharedDoorCall(call)) return;
    for (const argument of call.arguments) {
      const check = (candidate) => {
        const isErrorMessageRead =
          ts.isPropertyAccessExpression(candidate) &&
          candidate.name.text === 'message' &&
          ts.isIdentifier(candidate.expression) &&
          errorNames.has(candidate.expression.text);
        const isErrorTextAlias = ts.isIdentifier(candidate) && textNames.has(candidate.text);
        if (!isErrorMessageRead && !isErrorTextAlias) return undefined;
        if (guardedByProjectErrorClass(candidate, region, errorNames)) return false;
        findings.push({ line: lineOf(sourceFile, candidate), kind: 'api-json-error-text' });
        return false;
      };
      if (check(argument) === false) continue;
      forEachValueNode(argument, check);
    }
  };
  forEachDescendant(region, (node) => {
    if (isResponseJsonCall(node)) inspectCall(node);
  });
  return findings;
}

function apiJsonFindings(filename, source) {
  const sourceFile = parse(filename, source, ts.ScriptKind.TS);
  const findings = [];
  forEachDescendant(sourceFile, (node) => {
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      const name = node.variableDeclaration.name;
      if (ts.isIdentifier(name)) {
        findings.push(...regionFindings(sourceFile, node.block, new Set([name.text])));
      }
      return;
    }
    const isFunctionLike =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node);
    if (!isFunctionLike || !node.body) return;
    const unknownParameters = node.parameters
      .filter(
        (parameter) =>
          ts.isIdentifier(parameter.name) && parameter.type?.kind === ts.SyntaxKind.UnknownKeyword,
      )
      .map((parameter) => parameter.name.text);
    if (unknownParameters.length === 0) return;
    findings.push(...regionFindings(sourceFile, node.body, new Set(unknownParameters)));
  });
  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.line}:${finding.kind}`, finding);
  return [...unique.values()];
}

/** Binding a `{ error, reset }`-shaped single parameter gives to the `error` field, if any. */
function errorBoundaryBindingName(fn) {
  if (fn.parameters.length !== 1) return null;
  const [parameter] = fn.parameters;
  if (!ts.isObjectBindingPattern(parameter.name)) return null;
  let errorBinding = null;
  let hasReset = false;
  for (const element of parameter.name.elements) {
    if (!ts.isIdentifier(element.name)) continue;
    const field =
      element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text;
    if (field === 'error') errorBinding = element.name.text;
    if (field === 'reset') hasReset = true;
  }
  return hasReset && errorBinding ? errorBinding : null;
}

function reactBoundaryFindings(filename, source) {
  const sourceFile = parse(filename, source, ts.ScriptKind.TSX);
  const findings = [];
  forEachDescendant(sourceFile, (node) => {
    const isFunctionLike =
      ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
    if (!isFunctionLike || !node.body) return;
    const binding = errorBoundaryBindingName(node);
    if (!binding) return;
    forEachDescendant(node.body, (candidate) => {
      if (
        ts.isPropertyAccessExpression(candidate) &&
        candidate.name.text === 'message' &&
        ts.isIdentifier(candidate.expression) &&
        candidate.expression.text === binding
      ) {
        findings.push({ line: lineOf(sourceFile, candidate), kind: 'react-boundary-error-text' });
      }
    });
  });
  return findings;
}

function productionFindings() {
  return [
    ...listProductionSource(apiRoot, '.ts').flatMap((filename) =>
      apiJsonFindings(filename, readFileSync(filename, 'utf8')).map((finding) => ({
        filename,
        ...finding,
      })),
    ),
    ...listProductionSource(sourceRoot, '.tsx').flatMap((filename) =>
      reactBoundaryFindings(filename, readFileSync(filename, 'utf8')).map((finding) => ({
        filename,
        ...finding,
      })),
    ),
  ].sort((left, right) => left.filename.localeCompare(right.filename) || left.line - right.line);
}

function selfTest() {
  const routeFile = join(apiRoot, 'fixture', 'route.ts');
  const rejectedApi = [
    [
      'raw message inline',
      'try { a(); } catch (error) { NextResponse.json({ ok: false, error: error.message }); }',
    ],
    [
      'one-hop alias',
      "try { a(); } catch (err) { const msg = err.message; NextResponse.json({ error: 'x', detail: msg }); }",
    ],
    [
      'two-hop alias',
      "try { a(); } catch (err) { const raw = err.message; const msg = raw ?? 'x'; NextResponse.json({ detail: msg }); }",
    ],
    [
      'conditional spread',
      'try { a(); } catch (error) { NextResponse.json({ ...(dev ? { detail: error.message } : {}) }); }',
    ],
    [
      'builtin Error guard does not exempt',
      'try { a(); } catch (error) { if (error instanceof Error) NextResponse.json({ ok: false, error: error.message }); }',
    ],
    [
      'unknown-typed helper parameter',
      'export function respond(err: unknown) { return NextResponse.json({ ok: false, error: err.message }); }',
    ],
    [
      'alias echoed after a literal comparison',
      "try { a(); } catch (e) { const m = e instanceof Error ? e.message : ''; if (m === 'known') return NextResponse.json({ ok: false, error: m }); }",
    ],
    ['jsonError code argument', 'try { a(); } catch (error) { jsonError(error.message, {}); }'],
    ['jsonOk payload', 'try { a(); } catch (error) { jsonOk({ warning: error.message }); }'],
    [
      'shorthand property',
      'try { a(); } catch (error) { const message = error.message; NextResponse.json({ message }); }',
    ],
  ];
  const acceptedApi = [
    [
      'project error class narrows the message',
      'try { a(); } catch (error) { if (error instanceof BookingResolveError) NextResponse.json({ ok: false, error: error.message }); }',
    ],
    [
      'shared door carries the failure',
      "try { a(); } catch (error) { return jsonError({ error, literalRules: RULES, fallback: { code: 'failed', status: 500 } }); }",
    ],
    [
      'comparison outside the response call',
      "try { a(); } catch (error) { if (error instanceof Error && error.message === 'known') return NextResponse.json({ ok: false, error: 'known' }); }",
    ],
    [
      'operator logging keeps full detail',
      "try { a(); } catch (error) { logger.error({ operatorErrorDetail: error }, 'failed'); }",
    ],
    ['unrelated message field', 'NextResponse.json({ message: template.message });'],
    [
      'status derived from the error without its text',
      "try { a(); } catch (error) { const status = error instanceof Conflict ? 409 : 500; return NextResponse.json({ ok: false, error: 'failed' }, { status }); }",
    ],
    [
      'error field name in an unrelated response',
      "try { a(); } catch (error) { return NextResponse.json({ ok: false, error: 'failed' }); }",
    ],
  ];

  const boundaryFile = join(sourceRoot, 'shared', 'ui', 'fixture', 'FixtureError.tsx');
  const rejectedUi = [
    ['renders message directly', 'function E({ error, reset }) { return <p>{error.message}</p>; }'],
    [
      'aliased through a local before render',
      "function E({ error, reset }) { const message = error.message || 'safe'; return <p>{message}</p>; }",
    ],
    [
      'renamed binding still tracked',
      'function E({ error: failure, reset }) { const m = failure.message; return <p>{m}</p>; }',
    ],
  ];
  const acceptedUi = [
    ['digest only', 'function E({ error, reset }) { return <p>{error.digest}</p>; }'],
    [
      'classifier receives the whole error',
      'function E({ error, reset }) { const chunk = isChunkLoadFailure(error); return <p>{chunk ? "a" : "b"}</p>; }',
    ],
    ['not a boundary shape', 'function E({ error }) { return <p>{error.message}</p>; }'],
  ];

  const failures = [
    ...rejectedApi
      .filter(([, source]) => apiJsonFindings(routeFile, source).length === 0)
      .map(([name]) => `missed-api:${name}`),
    ...acceptedApi
      .filter(([, source]) => apiJsonFindings(routeFile, source).length > 0)
      .map(([name]) => `false-positive-api:${name}`),
    ...rejectedUi
      .filter(([, source]) => reactBoundaryFindings(boundaryFile, source).length === 0)
      .map(([name]) => `missed-ui:${name}`),
    ...acceptedUi
      .filter(([, source]) => reactBoundaryFindings(boundaryFile, source).length > 0)
      .map(([name]) => `false-positive-ui:${name}`),
  ];
  if (failures.length > 0) {
    throw new Error(`check-safe-error-transport self-test failed: ${failures.join(', ')}`);
  }
  console.log(
    `check-safe-error-transport self-test: OK (${rejectedApi.length + rejectedUi.length} bypass forms rejected, ${acceptedApi.length + acceptedUi.length} canonical forms accepted)`,
  );
}

function report() {
  const findings = productionFindings();
  const perFile = new Map();
  const fresh = [];
  for (const finding of findings) {
    const path = relative(appRoot, finding.filename).replaceAll('\\', '/');
    if (!FROZEN_LEGACY_ERROR_TEXT_SITES.has(path)) {
      fresh.push(`  - ${path}:${finding.line} ${finding.kind}`);
      continue;
    }
    perFile.set(path, (perFile.get(path) ?? 0) + 1);
  }
  const drifted = [];
  for (const [path, frozen] of FROZEN_LEGACY_ERROR_TEXT_SITES) {
    const actual = perFile.get(path) ?? 0;
    if (actual > frozen) {
      drifted.push(`  - ${path}: ${actual} sites, frozen at ${frozen} — new debt in a frozen file`);
    } else if (actual < frozen) {
      drifted.push(
        `  - ${path}: ${actual} sites, frozen at ${frozen} — lower the number (or drop the entry) in the same change`,
      );
    }
  }
  if (fresh.length === 0 && drifted.length === 0) {
    console.log(
      `check-safe-error-transport: OK (${FROZEN_LEGACY_ERROR_TEXT_SITES.size} files of frozen legacy debt unchanged)`,
    );
    return;
  }
  if (fresh.length > 0) {
    console.error('check-safe-error-transport: caught-error text reaches a user surface.');
    console.error(fresh.join('\n'));
  }
  if (drifted.length > 0) {
    console.error('check-safe-error-transport: frozen legacy debt moved.');
    console.error(drifted.join('\n'));
  }
  process.exitCode = 1;
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  report();
}
