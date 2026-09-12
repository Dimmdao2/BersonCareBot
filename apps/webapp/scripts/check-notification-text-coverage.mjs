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
 * call whose first argument is a plain string literal or a no-substitution template literal
 * (`` `text` `` with no `${...}`) — i.e. a string the author typed at the call site instead of
 * referencing the dictionary.
 *
 * What is not a violation:
 *  - a reference to the dictionary (`notificationText.someKey`, `notificationTextFactory.fn(...)`);
 *  - a template literal WITH interpolation (`` `${label}: ...` ``) — parameterized text belongs in
 *    `notificationTextFactory` by convention, but the AST can't force that split, so this gate only
 *    catches the fully-static literal case it can act on mechanically;
 *  - any other dynamic expression (a caught exception's `.message`, a variable, a ternary) — those
 *    are either already governed by the separate safe-user-error-text door or are a deliberate
 *    pass-through of a runtime value, not a duplicable known-code text;
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

/** Does `call` look like `new UserFacingError(...)` or `toast.error/success(...)`? */
function literalTextArgument(node) {
  let argument;
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'UserFacingError' &&
    node.arguments &&
    node.arguments.length >= 1
  ) {
    argument = node.arguments[0];
  } else if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'toast' &&
    (node.expression.name.text === 'error' || node.expression.name.text === 'success') &&
    node.arguments.length >= 1
  ) {
    argument = node.arguments[0];
  } else {
    return undefined;
  }
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return argument;
  return undefined;
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
    const literal = literalTextArgument(node);
    if (literal) {
      const { line } = sf.getLineAndCharacterOfPosition(literal.getStart(sf));
      findings.push(
        `${relativePath}:${line + 1}: string literal passed directly — add it to ` +
          `notificationText.ts and reference the key instead (${JSON.stringify(literal.text).slice(0, 60)})`,
      );
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
  ];
  const safe = [
    ['dictionary reference', 'toast.error(notificationText.someKey);'],
    ['factory call', 'throw new UserFacingError(notificationTextFactory.invalidUuid(label));'],
    ['template literal with interpolation', 'throw new UserFacingError(`Некорректный UUID: ${label}`);'],
    ['dynamic passthrough', "toast.error(error instanceof Error ? error.message : 'fallback');"],
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
