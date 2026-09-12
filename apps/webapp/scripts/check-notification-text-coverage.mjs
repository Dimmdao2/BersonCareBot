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
 * What is not a violation:
 *  - a reference to the dictionary (`notificationText.someKey`, `notificationTextFactory.fn(...)`),
 *    on its own or as a branch of `??`/a ternary;
 *  - a template literal WITH interpolation (`` `${label}: ...` ``) — parameterized text belongs in
 *    `notificationTextFactory` by convention, but the AST can't force that split, so this gate only
 *    catches the fully-static literal case it can act on mechanically;
 *  - a branch that is some OTHER dynamic expression with no literal in it (a caught exception's
 *    bare `.message`, a variable, a function call) — those are either already governed by the
 *    separate safe-user-error-text door or are a deliberate pass-through of a runtime value;
 *  - the dictionary file itself and test files (not part of the shown-text surface).
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

/** Does `node` look like `new UserFacingError(...)` or `toast.error/success(...)`? Returns its
 * first (message) argument expression, or undefined if `node` isn't one of these calls. */
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
  return undefined;
}

/**
 * Walks an argument expression through the shapes that can carry a runtime value to the USER
 * while a plain string literal rides along one of the branches — `??` fallbacks, ternaries, and
 * parenthesised nesting of those — and collects every string-literal / no-substitution
 * template-literal leaf found. A leaf reached only through some OTHER dynamic expression (a bare
 * identifier, a property access, a call) is not a literal and contributes nothing; walking simply
 * does not go past it (there is nothing further to inspect on that branch).
 */
function collectLiteralLeaves(expr, out = []) {
  if (ts.isParenthesizedExpression(expr)) {
    collectLiteralLeaves(expr.expression, out);
    return out;
  }
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    out.push(expr);
    return out;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    collectLiteralLeaves(expr.left, out);
    collectLiteralLeaves(expr.right, out);
    return out;
  }
  if (ts.isConditionalExpression(expr)) {
    collectLiteralLeaves(expr.whenTrue, out);
    collectLiteralLeaves(expr.whenFalse, out);
    return out;
  }
  // Any other expression shape (identifier, property access, call, `||`, `+`, template with
  // interpolation, …) is dynamic or out of the walked shape set — nothing to collect past it.
  return out;
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

  const visit = (node) => {
    const argument = textArgumentOf(node);
    if (argument) {
      for (const literal of collectLiteralLeaves(argument)) {
        const { line } = sf.getLineAndCharacterOfPosition(literal.getStart(sf));
        findings.push(
          `${relativePath}:${line + 1}: string literal reachable in a shown-text argument — add it ` +
            `to notificationText.ts and reference the key instead (${JSON.stringify(literal.text).slice(0, 60)})`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
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
