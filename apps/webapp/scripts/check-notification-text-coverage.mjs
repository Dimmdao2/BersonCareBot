#!/usr/bin/env node
/**
 * Structural gate for the notification-text consolidation
 * (`docs/_TODO/NOTIFICATION_TEXT_CONSOLIDATION_2026-09-13.md`): every user-facing error/notification
 * shown through a known code — `new UserFacingError('...')`, `toast.error('...')`,
 * `toast.success('...')` — must read its text from the single dictionary
 * `@/shared/notifications/notificationText.ts` instead of carrying a string literal inline.
 *
 * Why a gate and not a review rule: the whole point of this consolidation is that the SAME
 * meaning never gets a second, independently-edited copy of its text (the owner's example:
 * "invalid credentials" shown from two places under two different names). A reviewer can miss one
 * more `toast.error('Не удалось сохранить')` slipping back in; a structural scan cannot.
 *
 * What is a violation: a `new UserFacingError(...)` or `toast.error(...)`/`toast.success(...)`
 * call whose first argument CONTAINS a plain string literal or a no-substitution template literal
 * (`` `text` `` with no `${...}`) in a user-visible position — i.e. a string the author typed at
 * the call site instead of referencing the dictionary. This is not limited to the literal sitting
 * directly as the argument: it also catches one reached through `??` (`data.message ?? 'text'`),
 * a ternary (`cond ? 'a' : 'b'`, `err ? err.message : 'text'`), or any nesting of those
 * (parenthesised, chained `?? (cond ? 'a' : 'b')`, etc.) — every branch of the expression that
 * COULD end up shown to the user is walked, and a literal found on ANY such branch is a finding.
 * (2026-09 verification pass: the original version only inspected the argument itself, so
 * `toast.error(data.message ?? 'Провайдер недоступен')` passed clean while showing an
 * un-dictionaried string whenever the server didn't supply its own `message` — this is what the
 * expression walk below closes.)
 *
 * ALSO a violation (DEFECT 3, 2026-09-13 second verification pass): the same literal one level
 * deeper, as the fallback-TEXT argument of a helper this codebase's dominant call shape routes the
 * text through first — `toast.error(readSafeApiErrorText(data, 'Не удалось сохранить'))` — rather
 * than as `toast.error`'s own argument. `FALLBACK_TEXT_HELPER_ARG_INDEX` below names each such
 * helper (`readSafeApiErrorText`, `safeActionErrorText`, `mechanicWriteClearanceRefusalResponse`)
 * and which argument carries the fallback text. Because the AST walk (`visit()`) inspects every
 * node in the file, not only nodes reached through a `toast`/`UserFacingError` argument, a call to
 * one of these helpers is caught wherever it appears — nested inside `toast.error(...)`, or
 * standalone inside `setError(...)`, `throw new Error(...)`, a returned object field, etc. — no
 * matter how many other calls it is nested inside.
 *
 * What is not a violation:
 *  - a reference to the dictionary (`notificationText.someKey`, `notificationTextFactory.fn(...)`),
 *    on its own or as a branch of `??`/a ternary/a fallback-helper argument;
 *  - a template literal WITH interpolation (`` `${label}: ...` ``) — parameterized text belongs in
 *    `notificationTextFactory` by convention, but the AST can't force that split, so this gate only
 *    catches the fully-static literal case it can act on mechanically;
 *  - a branch that is some OTHER dynamic expression with no literal in it (a caught exception's
 *    bare `.message`, a variable, a function call) — those are either already governed by the
 *    separate safe-user-error-text door or are a deliberate pass-through of a runtime value;
 *  - a literal argument to a helper NOT in `FALLBACK_TEXT_HELPER_ARG_INDEX` that is a machine code
 *    or action name rather than user-visible text — e.g. `staffSecurityErrorText(error,
 *    'email_password_login')` selects an internal `switch`, it does not carry a sentence;
 *  - the dictionary file itself and test files (not part of the shown-text surface).
 *
 * TWO MORE RULES ADDED IN THE 2026-09-13 GATING PASS (independent safety audit, verdict FAIL):
 *  - G3: a raw `.error` property (our own API routes' machine-code field, see
 *    `shared/http/apiErrorCode.ts`) reachable in a `toast.error`/`toast.success` argument through
 *    the same `??`/ternary/parens branches as the literal check — a bare code like `invalid_body`
 *    must never render as the entire toast. Route it through `readSafeApiErrorText` (server
 *    `message` field) or `readSafeActionErrorText` (client-local action-result `error` field) —
 *    calls to either are exempt, same as any other dynamic expression on a branch.
 *  - G4: an inline `message: '...'` literal inside `NextResponse.json`/`Response.json`/`jsonError`
 *    — the shape that let a route's own copy diverge from the dictionary for the SAME code.
 *    Grandfathered by file for a large pre-existing surface this pass did not migrate (see
 *    `RESPONSE_MESSAGE_LITERAL_GRANDFATHER_FILES`'s own doc comment for the honest count and why);
 *    a literal in any file NOT on that list is a gate failure.
 *
 *    HONEST LIMITS of that rule, so the next reader does not stop looking (re-audit NEW-4, 13.09 —
 *    the previous wording claimed the class "cannot reappear silently anywhere else", which was not
 *    true and hid three live leaks):
 *      1. Only the response builders named in `RESPONSE_BUILDER_BODY_ARG_INDEX` are inspected. A
 *         route answering through some other wrapper is invisible to this rule; add the wrapper to
 *         that map when one appears.
 *      2. Grandfathering is per FILE, not per literal, so a listed file is also exempt for NEW
 *         literals. The list may only shrink — treat any addition to it as a finding, not a fix.
 *      3. Indirection is resolved exactly ONE level, and only within the same file: a module-level
 *         `const X = '…'` referenced at a shown-text call site or in a `message:` property is
 *         followed (final-audit MAJOR, 13.09 — before that a hoisted const was a silent exemption,
 *         live in `AuthFlowV2.tsx` and `specialist-signup/confirm/route.ts`). A const IMPORTED from
 *         another module, a const holding a const, or text assembled at runtime is still invisible
 *         to this gate. Do not read a green run as "no hand-typed copy anywhere".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(appRoot, 'src');
const dictionaryFile = join(sourceRoot, 'shared', 'notifications', 'notificationText.ts');

function isSourceFile(name) {
  return (
    (name.endsWith('.ts') || name.endsWith('.tsx')) &&
    !name.endsWith('.d.ts') &&
    !/\.(test|spec)\.tsx?$/.test(name)
  );
}

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (isSourceFile(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Helpers whose call sites carry a plain user-visible fallback TEXT as one argument, the same way
 * `readSafeApiErrorText(body, fallback)` does — not a machine code/action name (those select an
 * internal switch and are exempt, e.g. `staffSecurityErrorText(error, 'email_password_login')`),
 * but the literal sentence itself. Keyed by the bare identifier the helper is imported/called as;
 * value is the zero-based index of its fallback-text argument.
 */
const FALLBACK_TEXT_HELPER_ARG_INDEX = new Map([
  // `@/shared/http/apiErrorCode` — `readSafeApiErrorText(body, fallback)`.
  ['readSafeApiErrorText', 1],
  // `@/shared/http/apiErrorCode` — `readSafeActionErrorText(result, fallback)` (G3, 2026-09-13
  // gating pass: same shape as `readSafeApiErrorText`, but for a client-LOCAL action-result
  // `{ error?: string }` instead of a parsed API response `{ message?: string }`).
  ['readSafeActionErrorText', 1],
  // `@/app-layer/errors/safeUserError` — `safeActionErrorText(scope, error, fallbackText)`.
  ['safeActionErrorText', 2],
  // `@/app-layer/guards/requireEntitlement` — `mechanicWriteClearanceRefusalResponse(error, message)`.
  ['mechanicWriteClearanceRefusalResponse', 1],
]);

/** Does `node` look like `new UserFacingError(...)`, `toast.error/success(...)`, or a call to one
 * of `FALLBACK_TEXT_HELPER_ARG_INDEX`'s helpers? Returns the argument expression that ends up
 * shown to the user, or undefined if `node` isn't one of these calls.
 *
 * The helper-fallback shape (DEFECT 3, 2026-09-13 second verification pass) is why this is its own
 * function rather than only looking at `toast.error`/`UserFacingError`'s own argument: the
 * dominant call shape in this codebase routes the fallback through a helper FIRST —
 * `toast.error(readSafeApiErrorText(data, 'Не удалось сохранить'))` — so the literal is one level
 * too deep for the argument-only check to see. Because `visit()` below walks every node in the
 * tree (not only nodes reached through a `toast`/`UserFacingError` argument), a helper call is
 * caught here wherever it appears — nested inside `toast.error(...)`, or standalone inside
 * `setError(...)`, `throw new Error(...)`, a returned object field, etc. — regardless of how many
 * other calls it is nested inside. */
function textArgumentOf(node) {
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'UserFacingError' &&
    node.arguments &&
    node.arguments.length >= 1
  ) {
    return node.arguments[0];
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'toast' &&
    (node.expression.name.text === 'error' || node.expression.name.text === 'success') &&
    node.arguments.length >= 1
  ) {
    return node.arguments[0];
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    FALLBACK_TEXT_HELPER_ARG_INDEX.has(node.expression.text)
  ) {
    const index = FALLBACK_TEXT_HELPER_ARG_INDEX.get(node.expression.text);
    if (node.arguments.length > index) return node.arguments[index];
  }
  return undefined;
}

const EMPTY_CONSTS = new Map();

/**
 * Module-level `const NAME = '<literal>'` declarations of the file being checked, by name. Only
 * the top level of the file is read: a const declared inside a function is scoped to it and cannot
 * be the shared-copy shape this gate is about.
 */
function moduleConstStringLiterals(sf) {
  const consts = new Map();
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const init = declaration.initializer;
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
        consts.set(declaration.name.text, init);
      }
    }
  }
  return consts;
}

/**
 * Walks an argument expression through the shapes that can carry a runtime value to the USER
 * while a plain string literal rides along one of the branches — `??` fallbacks, ternaries, and
 * parenthesised nesting of those — and collects every string-literal / no-substitution
 * template-literal leaf found. A leaf reached only through some OTHER dynamic expression (a bare
 * identifier, a property access, a call) is not a literal and contributes nothing; walking simply
 * does not go past it (there is nothing further to inspect on that branch).
 */
function collectLiteralLeaves(expr, out = [], consts = EMPTY_CONSTS) {
  if (ts.isParenthesizedExpression(expr)) {
    collectLiteralLeaves(expr.expression, out, consts);
    return out;
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    out.push(expr);
    return out;
  }
  // Final-audit MAJOR (13.09): a bare identifier used to end the walk, so hoisting the literal into
  // a module-level `const X = '…'` (`AUTH_NETWORK_ERROR_MESSAGE` in AuthFlowV2.tsx — 9 call sites,
  // green under the old rule) silently bought an exemption. One level of same-file const
  // resolution closes that; anything further (an imported const, a value built at runtime) is
  // still invisible and is declared as limit 3 in this file's header.
  if (ts.isIdentifier(expr) && consts.has(expr.text)) {
    out.push(consts.get(expr.text));
    return out;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    collectLiteralLeaves(expr.left, out, consts);
    collectLiteralLeaves(expr.right, out, consts);
    return out;
  }
  if (ts.isConditionalExpression(expr)) {
    collectLiteralLeaves(expr.whenTrue, out, consts);
    collectLiteralLeaves(expr.whenFalse, out, consts);
    return out;
  }
  // Any other expression shape (identifier, property access, call, `||`, `+`, template with
  // interpolation, …) is dynamic or out of the walked shape set — nothing to collect past it.
  return out;
}

/**
 * G3 (safety audit, 2026-09-13 gating pass): does `node` look like `toast.error(...)` or
 * `toast.success(...)`? Deliberately narrower than `textArgumentOf` above — this rule is about a
 * DIFFERENT failure mode (a raw, un-vetted `.error` property reaching the user, not a hand-typed
 * literal), and the report that named it scoped it to "reaching a toast argument" specifically.
 * `new UserFacingError(...)` is intentionally excluded: `instanceEditorBatchApply.ts`'s
 * `throw new UserFacingError(duration.error)` is a documented, deliberate exception (an
 * already-computed string from a foreign validator, not a machine code) from an earlier round.
 */
function toastArgumentOf(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'toast' &&
    (node.expression.name.text === 'error' || node.expression.name.text === 'success') &&
    node.arguments.length >= 1
  ) {
    return node.arguments[0];
  }
  return undefined;
}

/**
 * Walks the same branch shapes as `collectLiteralLeaves` (`??`, ternary, parens) looking for a
 * RAW property-access leaf named `error` (`data.error`, `data?.error`, …) — the shape behind the
 * five sites the safety audit found (`toast.error(data.error ?? notificationText.xxx)`): our own
 * API routes' `error` field is a machine code by contract (`shared/http/apiErrorCode.ts`), never
 * product copy, so it must never be READ directly at a shown-text call site. A leaf that is
 * instead a CALL — `readSafeApiErrorText(data, fallback)`, `readSafeActionErrorText(result,
 * fallback)`, `staffSecurityErrorText(data.error, action)`, any other helper — is dynamic as far
 * as this walk is concerned (same rule as `collectLiteralLeaves`: only ??/ternary/parens are
 * followed) and is NOT a violation; that is how a codebase-local action-result convention where
 * `.error` is already-safe display text (verified case by case in the 2026-09-13 gating pass,
 * e.g. `saveDraft()`'s `{ error }`) stays clean by routing through `readSafeActionErrorText`
 * instead of being read bare.
 */
function collectRawErrorCodeLeaves(expr, out = []) {
  if (ts.isParenthesizedExpression(expr)) {
    collectRawErrorCodeLeaves(expr.expression, out);
    return out;
  }
  if (
    (ts.isPropertyAccessExpression(expr) || ts.isPropertyAccessChain(expr)) &&
    expr.name.text === 'error'
  ) {
    out.push(expr);
    return out;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    collectRawErrorCodeLeaves(expr.left, out);
    collectRawErrorCodeLeaves(expr.right, out);
    return out;
  }
  if (ts.isConditionalExpression(expr)) {
    collectRawErrorCodeLeaves(expr.whenTrue, out);
    collectRawErrorCodeLeaves(expr.whenFalse, out);
    return out;
  }
  return out;
}

/**
 * G4 (safety audit, 2026-09-13 gating pass): does `node` look like `NextResponse.json(...)` or
 * `Response.json(...)`? Returns its `message` property's initializer if the first argument is an
 * object literal with a plain-string (or no-substitution template) `message: '...'` — the shape
 * that let a route's own inline copy diverge from the dictionary for the SAME code (the owner's
 * worked example: two places, two different wordings, for "invalid credentials"). A `message`
 * whose value is a variable, a call (including `notificationText.someKey`), or a template WITH
 * interpolation is dynamic/already-safe and not returned.
 */
/**
 * Re-audit finding (NEW-4, 13.09): this rule used to match ONLY `NextResponse.json`/`Response.json`
 * while the header claimed the divergent-copy class "cannot reappear silently anywhere else". That
 * was false — every route answering through the `jsonError(code, body, init)` wrapper was invisible,
 * and three live leaks sat in exactly that blind spot: the reverse-proxy/`X-Real-IP` sentence shown
 * on the PUBLIC booking route and on the OAuth login screen. `jsonError` carries the body in its
 * SECOND argument, hence the per-builder index rather than a fixed `arguments[0]`.
 */
const RESPONSE_BUILDER_BODY_ARG_INDEX = new Map([
  ['NextResponse.json', 0],
  ['Response.json', 0],
  ['jsonError', 1],
]);

function responseBuilderBodyArg(node) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return undefined;
  let name;
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    ts.isIdentifier(node.expression.name)
  ) {
    name = `${node.expression.expression.text}.${node.expression.name.text}`;
  } else if (ts.isIdentifier(node.expression)) {
    name = node.expression.text;
  }
  const index = name === undefined ? undefined : RESPONSE_BUILDER_BODY_ARG_INDEX.get(name);
  if (index === undefined) return undefined;
  return node.arguments[index];
}

function responseJsonMessageLiteralOf(node, consts = EMPTY_CONSTS) {
  let arg = responseBuilderBodyArg(node);
  if (arg === undefined) return undefined;
  if (ts.isParenthesizedExpression(arg)) arg = arg.expression;
  if (!ts.isObjectLiteralExpression(arg)) return undefined;
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    if (prop.name.text !== 'message') continue;
    const value = prop.initializer;
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value;
    // Same final-audit MAJOR as in `collectLiteralLeaves`: the live example was
    // `message: ORGANIZATION_SLUG_REQUIRED_MESSAGE` in specialist-signup/confirm/route.ts.
    if (ts.isIdentifier(value) && consts.has(value.text)) return consts.get(value.text);
  }
  return undefined;
}


/**
 * G5 (владелец, 13.09 — «ни в коем случае врач не должен видеть сырой машинный код»).
 *
 * Класс, который все прошлые правила пропускали: функция-ПОДПИСЬ. Она существует ровно затем,
 * чтобы превратить машинное значение (`awaiting_payment`, `not_found`, `playback_disabled`) в
 * фразу для человека, — и заканчивается строкой `return status`, то есть отдаёт наружу тот самый
 * код, от которого должна была защитить. На момент введения правила таких функций было 10, и
 * одна из них (`panelErrorLabel` в панели календаря) знала 5 кодов из 23, которые реально шлют
 * маршруты записи: 18 кодов врач видел сырыми.
 *
 * Опознание — по трём признакам сразу, чтобы не ловить форматтеры (`return iso`, если дата не
 * разобралась) и склейки готовых подписей:
 *   1. возвращаемый тип функции — ровно `string`;
 *   2. параметр `p` где-то сравнивается со СТРОКОВЫМ ЛИТЕРАЛОМ (`p === 'ready'` или `switch (p)`
 *      с case-литералами) — это и делает функцию словарём кодов;
 *   3. среди её возвратов есть строковый литерал со СЛОВОМ (две буквы подряд) — то есть она
 *      действительно возвращает подписи, а не числа, прочерки или url;
 * и при этом есть `return p`. Дефолт обязан быть фразой (`notificationText.commonUnknownStatus`
 * и подобные), а не входным значением.
 */
function codeLabelLeakReturns(fn, sf) {
  if (!fn.body || !fn.type || fn.type.kind !== ts.SyntaxKind.StringKeyword) return [];
  const params = new Set(
    fn.parameters.filter((p) => ts.isIdentifier(p.name)).map((p) => p.name.text),
  );
  if (params.size === 0) return [];
  const comparedToLiteral = new Set();
  const returnsParam = [];
  let returnsWordLiteral = false;
  const walk = (n) => {
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)
    ) {
      if (ts.isIdentifier(n.left) && params.has(n.left.text) && ts.isStringLiteral(n.right)) {
        comparedToLiteral.add(n.left.text);
      }
      if (ts.isIdentifier(n.right) && params.has(n.right.text) && ts.isStringLiteral(n.left)) {
        comparedToLiteral.add(n.right.text);
      }
    }
    if (
      ts.isSwitchStatement(n) &&
      ts.isIdentifier(n.expression) &&
      params.has(n.expression.text) &&
      n.caseBlock.clauses.some((c) => ts.isCaseClause(c) && ts.isStringLiteral(c.expression))
    ) {
      comparedToLiteral.add(n.expression.text);
    }
    if (ts.isReturnStatement(n) && n.expression) {
      if (ts.isIdentifier(n.expression) && params.has(n.expression.text)) returnsParam.push(n);
      if (
        (ts.isStringLiteral(n.expression) || ts.isNoSubstitutionTemplateLiteral(n.expression)) &&
        /\p{L}{2}/u.test(n.expression.text)
      ) {
        returnsWordLiteral = true;
      }
    }
    // Вложенная функция — отдельная единица разбора, её возвраты не принадлежат этой.
    if (
      n === fn ||
      (!ts.isFunctionDeclaration(n) && !ts.isArrowFunction(n) && !ts.isFunctionExpression(n))
    ) {
      ts.forEachChild(n, walk);
    }
  };
  ts.forEachChild(fn.body, walk);
  if (!returnsWordLiteral) return [];
  return returnsParam.filter((r) => comparedToLiteral.has(r.expression.text));
}

function checkSource(relativePath, text) {
  const findings = [];
  const sf = ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const consts = moduleConstStringLiterals(sf);

  const visit = (node) => {
    const argument = textArgumentOf(node);
    if (argument) {
      for (const literal of collectLiteralLeaves(argument, [], consts)) {
        const { line } = sf.getLineAndCharacterOfPosition(literal.getStart(sf));
        findings.push(
          `${relativePath}:${line + 1}: string literal reachable in a shown-text argument — add it ` +
            `to notificationText.ts and reference the key instead (${JSON.stringify(literal.text).slice(0, 60)})`,
        );
      }
    }

    // G3 (safety audit, 2026-09-13 gating pass): a raw `.error` reaching a toast argument.
    const toastArgument = toastArgumentOf(node);
    if (toastArgument) {
      for (const leaf of collectRawErrorCodeLeaves(toastArgument)) {
        const { line } = sf.getLineAndCharacterOfPosition(leaf.getStart(sf));
        findings.push(
          `${relativePath}:${line + 1}: raw ".error" property reachable in a toast argument — our ` +
            `own API routes' "error" is a machine code by contract (shared/http/apiErrorCode.ts), ` +
            `never product copy. Route it through readSafeApiErrorText/readSafeActionErrorText or a ` +
            `notificationText reference instead (${JSON.stringify(leaf.getText(sf)).slice(0, 60)})`,
        );
      }
    }

    // G4 (safety audit, 2026-09-13 gating pass): an inline `message: '...'` literal inside a
    // NextResponse.json/Response.json body — grandfathered for pre-existing files, see
    // RESPONSE_MESSAGE_LITERAL_GRANDFATHER_FILES's doc comment.
    const messageLiteral = responseJsonMessageLiteralOf(node, consts);
    if (messageLiteral) {
      const { line } = sf.getLineAndCharacterOfPosition(messageLiteral.getStart(sf));
      findings.push(
        `${relativePath}:${line + 1}: string literal in a NextResponse.json/Response.json ` +
          `"message" property — add it to notificationText.ts and reference the key instead ` +
          `(${JSON.stringify(messageLiteral.text).slice(0, 60)})`,
      );
    }

    // G5: функция-подпись, возвращающая собственный вход (сырой машинный код) человеку.
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      for (const leak of codeLabelLeakReturns(node, sf)) {
        const { line } = sf.getLineAndCharacterOfPosition(leak.getStart(sf));
        findings.push(
          `${relativePath}:${line + 1}: функция-подпись возвращает собственный вход ` +
            `(\`${leak.expression.text}\`) — человек увидит машинный код вместо фразы. Верните ` +
            `текст из notificationText (например commonUnknownStatus), а не входное значение`,
        );
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  // A const resolved from N call sites reports at its ONE declaration line — that is where the fix
  // goes, so the same line repeated N times is noise, not N findings.
  return [...new Set(findings)];
}

function checkTree() {
  const findings = [];
  for (const file of collectFiles(sourceRoot)) {
    if (file === dictionaryFile) continue;
    const text = readFileSync(file, 'utf8');
    findings.push(...checkSource(relative(appRoot, file), text));
  }
  return findings;
}

function selfTest() {
  const leaking = [
    ['UserFacingError literal', "throw new UserFacingError('Что-то пошло не так');"],
    ['toast.error literal', "toast.error('Не удалось сохранить');"],
    ['toast.success literal', "toast.success('Готово');"],
    ['template literal, no interpolation', 'toast.error(`Готово`);'],
    ['literal in ?? fallback', "toast.error(data.message ?? 'Не удалось сохранить');"],
    ['literal in chained ?? fallback', "toast.error(data.message ?? data.error ?? 'Не удалось сохранить');"],
    ['literal in ternary else-branch (dynamic passthrough with a static fallback)',
      "toast.error(error instanceof Error ? error.message : 'fallback');"],
    ['literal in ternary then-branch', "toast.error(ok ? 'Готово' : status);"],
    ['literal on both ternary branches', "toast.success(added ? 'Запись добавлена' : 'Запись обновлена');"],
    ['literal nested under ?? through a parenthesised ternary',
      "toast.error(data.message ?? (ok ? 'Готово' : 'Не удалось сохранить'));"],
    ['literal in readSafeApiErrorText fallback argument, standalone',
      "setError(readSafeApiErrorText(data, 'Не удалось сохранить'));"],
    ['literal in readSafeApiErrorText fallback argument, nested inside toast.error',
      "toast.error(readSafeApiErrorText(data, 'Не удалось сохранить'));"],
    ['literal in readSafeApiErrorText fallback argument, nested inside throw new Error',
      "throw new Error(readSafeApiErrorText(data, 'Не удалось загрузить'));"],
    ['literal in readSafeApiErrorText fallback argument, nested inside a returned object field',
      "return { ok: false, error: readSafeApiErrorText(data, 'Ошибка сохранения') };"],
    ['literal in safeActionErrorText fallback argument',
      "return { ok: false, error: safeActionErrorText('scope', e, 'Ошибка сохранения') };"],
    ['literal in mechanicWriteClearanceRefusalResponse fallback argument',
      "const r = mechanicWriteClearanceRefusalResponse(error, 'Невозможно сохранить шаблон.');"],
    // G3 (safety audit, 2026-09-13 gating pass): raw ".error" reaching a toast argument.
    ['raw .error property, direct toast argument', 'toast.error(data.error);'],
    ['raw .error property, ?? fallback in toast argument', 'toast.error(data.error ?? notificationText.someKey);'],
    ['raw .error property, optional-chain in toast argument', 'toast.error(data?.error ?? notificationText.someKey);'],
    ['raw .error property on ternary branch in toast argument', 'toast.success(ok ? notificationText.someKey : result.error);'],
    // G4 (safety audit, 2026-09-13 gating pass): inline message literal in a route response body.
    ['NextResponse.json message literal',
      "return NextResponse.json({ ok: false, error: 'x', message: 'Некорректные данные' }, { status: 400 });"],
    ['Response.json message literal', "return Response.json({ error: 'x', message: 'Ошибка' });"],
    // NEW-4: the `jsonError(code, body, init)` wrapper carries the body in its SECOND argument —
    // the blind spot that hid the live X-Real-IP leaks. It had no fixture until the final audit.
    ['jsonError message literal (body is the SECOND argument)',
      "return jsonError('invalid_body', { message: 'Некорректные данные' }, { status: 400 });"],
    // Final-audit MAJOR: one level of same-file const indirection, both rules.
    ['module const literal reaching a toast argument',
      "const NET = 'Нет связи с сервером.';\ntoast.error(NET);"],
    ['module const literal reaching a jsonError message property',
      "const M = 'Выберите публичный адрес клиники.';\nreturn jsonError('x', { message: M }, { status: 409 });"],
    ['module const literal riding a ?? fallback branch',
      "const NET = 'Нет связи с сервером.';\ntoast.error(data.message ?? NET);"],
    // G5 (владелец, 13.09): функция-подпись, отдающая человеку собственный вход.
    ['функция-подпись возвращает свой вход (цепочка if)',
      "function label(status: string): string {\n  if (status === 'ready') return 'Готово';\n  return status;\n}"],
    ['функция-подпись возвращает свой вход (switch)',
      "function label(status: string): string {\n  switch (status) {\n    case 'ready':\n      return 'Готово';\n    default:\n      return status;\n  }\n}"],
    ['переводчик кода ошибки возвращает сам код',
      "function panelErrorLabel(error: string): string {\n  if (error === 'slot_overlap') return 'Слот занят.';\n  return error;\n}"],
  ];
  const safe = [
    ['dictionary reference', 'toast.error(notificationText.someKey);'],
    ['factory call', 'throw new UserFacingError(notificationTextFactory.invalidUuid(label));'],
    ['template literal with interpolation', 'throw new UserFacingError(`Некорректный UUID: ${label}`);'],
    ['dictionary reference as ?? fallback', 'toast.error(data.message ?? notificationText.someKey);'],
    ['dictionary references on both ternary branches',
      'toast.success(added ? notificationText.entryAdded : notificationText.entryUpdated);'],
    ['dynamic passthrough with no literal anywhere', 'toast.error(error instanceof Error ? error.message : fallbackVar);'],
    ['bare variable', 'toast.error(message);'],
    ['dictionary reference as readSafeApiErrorText fallback argument',
      'setError(readSafeApiErrorText(data, notificationText.someKey));'],
    ['dictionary reference as safeActionErrorText fallback argument',
      "safeActionErrorText('scope', e, notificationText.someKey);"],
    ['action-code (non-literal-text) second argument to an unrelated helper stays untouched',
      "staffSecurityErrorText(data.error, 'email_password_login');"],
    // G3: a raw ".error" routed through one of the two dictionary-fallback helpers is safe — the
    // helper call itself is the leaf as far as the branch walk is concerned, same as any other
    // dynamic expression; only a BARE `.error` property access is a violation.
    ['raw .error routed through readSafeApiErrorText stays safe',
      'toast.error(readSafeApiErrorText(data, notificationText.someKey));'],
    ['raw .error routed through readSafeActionErrorText stays safe',
      'toast.error(readSafeActionErrorText(result, notificationText.someKey));'],
    ['UserFacingError with a raw .error is the documented instanceEditorBatchApply.ts exception — ' +
      'the toast-only rule does not look at UserFacingError at all',
      'throw new UserFacingError(duration.error);'],
    // G4: dynamic/dictionary message values are not literals.
    ['NextResponse.json message from dictionary reference',
      'return NextResponse.json({ ok: false, message: notificationText.someKey });'],
    ['NextResponse.json message template literal with interpolation',
      'return NextResponse.json({ message: `Код: ${code}` });'],
    ['NextResponse.json with no message property',
      "return NextResponse.json({ ok: false, error: 'x' });"],
    ['jsonError message from dictionary reference',
      "return jsonError('x', { message: notificationText.someKey }, { status: 400 });"],
    // Const resolution must not turn every module const into a violation: a const holding a MACHINE
    // code compared against `error.message` (the live `saas_quota_reached:files` shape) is not shown
    // text, and a FUNCTION-scoped const is not the shared-copy shape this rule is about.
    ['module const holding a machine code, not passed to a shown-text call site',
      "const QUOTA = 'saas_quota_reached:files';\nif (error.message === QUOTA) return null;"],
    ['function-scoped const is not resolved',
      "function f() {\n  const local = 'Не удалось сохранить';\n  return local;\n}"],
    // G5 не имеет права ловить форматтеры и склейки готовых подписей — три живые формы,
    // на которых более грубая версия правила давала ложные срабатывания.
    ['форматтер возвращает исходную строку, если значение не разобралось',
      "function fmt(iso: string): string {\n  const d = new Date(iso);\n  if (Number.isNaN(d.getTime())) return iso;\n  return d.toLocaleDateString('ru-RU');\n}"],
    ['склейка уже готовых подписей, без словаря кодов',
      "function rowLabel(dateLabel: string, timeLabel: string): string {\n  if (timeLabel === '—') return dateLabel;\n  return `${dateLabel} ${timeLabel}`;\n}"],
    ['возврат входа там, где подписей нет вовсе (значение шкалы)',
      "function maxPain(raw: string): string {\n  if (raw === '9' || raw === '10') return raw;\n  return String(Number.parseInt(raw, 10));\n}"],
  ];

  for (const [name, source] of leaking) {
    if (checkSource('fixture.ts', source).length === 0) {
      throw new Error(`self-test stayed green on a leak: ${name}`);
    }
  }
  for (const [name, source] of safe) {
    const findings = checkSource('fixture.ts', source);
    if (findings.length > 0) {
      throw new Error(`self-test went red on a safe shape: ${name}\n${findings.join('\n')}`);
    }
  }

  // Список исключений («grandfather») УДАЛЁН 13.09 по прямому указанию владельца: гейт,
  // который что-то пропускает, «только лишнее время на диагностику, а толку ноль». Все 71 литерал
  // из 32 освобождённых файлов перенесены в словарь, поэтому исключений больше нет вовсе.

  console.log(
    `notification text coverage self-test: OK (${leaking.length} leak fixtures red, ${safe.length} safe shapes green)`,
  );
}

if (process.argv.includes('--self-test')) selfTest();

if (!process.argv.includes('--self-test-only')) {
  const findings = checkTree();
  if (findings.length) {
    console.error(
      `notification text coverage: ${findings.length} call site(s) carry an inline string instead of ` +
        `notificationText\n` +
        findings.join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log('notification text coverage: OK');
  }
}
