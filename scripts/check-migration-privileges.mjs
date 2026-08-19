#!/usr/bin/env node
/**
 * A migration file never grants or revokes a privilege (AGENTS.md §1 «Миграция не выдаёт и не
 * отзывает права. Никогда»). GRANT, REVOKE, role DDL, ALTER DEFAULT PRIVILEGES, policy DDL and RLS
 * flags belong to the privilege generator (deploy/postgres/privileges/) and arrive on reconcile.
 *
 * Two sources of privileges drift apart silently: a migration applies once, at an arbitrary point
 * of the chain, while the generator applies the whole picture on every reconcile — on divergence
 * the last writer wins and nobody can tell which state was meant. Separately, a migration runs as
 * the object owner, who often holds no privilege to grant at all, so such a statement fails the
 * rollout instead of protecting anything.
 *
 * Scanned: every *.sql under the migration folders below, statement text and string/dollar-quoted
 * literal content alike — a privilege statement smuggled through EXECUTE 'GRANT …' is the same
 * second source.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Every folder whose *.sql files are applied as migrations. */
const MIGRATION_FOLDERS = [
  'apps/webapp/db/drizzle-migrations',
  'apps/webapp/migrations',
  'apps/integrator/src/infra/db/migrations',
];

/** Privilege DDL that opens a statement, matched at statement starts only. */
const PRIVILEGE_STATEMENTS = [
  { what: 'GRANT', pattern: /GRANT\s+(?!\s)/iy },
  { what: 'REVOKE', pattern: /REVOKE\s+(?!\s)/iy },
  { what: 'ALTER DEFAULT PRIVILEGES', pattern: /ALTER\s+DEFAULT\s+PRIVILEGES\b/iy },
  { what: 'role DDL', pattern: /(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|GROUP)\s+(?!\s)/iy },
  { what: 'policy DDL', pattern: /(?:CREATE|ALTER|DROP)\s+POLICY\b/iy },
];

/** Privilege DDL that sits inside a larger statement (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`). */
const PRIVILEGE_CLAUSES = [
  { what: 'row level security', pattern: /(?:ENABLE|DISABLE|FORCE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/giu },
];

/**
 * Two views of the same file, both the exact length of the source so an offset is a source offset:
 *   `code`    — executable statement text, with comments and literal content blanked out;
 *   `literal` — literal content only, with everything else blanked out.
 * Both are scanned: the first carries plain statements, the second carries statements built as
 * strings for EXECUTE.
 */
function splitSql(sql) {
  const code = [...sql];
  const literal = new Array(sql.length);
  for (let index = 0; index < sql.length; index += 1) literal[index] = sql[index] === '\n' ? '\n' : ' ';
  const blank = (target, from, to) => {
    for (let index = from; index < to && index < sql.length; index += 1) {
      if (sql[index] !== '\n') target[index] = ' ';
    }
  };
  const keepAsLiteral = (from, to) => {
    for (let index = from; index < to && index < sql.length; index += 1) literal[index] = sql[index];
    blank(code, from, to);
  };

  let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    const lineComment = /^--[^\n]*/u.exec(rest);
    if (lineComment) {
      blank(code, index, index + lineComment[0].length);
      index += lineComment[0].length;
      continue;
    }
    if (rest.startsWith('/*')) {
      let depth = 1;
      let at = index + 2;
      while (at < sql.length && depth > 0) {
        if (sql.startsWith('/*', at)) { depth += 1; at += 2; }
        else if (sql.startsWith('*/', at)) { depth -= 1; at += 2; }
        else at += 1;
      }
      blank(code, index, at);
      index = at;
      continue;
    }
    const dollarOpen = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u.exec(rest);
    if (dollarOpen) {
      const tag = dollarOpen[0];
      const close = sql.indexOf(tag, index + tag.length);
      const contentEnd = close < 0 ? sql.length : close;
      keepAsLiteral(index + tag.length, contentEnd);
      blank(code, index, index + tag.length);
      blank(code, contentEnd, contentEnd + tag.length);
      index = close < 0 ? sql.length : close + tag.length;
      continue;
    }
    if (rest[0] === "'") {
      let at = index + 1;
      while (at < sql.length) {
        if (sql[at] === "'" && sql[at + 1] === "'") { at += 2; continue; }
        if (sql[at] === "'") { at += 1; break; }
        at += 1;
      }
      keepAsLiteral(index + 1, at - 1);
      blank(code, index, index + 1);
      blank(code, at - 1, at);
      index = at;
      continue;
    }
    index += 1;
  }
  return { code: code.join(''), literal: literal.join('') };
}

/**
 * Statement boundaries: file start, after `;`, after a newline (SQL here is written one statement
 * per line), and after a quote — `EXECUTE 'GRANT …'` starts a statement inside a literal.
 */
const STATEMENT_BOUNDARY = new Set([';', '\n', "'"]);

function statementStarts(text) {
  const starts = new Set();
  let at = 0;
  while (at < text.length && /\s/.test(text[at])) at += 1;
  if (at < text.length) starts.add(at);
  for (let index = 0; index < text.length; index += 1) {
    if (!STATEMENT_BOUNDARY.has(text[index])) continue;
    let next = index + 1;
    while (next < text.length && /\s/.test(text[next])) next += 1;
    if (next < text.length) starts.add(next);
  }
  return [...starts].sort((a, b) => a - b);
}

function matchesAt(text, start) {
  for (const { what, pattern } of PRIVILEGE_STATEMENTS) {
    pattern.lastIndex = start;
    if (pattern.test(text)) return what;
  }
  return null;
}

function excerpt(text, start) {
  return text.slice(start, start + 120).split('\n')[0].trim();
}

function scan(text, suffix, lineOf, found) {
  for (const start of statementStarts(text)) {
    const what = matchesAt(text, start);
    if (!what) continue;
    found.push({ what: what + suffix, line: lineOf(start), statement: excerpt(text, start) });
  }
  for (const { what, pattern } of PRIVILEGE_CLAUSES) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      found.push({ what: what + suffix, line: lineOf(match.index), statement: excerpt(text, match.index) });
    }
  }
}

/** Every privilege statement in one migration file, as {what, line, statement}. */
export function findPrivilegeStatements(sql) {
  const { code, literal } = splitSql(sql);
  const found = [];
  const lineOf = (offset) => sql.slice(0, offset).split('\n').length;
  scan(code, '', lineOf, found);
  scan(literal, ' (inside a string literal)', lineOf, found);
  return found.sort((a, b) => a.line - b.line);
}

function migrationFiles() {
  const files = [];
  const walk = (absolute) => {
    for (const entry of readdirSync(absolute).sort()) {
      const child = join(absolute, entry);
      if (statSync(child).isDirectory()) walk(child);
      else if (entry.endsWith('.sql')) files.push(child);
    }
  };
  for (const folder of MIGRATION_FOLDERS) {
    const absolute = join(repoRoot, folder);
    try {
      if (!statSync(absolute).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(absolute);
  }
  return files;
}

const GOOD_FIXTURE = `-- BCB-MIGRATION-OWNER: app_seam_example_owner
-- A migration only creates and changes objects. No GRANT, no REVOKE.
-- REVOKE ALL ON FUNCTION app.example() FROM PUBLIC; -- lives in the generator, not here
CREATE OR REPLACE FUNCTION app.example() RETURNS text LANGUAGE sql AS $function$
  SELECT 'the word grant in a literal is prose, not a statement'
$function$;
COMMENT ON FUNCTION app.example() IS 'Grants nothing; revokes nothing.';
`;

const BAD_FIXTURES = [
  ['plain revoke', 'REVOKE ALL ON FUNCTION app.example() FROM PUBLIC;\n', 'REVOKE'],
  ['plain grant', 'GRANT EXECUTE ON FUNCTION app.example() TO app_staff;\n', 'GRANT'],
  ['default privileges', 'ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;\n', 'ALTER DEFAULT PRIVILEGES'],
  ['role ddl', 'CREATE ROLE app_new_seam_owner NOLOGIN;\n', 'role DDL'],
  ['policy ddl', 'CREATE POLICY tenant_read ON public.things FOR SELECT USING (true);\n', 'policy DDL'],
  ['rls flag', 'ALTER TABLE public.things ENABLE ROW LEVEL SECURITY;\n', 'row level security'],
  [
    'grant smuggled through EXECUTE',
    "DO $bcb$ BEGIN\n  EXECUTE 'GRANT EXECUTE ON FUNCTION app.example() TO app_staff';\nEND $bcb$;\n",
    'GRANT (inside a string literal)',
  ],
];

function selfTest() {
  const goodFindings = findPrivilegeStatements(GOOD_FIXTURE);
  if (goodFindings.length !== 0) {
    console.error('check-migration-privileges: self-test good fixture went red', goodFindings);
    process.exit(1);
  }
  for (const [name, sql, expected] of BAD_FIXTURES) {
    const findings = findPrivilegeStatements(sql);
    if (findings.length !== 1 || findings[0].what !== expected) {
      console.error(`check-migration-privileges: self-test "${name}" did not go red as ${expected}`, findings);
      process.exit(1);
    }
  }
  const live = migrationFiles().flatMap((file) => findPrivilegeStatements(readFileSync(file, 'utf8')));
  if (live.length !== 0) {
    console.error('check-migration-privileges: self-test found live migrations still carrying privileges', live);
    process.exit(1);
  }
  console.log(`check-migration-privileges: self-test OK (${BAD_FIXTURES.length} red fixtures, 1 green fixture)`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const violations = [];
const files = migrationFiles();
for (const file of files) {
  for (const finding of findPrivilegeStatements(readFileSync(file, 'utf8'))) {
    violations.push({ file: relative(repoRoot, file), ...finding });
  }
}

if (violations.length > 0) {
  console.error('check-migration-privileges: migration files change privileges:');
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}: ${violation.what} — ${violation.statement}`);
  }
  console.error('');
  console.error('AGENTS.md §1 «Миграция не выдаёт и не отзывает права. Никогда».');
  console.error('Declare the state in deploy/postgres/privileges/declaration.ts; reconcile applies it.');
  process.exit(1);
}

console.log(`check-migration-privileges: OK (${files.length} migration files)`);
