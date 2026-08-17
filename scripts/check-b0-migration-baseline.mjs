#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, relative as relativePath, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const webappMigrations = resolve(root, 'apps/webapp/db/drizzle-migrations');
const integratorRoot = resolve(root, 'apps/integrator/src');

function files(directory, suffix) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
}

function relative(path) {
  return path.slice(root.length + 1);
}

const webappSql = files(webappMigrations, '.sql').map(relative).sort();
const integratorSql = files(integratorRoot, '.sql')
  .filter((path) => path.includes('/db/migrations/'))
  .map(relative)
  .sort();
const webappBaseline = 'apps/webapp/db/drizzle-migrations/0000_b0_baseline.sql';
const integratorBaseline =
  'apps/integrator/src/infra/db/migrations/core/20260816_0000_b0_baseline.sql';
if (webappSql[0] !== webappBaseline || integratorSql[0] !== integratorBaseline) {
  throw new Error('the active migration roots must start at the canonical B0 baselines');
}
const invalidIntegratorForward = integratorSql.slice(1).filter((path) => {
  const name = path.split('/').at(-1) ?? '';
  return !/^20\d{6}_\d{4}_[a-z0-9_]+\.sql$/.test(name) || name <= '20260816_0000_b0_baseline.sql';
});
if (invalidIntegratorForward.length > 0) {
  throw new Error(
    `integrator migrations before/at B0 or with invalid names are forbidden: ${invalidIntegratorForward.join(',')}`,
  );
}

const legacySql = files(resolve(root, 'apps/webapp'), '.sql')
  .map(relative)
  .filter((path) => path.startsWith('apps/webapp/migrations/'));
if (legacySql.length > 0) {
  throw new Error(`legacy webapp migration SQL is forbidden: ${legacySql.join(',')}`);
}

const journal = JSON.parse(readFileSync(resolve(webappMigrations, 'meta/_journal.json'), 'utf8'));
const entries = journal.entries ?? [];
if (journal.version !== '7' || journal.dialect !== 'postgresql') {
  throw new Error('Drizzle journal header must remain canonical');
}
if (
  entries[0]?.idx !== 0 ||
  entries[0]?.when !== 1800000000000 ||
  entries[0]?.tag !== '0000_b0_baseline'
) {
  throw new Error('Drizzle journal must start at the canonical B0 marker');
}
for (const [index, entry] of entries.entries()) {
  if (
    entry.idx !== index ||
    !Number.isSafeInteger(entry.when) ||
    (index > 0 && entry.when <= entries[index - 1].when) ||
    !/^[0-9]{4}_[a-z0-9_]+$/.test(entry.tag)
  ) {
    throw new Error(`invalid post-B0 Drizzle journal entry at index=${index}`);
  }
}
const journalSql = entries.map(
  (entry) => `apps/webapp/db/drizzle-migrations/${entry.tag}.sql`,
);
if (JSON.stringify(webappSql) !== JSON.stringify(journalSql)) {
  throw new Error(
    `webapp migration SQL must match the B0-forward journal; files=${webappSql.join(',')}`,
  );
}

const journalIndexes = new Set(entries.map((entry) => entry.idx));
const invalidSnapshots = files(resolve(webappMigrations, 'meta'), '_snapshot.json')
  .map(relative)
  .filter((path) => {
    const match = path.match(/\/([0-9]{4})_snapshot\.json$/);
    return !match || !journalIndexes.has(Number(match[1]));
  });
if (invalidSnapshots.length > 0) {
  throw new Error(`pre-B0 or orphan Drizzle snapshots are forbidden: ${invalidSnapshots.join(',')}`);
}

// The maintained migration surface is B0 + forwards only. Inventory is repository-wide on purpose:
// an alternate DB executor is callable just as easily from tools/, a fourth workspace or CI as it is
// from scripts/. Archives are historical evidence and are the only non-routable exception.
const ignoredDirectoryNames = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const ignoredPathPrefixes = ['docs/archive/', '.cursor/plans/archive/'];
const callableExtension = /\.(?:sh|bash|mjs|mts|cjs|js|ts|tsx|py|sql|ya?ml)$/i;
const callableBasename = /^(?:Dockerfile(?:\..*)?|Makefile|Taskfile(?:\..*)?)$/i;

function repositoryFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    const rel = relativePath(root, absolute).replaceAll('\\', '/');
    if (ignoredPathPrefixes.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix))) {
      continue;
    }
    if (entry.isDirectory()) result.push(...repositoryFiles(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

const repositoryInventory = repositoryFiles(root);
const executableFiles = repositoryInventory.filter((path) => {
  const rel = relative(path);
  const mode = statSync(path).mode;
  return (
    callableExtension.test(path) ||
    callableBasename.test(basename(path)) ||
    basename(path) === 'package.json' ||
    (mode & 0o111) !== 0 ||
    /^\.github\/(?:workflows|actions)\//.test(rel)
  );
});
const forbiddenName =
  /(?:stage13|zero-state|prod-to-target|pre-migration-target-bridge|offline-legacy|a0-greenfield|disposable|(?:^|[-_:])a0(?:[-_.:]|$))/i;

// These are named DEV/TEST deployment ports. They may replay a reviewed declaration/overlay into
// an already-existing named database, but the allowlist never permits CREATE/DROP DATABASE,
// PostgreSQL server/container startup, scratch targets or historical migration executors.
const namedEnvironmentReplayPorts = new Set([
  'deploy/host/deploy-test.sh',
  'deploy/host/provision-c4-operational-runtime.sh',
  'deploy/host/provision-dev-saas-diagnostics.sh',
  'deploy/host/retire-media-db-login.sh',
  'deploy/host/run-u5a-patient-organization-test-lifecycle.sh',
  'deploy/postgres/privileges/migrate-local.mjs',
]);

// `pg_restore --create` both creates a database and reconstructs its contents from a dump, which is
// the reconstruction the owner plan forbids outright, so it is a database utility like the others.
const databaseUtilities = new Set(['initdb', 'createdb', 'dropdb', 'pg_ctl', 'pg_restore']);
const databaseUtilityPattern = 'initdb|createdb|dropdb|pg_ctl|pg_restore';
const processCallees = ['spawn', 'spawnSync', 'execFile', 'execFileSync'];
// `exec`/`execSync` take one whole command string instead of (executable, args), so they are
// inspected as shell command text rather than as an argv pair.
const shellCommandCallees = ['exec', 'execSync'];

// Command identity is the final path component: the JS scanner already normalises with basename(),
// so `/usr/lib/postgresql/16/bin/psql` is the same command as `psql` for the shell scanners too.
function normaliseShellCommandPaths(source) {
  return source.replaceAll(
    new RegExp(
      `(^|[\\s;&|(='"\`])(?:[A-Za-z0-9._~$-]*/)+(${databaseUtilityPattern}|psql)\\b`,
      'gim',
    ),
    (match, prefix, command) => `${prefix}${command}`,
  );
}

// A database utility is anchored to the start of a command, not to arbitrary prose. Command starts
// include a line start (Make recipes begin with a TAB and may carry a `@`/`-`/`+` prefix), a shell
// separator, a YAML `run:` key, and a `sh -c "…"` / `bash -c "…"` wrapper.
const databaseUtilityAnchors = new RegExp(
  `(?:^[ \\t]*[-@+]?[ \\t]*|[;&|]\\s*|\\brun:\\s*|\\bcommand\\s+|\\bexec\\s+|\\b(?:sh|bash|zsh|dash|ash)\\s+-[A-Za-z]*c\\s+|\\bsudo(?:\\s+-\\S+)*\\s+)['"]?(?:${databaseUtilityPattern})\\b['"]?`,
  'im',
);

// One command string handed to `exec`/`execSync` is shell text, so it is judged by the shell rules.
function shellCommandStringViolation(command) {
  const normalised = normaliseShellCommandPaths(command);
  if (databaseUtilityAnchors.test(normalised)) return 'database create/drop/server utility';
  if (/\b(?:create|drop)\s+database\b/i.test(normalised)) {
    return 'CREATE/DROP DATABASE through a database client';
  }
  if (
    /(?:^|[;&|(\s'"])(?:sudo(?:\s+-\S+)*\s+)?['"]?psql\b[^\n]*(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<>&])|\\+i(?:r)?\s)/im.test(
      normalised,
    )
  ) {
    return 'psql file/stdin replay outside a named-environment port';
  }
  return null;
}

function uncommentedShell(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
    .replaceAll(/\\\r?\n/g, ' ');
}

// Resolves a static string OR a static list of strings. A command list bound to a local name is the
// same callable as the inline literal, so both shapes must reach the process-call inspection below.
function staticJavaScriptValue(node, bindings) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return staticJavaScriptValue(node.expression, bindings);
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    return staticJavaScriptValue(node.expression, bindings);
  }
  if (ts.isIdentifier(node)) return bindings.get(node.text) ?? null;
  if (ts.isArrayLiteralExpression(node)) {
    const elements = node.elements.map((element) =>
      ts.isSpreadElement(element)
        ? staticJavaScriptValue(element.expression, bindings)
        : staticJavaScriptValue(element, bindings),
    );
    if (elements.some((element) => element === null)) return null;
    return elements.flatMap((element) => (Array.isArray(element) ? element : [element]));
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticJavaScriptValue(node.left, bindings);
    const right = staticJavaScriptValue(node.right, bindings);
    return typeof left === 'string' && typeof right === 'string' ? left + right : null;
  }
  return null;
}

function staticJavaScriptString(node, bindings) {
  const value = staticJavaScriptValue(node, bindings);
  return typeof value === 'string' ? value : null;
}

function staticJavaScriptStringList(node, bindings) {
  const value = staticJavaScriptValue(node, bindings);
  return Array.isArray(value) ? value : null;
}

// An argument list is still readable when one of its elements is dynamic: `['-f', resolve(…)]` is a
// file replay whatever the path folds to. Unresolvable elements become `null` placeholders so the
// positions of the static ones are preserved, and the whole list is never discarded.
function tolerantStringList(node, bindings, initializers, seen = new Set()) {
  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) {
    return tolerantStringList(node.expression, bindings, initializers, seen);
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) {
    return tolerantStringList(node.expression, bindings, initializers, seen);
  }
  if (ts.isIdentifier(node)) {
    const bound = bindings.get(node.text);
    if (Array.isArray(bound)) return bound;
    if (seen.has(node.text)) return null;
    const initializer = initializers.get(node.text);
    return initializer
      ? tolerantStringList(initializer, bindings, initializers, new Set([...seen, node.text]))
      : null;
  }
  if (!ts.isArrayLiteralExpression(node)) return null;
  return node.elements.flatMap((element) => {
    if (ts.isSpreadElement(element)) {
      return tolerantStringList(element.expression, bindings, initializers, seen) ?? [null];
    }
    const value = staticJavaScriptValue(element, bindings);
    if (Array.isArray(value)) return value;
    return [typeof value === 'string' ? value : null];
  });
}

function javaScriptSemanticViolation(source, rel) {
  const sourceFile = ts.createSourceFile(
    rel,
    source,
    ts.ScriptTarget.Latest,
    true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const bindings = new Map();
  const declarations = [];
  function collectDeclarations(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.push(node);
    }
    ts.forEachChild(node, collectDeclarations);
  }
  collectDeclarations(sourceFile);
  const initializers = new Map();
  for (const declaration of declarations) {
    if (!initializers.has(declaration.name.text)) {
      initializers.set(declaration.name.text, declaration.initializer);
    }
  }
  for (let pass = 0; pass < declarations.length; pass += 1) {
    let changed = false;
    for (const declaration of declarations) {
      if (bindings.has(declaration.name.text)) continue;
      const value = staticJavaScriptValue(declaration.initializer, bindings);
      if (value !== null) {
        bindings.set(declaration.name.text, value);
        changed = true;
      }
    }
    if (!changed) break;
  }

  let violation = null;
  function inspect(node) {
    if (violation || !ts.isCallExpression(node)) {
      if (!violation) ts.forEachChild(node, inspect);
      return;
    }
    const callee = ts.isIdentifier(node.expression)
      ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : null;
    const first = staticJavaScriptString(node.arguments[0], bindings);
    if (processCallees.includes(callee)) {
      // A process call carries either (executable, [args]) or a single static command list. Both
      // resolve through local bindings, so a refactor into a variable is not an escape.
      const firstArgument = node.arguments[0];
      const firstList = firstArgument && ts.isSpreadElement(firstArgument)
        ? tolerantStringList(firstArgument.expression, bindings, initializers)
        : tolerantStringList(firstArgument, bindings, initializers);
      const executable = first ?? (typeof firstList?.[0] === 'string' ? firstList[0] : null);
      // A dynamic element never hides the static ones around it: the list keeps its shape and only
      // the unresolvable positions drop out of the flag comparison.
      const args = (
        firstList ? firstList.slice(1) : (tolerantStringList(node.arguments[1], bindings, initializers) ?? [])
      ).filter((argument) => typeof argument === 'string');
      if (executable && databaseUtilities.has(basename(executable).toLowerCase())) {
        violation = 'database create/drop/server utility';
        return;
      }
      if (
        executable &&
        basename(executable).toLowerCase() === 'psql' &&
        (args.some(
          (argument) => argument === '-f' || argument === '--file' || argument.startsWith('--file='),
        ) ||
          args.some((argument) => /^\\i(?:r)?(?:\s|$)/i.test(argument)))
      ) {
        violation = 'psql file/stdin replay outside a named-environment port';
        return;
      }
    }
    if (shellCommandCallees.includes(callee) && first) {
      // `execSync(command)` with the command bound to a local name is the same callable as the
      // inline literal, so the one command string is read with the shell rules.
      const commandViolation = shellCommandStringViolation(first);
      if (commandViolation) {
        violation = commandViolation;
        return;
      }
    }
    if (callee === 'query' && first && /\b(?:create|drop)\s+database\b/i.test(first)) {
      violation = 'CREATE/DROP DATABASE through a database client';
      return;
    }
    ts.forEachChild(node, inspect);
  }
  inspect(sourceFile);
  return violation;
}

const pythonAstScanner = String.raw`
import ast, json, re, sys
source = sys.stdin.read()
tree = ast.parse(source)
bindings = {}
def value(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str): return node.value
    if isinstance(node, ast.Name): return bindings.get(node.id)
    if isinstance(node, (ast.List, ast.Tuple)):
        values = [value(item) for item in node.elts]
        return values if all(item is not None for item in values) else None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = value(node.left), value(node.right)
        return left + right if isinstance(left, str) and isinstance(right, str) else None
    return None
for node in ast.walk(tree):
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        target = node.targets[0] if isinstance(node, ast.Assign) and node.targets else node.target
        resolved = value(node.value)
        if isinstance(target, ast.Name) and resolved is not None: bindings[target.id] = resolved
violation = None
for node in ast.walk(tree):
    if not isinstance(node, ast.Call): continue
    name = ''
    if isinstance(node.func, ast.Name): name = node.func.id
    elif isinstance(node.func, ast.Attribute):
        root = node.func.value.id if isinstance(node.func.value, ast.Name) else ''
        name = root + '.' + node.func.attr
    argument = value(node.args[0]) if node.args else None
    command = ' '.join(argument) if isinstance(argument, list) and all(isinstance(item, str) for item in argument) else argument if isinstance(argument, str) else None
    # A command list bound to a local name is the same callable as the inline literal, so every
    # process entrypoint that receives one is inspected, not only os.system.
    processCallees = ('os.system', 'os.popen', 'subprocess.run', 'subprocess.call', 'subprocess.check_call', 'subprocess.check_output', 'subprocess.Popen', 'subprocess.getoutput', 'subprocess.getstatusoutput')
    if name in processCallees and isinstance(command, str):
        if re.search(r'(^|\s)(initdb|createdb|dropdb|pg_ctl|pg_restore)(\s|$)', command, re.I): violation = 'database create/drop/server utility'
        elif re.search(r'\b(create|drop)\s+database\b', command, re.I): violation = 'CREATE/DROP DATABASE through a database client'
        elif re.search(r'\bpsql\b.*(?:\s-f\s|\s--file(?:=|\s)|\\i(?:r)?\s)', command, re.I): violation = 'psql file/stdin replay outside a named-environment port'
    if violation: break
print(json.dumps({'violation': violation}))
`;

function pythonSemanticViolation(source) {
  const result = spawnSync('python3', ['-c', pythonAstScanner], {
    input: source,
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.status !== 0) {
    throw new Error(`Python AST scan failed: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout).violation;
}

function shellVariables(source) {
  const bindings = new Map();
  for (const match of source.matchAll(
    /(?:^|[;\n])\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s;]+))/g,
  )) {
    bindings.set(match[1], match[2] ?? match[3] ?? match[4]);
  }
  return source.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, plain) => {
    return bindings.get(braced ?? plain) ?? match;
  });
}

function splitUnquoted(source, separator) {
  const parts = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if ((character === "'" || character === '"') && (!quote || quote === character)) {
      quote = quote ? null : character;
      continue;
    }
    if (!quote && character === separator) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function shellWords(source) {
  const words = [];
  let word = '';
  let quote = null;
  let escaped = false;
  for (const character of source.trim()) {
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if ((character === "'" || character === '"') && (!quote || quote === character)) {
      quote = quote ? null : character;
      continue;
    }
    if (!quote && /\s/.test(character)) {
      if (word) words.push(word);
      word = '';
      continue;
    }
    word += character;
  }
  if (word) words.push(word);
  return words;
}

function shellPrintfReplay(source) {
  return source.split(/\r?\n/).some((line) => {
    const pipeline = splitUnquoted(line, '|').map(shellWords);
    return pipeline.some((tokens, index) => {
      if (tokens[0] !== 'psql' || index === 0) return false;
      const producer = pipeline[index - 1];
      return producer[0] === 'printf' && producer.slice(1).some((value) => /^\\i(?:r)?(?:\s|$)/i.test(value));
    });
  });
}

// Container image identity is the final repository component: `docker.io/library/postgres:17`,
// `library/postgres` and `postgres` are the same image, so a fully-qualified reference is not an escape.
function isPostgresImageReference(reference) {
  const repository = reference.split('@')[0].split('/').at(-1) ?? '';
  return ['postgres', 'postgresql'].includes(repository.split(':')[0].toLowerCase());
}

// A compose/CI `image:` key and a `docker run` argument name the same image identity a Dockerfile
// `FROM` does, so both go through isPostgresImageReference — a digest pin is not a different image.
function referencesPostgresContainer(source) {
  for (const match of source.matchAll(/\bimage\s*:\s*['"]?([^\s'"\n]+)/gi)) {
    if (isPostgresImageReference(match[1])) return true;
  }
  for (const match of source.matchAll(/\bdocker\s+(?:run|create)\b([^\n]*)/gi)) {
    if (shellWords(match[1]).some((word) => !word.startsWith('-') && isPostgresImageReference(word))) {
      return true;
    }
  }
  return false;
}

function dockerfileStartsPostgres(source) {
  return uncommentedShell(source).split(/\r?\n/).some((line) => {
    const words = shellWords(line.replace(/\\\s*$/g, ''));
    if (words[0]?.toUpperCase() !== 'FROM') return false;
    const image = words.slice(1).find((word) => !word.startsWith('--')) ?? '';
    return isPostgresImageReference(image);
  });
}

function executableViolation(rel, source) {
  const extension = rel.split('.').at(-1)?.toLowerCase() ?? '';
  const isShellLike =
    ['sh', 'bash', 'yml', 'yaml'].includes(extension) ||
    callableBasename.test(basename(rel));
  const isJavaScriptLike = ['mjs', 'mts', 'cjs', 'js', 'ts', 'tsx'].includes(extension);
  const isPython = extension === 'py';
  const isSql = extension === 'sql';
  const shell = isShellLike
    ? normaliseShellCommandPaths(shellVariables(uncommentedShell(source)))
    : '';
  const semanticJavaScriptViolation = isJavaScriptLike &&
    /\b(?:initdb|createdb|dropdb|pg_ctl|pg_restore|psql|database)\b/i.test(source)
    ? javaScriptSemanticViolation(source, rel)
    : null;
  const semanticPythonViolation = isPython ? pythonSemanticViolation(source) : null;
  if (semanticJavaScriptViolation || semanticPythonViolation) {
    return semanticJavaScriptViolation ?? semanticPythonViolation;
  }

  const databaseUtilityInShell = databaseUtilityAnchors.test(shell);
  const databaseUtilityInChildProcess = isJavaScriptLike &&
    /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`](?:initdb|createdb|dropdb|pg_ctl|pg_restore)['"`]/i.test(
      source,
    );
  const databaseUtilityInShellChild = isJavaScriptLike &&
    /\b(?:exec|execSync)\s*\(\s*['"`][\s\S]{0,300}?\b(?:initdb|createdb|dropdb|pg_ctl|pg_restore)\b/i.test(
      source,
    );
  const databaseUtilityInPython = isPython &&
    /\bsubprocess\s*\.\s*(?:run|call|check_call|check_output|Popen)\s*\([\s\S]{0,400}?(?:['"](?:initdb|createdb|dropdb|pg_ctl|pg_restore)['"]|['"][^'"]*\b(?:initdb|createdb|dropdb|pg_ctl|pg_restore)\b[^'"]*['"])/i.test(
      source,
    );
  if (
    databaseUtilityInShell ||
    databaseUtilityInChildProcess ||
    databaseUtilityInShellChild ||
    databaseUtilityInPython
  ) {
    return 'database create/drop/server utility';
  }

  if (isSql && /\b(?:create|drop)\s+database\b/i.test(source)) {
    return 'CREATE/DROP DATABASE SQL';
  }
  const databaseDdlVariableNames = new Set(
    [...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]\s*(?:create|drop)\s+database\b/gi)]
      .map((match) => match[1]),
  );
  const databaseDdlThroughClient =
    (isJavaScriptLike &&
      (/\.\s*query\s*\(\s*['"`]\s*(?:create|drop)\s+database\b/i.test(source) ||
        [...databaseDdlVariableNames].some((name) =>
          new RegExp(`\\.\\s*query\\s*\\(\\s*${name.replaceAll('$', '\\$')}\\s*[,)]`).test(source),
        ))) ||
    (isPython &&
      /\.\s*(?:execute|query)\s*\(\s*(?:[rubf]{0,2})?['"]\s*(?:create|drop)\s+database\b/i.test(source));
  if (databaseDdlThroughClient) return 'CREATE/DROP DATABASE through a database client';

  if (
    (isShellLike && referencesPostgresContainer(shell)) ||
    (callableBasename.test(basename(rel)) && dockerfileStartsPostgres(source)) ||
    (isJavaScriptLike && referencesPostgresContainer(source))
  ) {
    return 'PostgreSQL container/server';
  }

  // `"$database_client"` resolves to a quoted `psql` word, which is the same command as the bare one.
  const shellReplay = isShellLike &&
    (/(?:^|[;&|(\s'"])(?:sudo(?:\s+-\S+)*\s+)?['"]?psql\b[^\n]*(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<>&])|<<\s*['"]?SQL\b)/im.test(shell) ||
      /\bpsql\b[^\n]*\s(?:-c|--command(?:=|\s))\s*['"]?\\+(?:i|ir)\s+/im.test(shell) ||
      /\b(?:cat|head|tail|sed|awk)\b[^\n|]*\.(?:sql|psql)\b[^\n|]*\|\s*(?:sudo(?:\s+-\S+)*\s+)?['"]?psql\b/im.test(shell) ||
      shellPrintfReplay(shell));
  const childReplay = isJavaScriptLike &&
    (/\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`]psql['"`][\s\S]{0,800}?(?:['"`](?:-f|--file)['"`]|['"`](?:-c|--command)['"`][\s\S]{0,200}?['"`]\\\\+(?:i|ir)(?:\s|['"`])|['"`]\\\\+(?:i|ir)(?:\s|['"`]))/i.test(
      source,
    ) ||
      /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"`]psql['"`][\s\S]{0,1200}?\binput\s*:\s*readFileSync\s*\([^)]*\.(?:sql|psql)['"`][^)]*\)/i.test(source));
  const shellChildReplay = isJavaScriptLike &&
    /\b(?:exec|execSync)\s*\(\s*['"`][\s\S]{0,800}?\bpsql\b[\s\S]{0,500}?(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<&])|\\\\i\s)/i.test(
      source,
    );
  const pythonReplay = isPython &&
    /\bsubprocess\s*\.\s*(?:run|call|check_call|check_output|Popen)\s*\([\s\S]{0,800}?['"]psql['"][\s\S]{0,800}?(?:['"](?:-f|--file)['"]|['"](?:-c|--command)['"][\s\S]{0,200}?['"]\\(?:i|ir)\s)/i.test(
      source,
    );
  const sqlIncludeReplay = isSql && /^\s*\\i\s+\S+/im.test(source);
  if (
    (shellReplay || childReplay || shellChildReplay || pythonReplay || sqlIncludeReplay) &&
    !namedEnvironmentReplayPorts.has(rel)
  ) {
    return 'psql file/stdin replay outside a named-environment port';
  }
  return null;
}

const gateFiles = new Set([
  'scripts/check-b0-migration-baseline.mjs',
  'scripts/check-b0-migration-baseline.audit.test.mjs',
  'scripts/check-b0-migration-baseline.named-dev.audit.test.mjs',
]);
const alternateExecutors = executableFiles.flatMap((path) => {
  const rel = relative(path);
  if (gateFiles.has(rel)) return [];
  if (forbiddenName.test(rel)) return [`${rel} (forbidden executor name)`];
  const source = readFileSync(path, 'utf8');
  const violation = executableViolation(rel, source);
  return violation ? [`${rel} (${violation})`] : [];
});
if (alternateExecutors.length > 0) {
  throw new Error(
    `B0 checkout contains an alternate executable migration path: ${alternateExecutors.join(', ')}`,
  );
}

const activeManifests = repositoryInventory.filter((path) => basename(path) === 'package.json');
const forbiddenManifestCommands = activeManifests.flatMap((path) => {
  const scripts = JSON.parse(readFileSync(path, 'utf8')).scripts ?? {};
  return Object.entries(scripts)
    .filter(([name, command]) =>
      forbiddenName.test(name) ||
      /\bA0\b|a0-greenfield|offline-legacy|disposable|SCRATCH_DATABASE_URL|vitest\.postgres|postgres-integration/i.test(String(command)) ||
      /(?:^|[;&|]\s*|\bcommand\s+|\bexec\s+|\bsudo(?:\s+-\S+)*\s+)(?:initdb|createdb|dropdb|pg_ctl|pg_restore)\b/i.test(String(command)) ||
      /\bpsql\b[^\n]*(?:\s(?:-f|--file(?:=|\s))\s*|<\s*(?![<&])|\s(?:-c|--command(?:=|\s))\s*['"]?\\(?:i|ir)\s+)/i.test(String(command)) ||
      /\bdocker\s+(?:run|create)\b[^\n]*\b(?:postgres|postgresql)(?::[A-Za-z0-9._-]+)?\b/i.test(String(command)),
    )
    .map(([name]) => `${relative(path)}#scripts.${name}`);
});
if (forbiddenManifestCommands.length > 0) {
  throw new Error(
    `B0 checkout exposes a retired database command: ${forbiddenManifestCommands.join(', ')}`,
  );
}

const retiredExecutorRegistry = JSON.parse(
  readFileSync(
    resolve(root, 'docs/archive/2026-08-no-disposable-db-retirement/retired-executor-paths.json'),
    'utf8',
  ),
);
if (!Array.isArray(retiredExecutorRegistry) || retiredExecutorRegistry.some((value) => typeof value !== 'string')) {
  throw new Error('retired executor registry must be a string array');
}
const retiredDocReferences = repositoryInventory
  .filter((path) => {
    const rel = relative(path);
    return path.endsWith('.md') && (rel.startsWith('docs/') || rel.startsWith('.cursor/'));
  })
  .flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    if (
      source.startsWith(
        '> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence;',
      )
    ) {
      return [];
    }
    return retiredExecutorRegistry
      .filter((retiredPath) => source.includes(retiredPath))
      .map((retiredPath) => `${relative(path)} -> ${retiredPath}`);
  });
if (retiredDocReferences.length > 0) {
  throw new Error(
    `active documentation references a retired database executor: ${retiredDocReferences.join(', ')}`,
  );
}

console.log(
  `check-b0-migration-baseline: OK (B0 roots + ${entries.length - 1} webapp and ${integratorSql.length - 1} integrator forward migrations; no legacy chain)`,
);
