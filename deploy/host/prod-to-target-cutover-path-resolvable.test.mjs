// Guards two regression classes on the public full-reset TEST path, statically and by live trace
// (no database, no destructive run):
//
//  1. FAIL-B (audit AUDIT_RESTORE_AB_2026-08-20): a step reachable from the wrapper was silently deleted
//     from the tree, yet every existing test stayed green because deploy-test-full-reset.test.mjs stubs the
//     engine and never resolves the real `\ir` include graph or the port-context script's artifacts.
//  2. #1085 (audit RUNTIME_OVERLAY_CURRENT_STATE_AUDIT_2026-09-02): the engine described one post-migration
//     closure and executed another. The described one — run_strict_post_migration_closure() plus
//     runtime-overlay-rehydrate-lib.sh's ordered SQL list — was reachable only through an orphaned CLI flag,
//     required the retired `app_owner` role, and re-created 44 objects that schema B already ships. It is
//     removed; these tests hold the boundary that let it exist: the SQL the engine actually executes after
//     the A→B cutover must be current-state ACL/data only, and the closure the public wrapper reaches must
//     be the declaration-owned one (generate-cli + reconcile-access), proven by running it under stubs.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const enginePath = resolve(repoRoot, 'deploy/host/deploy-test-saas.sh');
const engine = readFileSync(enginePath, 'utf8');

function engineVar(name, source = engine) {
  const match = new RegExp(`^${name}=(\\S+)`, 'mu').exec(source);
  assert.ok(match, `deploy-test-saas.sh no longer defines ${name}; update this path guard`);
  return match[1];
}

// Every repo SQL file the engine hands to psql, in the order the engine names it. Read from the engine
// itself (`"$DEPLOY_REPO/$VAR"` / `"$SRC_REPO/$VAR"` argument sites) rather than a hand-copied keep-set, so
// a newly wired file is covered without touching this test — the frozen-list failure class K7 of the audit.
function executedSqlRoots(source = engine) {
  const roots = [];
  for (const match of source.matchAll(/"\$(?:DEPLOY_REPO|SRC_REPO)\/\$([A-Z0-9_]+)"/gu)) {
    const value = engineVar(match[1], source);
    if (!value.endsWith('.sql') || roots.some((entry) => entry.variable === match[1])) continue;
    roots.push({ variable: match[1], path: value, at: match.index ?? 0 });
  }
  assert.ok(roots.length >= 4, `expected the engine to execute several SQL roots, found ${roots.length}`);
  return roots;
}

// psql resolves `\ir` relative to the including file's directory; the walk mirrors that exactly.
function collectIncludes(startRel) {
  const seen = new Set();
  const missing = [];
  const stack = [startRel];
  while (stack.length > 0) {
    const rel = stack.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = resolve(repoRoot, rel);
    if (!existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    for (const line of readFileSync(abs, 'utf8').split(/\r?\n/u)) {
      const match = /^\s*\\ir\s+(\S+)/u.exec(line);
      if (!match) continue;
      stack.push(relative(repoRoot, resolve(dirname(abs), match[1])));
    }
  }
  return { seen, missing };
}

test('every \\ir include reachable from the executed full-reset SQL resolves', () => {
  for (const root of executedSqlRoots()) {
    const { seen, missing } = collectIncludes(root.path);
    assert.deepEqual(missing, [], `unresolved \\ir include(s) reachable from ${root.path}: ${missing.join(', ')}`);
    assert.ok(seen.size >= 1);
  }
  // A deletion that also removed the parent sequencer would otherwise leave `missing` empty and hide it.
  const { seen } = collectIncludes('deploy/postgres/prod-to-target-cutover.sql');
  for (const required of [
    'deploy/postgres/generated/prod-to-target/schema-pre.sql',
    'deploy/postgres/generated/prod-to-target/schema-post.sql',
    'deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql',
    'deploy/postgres/prod-to-target-cutover-start.sql',
    'deploy/postgres/prod-to-target-cutover-data.sql',
    'deploy/postgres/prod-to-target-cutover-finish.sql',
  ]) {
    assert.ok(seen.has(required), `cutover sequencer no longer includes ${required}`);
  }
});

test('port-context cutover external artifacts exist and the deleted primitive is not referenced', () => {
  const rel = 'deploy/host/cutover-postgres-port-context.sh';
  const script = readFileSync(resolve(repoRoot, rel), 'utf8');

  const guard = /^for path in (.+); do$/mu.exec(script);
  assert.ok(guard, `${rel} no longer has the artifact existence guard loop`);
  const guarded = new Set([...guard[1].matchAll(/"\$(\w+)"/gu)].map((match) => match[1]));

  // Only the repo-relative artifacts are checkable here; $api_env/$webapp_env are runtime host paths.
  const checked = [];
  for (const [, name, artifactRel] of script.matchAll(/^(\w+)="\$repo_root\/([^"]+)"$/gmu)) {
    if (!guarded.has(name)) continue;
    checked.push(name);
    assert.ok(existsSync(resolve(repoRoot, artifactRel)), `${rel} references missing artifact ${artifactRel}`);
  }
  // The install target runs generate-cli + reconcile-access: this is the one declaration-owned closure.
  assert.ok(checked.includes('generator') && checked.includes('reconcile'),
    `expected generator+reconcile among guarded artifacts, got: ${checked.join(', ')}`);

  const executable = script.split(/\r?\n/u).filter((line) => !/^\s*#/u.test(line)).join('\n');
  assert.ok(!/initial-cutover\.mjs/u.test(executable),
    `${rel} has an executable reference to the deleted privileges/initial-cutover.mjs; the path would not run`);
});

// ── #1085: current-state boundary of the SQL the engine actually executes ────────────────────────────────
//
// Schema B (deploy/postgres/generated/prod-to-target/schema-*.sql) plus active forward migrations are the
// only authority for object definitions (AGENTS.md §1 "Миграции schema B"). Anything the engine runs AFTER
// the A→B cutover may therefore reconcile data or ACLs, but must not (re)create a schema object: a
// `CREATE OR REPLACE` silently overwrites B's current definition and a plain `CREATE` is a deterministic
// duplicate failure. The declaration (deploy/postgres/privileges/) is likewise the only writer of
// owners/grants/policies, so no executed file may name the retired `app_owner` role at all.
const OBJECT_BODY = /^\s*CREATE(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|PROCEDURE|TABLE|VIEW|MATERIALIZED\s+VIEW)\b/imu;
const OBJECT_BODY_GLOBAL = new RegExp(OBJECT_BODY.source, 'gimu');

function postCutoverExecutedFiles(source = engine) {
  const cutover = engineVar('CUTOVER_MIGRATION', source);
  const roots = executedSqlRoots(source);
  const cutoverRoot = roots.find((root) => root.path === cutover);
  assert.ok(cutoverRoot, 'the engine no longer executes the A→B cutover migration');
  const files = new Set();
  for (const root of roots) {
    if (root.at <= cutoverRoot.at) continue;
    for (const rel of collectIncludes(root.path).seen) files.add(rel);
  }
  return [...files].sort();
}

test('no executed full-reset SQL names the retired app_owner role', () => {
  const offenders = [];
  for (const root of executedSqlRoots()) {
    for (const rel of collectIncludes(root.path).seen) {
      const abs = resolve(repoRoot, rel);
      if (!existsSync(abs)) continue;
      if (/\bapp_owner\b/u.test(readFileSync(abs, 'utf8'))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [],
    `app_owner is retired (NOLOGIN NOBYPASSRLS NOINHERIT, zero members, zero DB-local objects); `
    + `these executed files still name it: ${offenders.join(', ')}`);
});

test('post-cutover executed SQL creates no schema object outside schema B', () => {
  const files = postCutoverExecutedFiles();
  assert.ok(files.length >= 1, 'the engine no longer executes anything after the A→B cutover');
  const offenders = [];
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    for (const statement of text.match(OBJECT_BODY_GLOBAL) ?? []) {
      const line = text.split(/\r?\n/u).find((candidate) => candidate.includes(statement.trim())) ?? statement;
      offenders.push(`${rel}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [],
    `schema B plus forward migrations own object definitions; these post-cutover statements re-create one:\n`
    + offenders.join('\n'));
});

test('TEST settings override preserves the schema-B lock and limits trigger bypasses', () => {
  const rel = 'deploy/postgres/test-settings-override.sql';
  const text = readFileSync(resolve(repoRoot, rel), 'utf8');
  assert.ok(!/\b(?:DROP|CREATE)\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?system_settings_test_lock\b/iu.test(text),
    `${rel} must not remove or recreate the schema-B lock trigger`);
  assert.match(text, /tgname\s*=\s*'system_settings_test_lock'[\s\S]*tgenabled\s*=\s*'O'/u,
    `${rel} must fail closed unless the declared lock is installed and enabled`);
  const bypasses = text.match(/SET LOCAL session_replication_role = replica;/gu) ?? [];
  const restores = text.match(/SET LOCAL session_replication_role = origin;/gu) ?? [];
  assert.ok(bypasses.length > 0, `${rel} no longer has a bounded way to update protected TEST rows`);
  assert.equal(restores.length, bypasses.length,
    `${rel} must restore ordinary trigger execution immediately after every protected-row block`);
});

test('the retired second closure is not reachable from the engine', () => {
  const executable = engine.split(/\r?\n/u).filter((line) => !/^\s*#/u.test(line)).join('\n');
  for (const symbol of [
    'run_strict_post_migration_closure',
    'rehydrate_post_restore_runtime_overlays',
    'runtime_overlay_apply_post_migration_chain',
    '--post-migration-closure',
  ]) {
    assert.ok(!executable.includes(symbol),
      `${symbol} is executable again: the second, app_owner-dependent closure must not come back (#1085)`);
  }
  assert.ok(!existsSync(resolve(repoRoot, 'deploy/host/runtime-overlay-rehydrate-lib.sh')),
    'runtime-overlay-rehydrate-lib.sh is back; its ordered list is the retired second writer');
});

// ── #1085: the closure the public path reaches, proven by running it ─────────────────────────────────────
//
// This is a trace, not a source-text assertion: the engine's post-migration access closure really runs,
// with every host command replaced by a recorder, and the recorded order is checked. F1 was exactly an
// order/reachability defect, so only an order/reachability oracle can catch it.
function stubHost(root) {
  const bin = resolve(root, 'bin');
  mkdirSync(bin, { recursive: true });
  const log = resolve(root, 'trace.log');
  const state = resolve(root, 'restarted');
  const write = (name, body) => {
    writeFileSync(resolve(bin, name), `#!/bin/bash\n${body}\n`);
    chmodSync(resolve(bin, name), 0o755);
  };
  write('systemctl', `printf 'systemctl %s\\n' "$*" >> "${log}"
case "$1" in
  is-active) [ -f "${state}" ] ;;
  restart) : > "${state}" ;;
  show) printf '' ;;
  *) : ;;
esac`);
  // sudo records the full command and then re-dispatches it through the stub PATH, so a privileged
  // `sudo systemctl restart` moves the same unit state an unprivileged call would.
  write('sudo', `printf 'sudo %s\\n' "$*" >> "${log}"
while [ $# -gt 0 ]; do
  case "$1" in
    -n) shift ;;
    -u) shift 2 ;;
    *) break ;;
  esac
done
case "\${1:-}" in
  systemctl) exec systemctl "\${@:2}" ;;
esac
exit 0`);
  write('psql', `printf 'psql %s\\n' "$*" >> "${log}"`);
  write('bash', `printf 'bash %s\\n' "$*" >> "${log}"`);
  write('install', `printf 'install %s\\n' "$*" >> "${log}"`);
  write('curl', `printf 'curl %s\\n' "$*" >> "${log}"\nprintf '{"ok":true,"db":"up"}'`);
  write('sleep', 'exit 0');
  return { bin, log };
}

function traceAccessClosure(engineFile) {
  const root = mkdtempSync(resolve(tmpdir(), 'bcb-closure-trace-'));
  const { bin, log } = stubHost(root);
  const result = spawnSync('/bin/bash', [engineFile, '--port-context-post-migration-cutover'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
  });
  return { result, trace: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [] };
}

function assertDeclarationClosureRunsBeforeRelease(trace) {
  const indexOf = (needle) => trace.findIndex((line) => line.includes(needle));
  const closure = indexOf('cutover-postgres-port-context.sh');
  assert.notEqual(closure, -1,
    'the post-migration access closure never ran cutover-postgres-port-context.sh (generate-cli + '
    + 'reconcile-access): the public path would release TEST without installing declared access');
  const restart = trace.findIndex((line) => /systemctl restart bersoncarebot-/u.test(line));
  const health = indexOf('/api/health');
  assert.notEqual(restart, -1, 'no TEST unit restart was traced');
  assert.notEqual(health, -1, 'no health probe was traced');
  assert.ok(closure < restart, 'declared access must be installed before any TEST writer is restarted');
  assert.ok(restart < health, 'health must be probed after the restart, not before');
}

test('the public post-migration access closure installs declared access before releasing TEST', () => {
  const { result, trace } = traceAccessClosure(enginePath);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assertDeclarationClosureRunsBeforeRelease(trace);
  // The same closure must not apply any retired runtime overlay on its way.
  for (const line of trace) {
    assert.ok(!/-f .*(?:organization-member-invites-rls|patient-invites-rls|e1-webapp-runtime-config|test-strict-rls-finalizer)/u.test(line),
      `retired runtime overlay applied inside the access closure: ${line}`);
  }
});

test('the default full-reset path ends in that same access closure, not a second one', () => {
  // The destructive default path cannot be traced (it restores a prod dump), so its wiring is checked
  // against the engine's executable text: it must invoke exactly the function the trace above exercised.
  const executable = engine.split(/\r?\n/u).filter((line) => !/^\s*#/u.test(line));
  // Un-indented = the top-level default path's own tail; the indented one is the CLI mode the trace above
  // exercised. Both must resolve to the same function, and there must be exactly one of each.
  const topLevel = executable.filter((line) => /^run_port_context_test_release$/u.test(line));
  const cliMode = executable.filter((line) => /^\s+run_port_context_test_release$/u.test(line));
  assert.equal(topLevel.length, 1,
    'the default full-reset path must end in run_port_context_test_release exactly once at top level');
  assert.equal(cliMode.length, 1,
    '--port-context-post-migration-cutover must dispatch to the same closure the default path uses');
  const closureCalls = executable.filter((line) => /^\s*run_[a-z_]*closure[a-z_]*\b/u.test(line));
  assert.deepEqual(closureCalls, [],
    `a second post-migration closure is wired again: ${closureCalls.join(' | ')}`);
});

// ── fault injections: each oracle above must actually go red for the class it claims to catch ────────────

test('fault injection: dropping the closure call from the public path is caught', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'bcb-closure-fault-'));
  const broken = resolve(root, 'deploy-test-saas.sh');
  const withoutClosure = engine.replace(
    / {2}sudo bash "\$DEPLOY_REPO\/deploy\/host\/cutover-postgres-port-context\.sh" \\\n(?:.*\\\n)*.*\n/u,
    '  :\n',
  );
  assert.notEqual(withoutClosure, engine, 'fault injection did not modify the engine; update the pattern');
  writeFileSync(broken, withoutClosure);
  const { trace } = traceAccessClosure(broken);
  assert.throws(() => assertDeclarationClosureRunsBeforeRelease(trace), /never ran cutover-postgres-port-context/u);
});

test('fault injection: a retired-owner or object body reintroduced after the cutover is caught', () => {
  const target = resolve(repoRoot, 'deploy/postgres/test-settings-override.sql');
  const text = readFileSync(target, 'utf8');
  const injected = `${text}\nCREATE OR REPLACE FUNCTION app.reintroduced_after_b() RETURNS void LANGUAGE sql AS $$SELECT$$;\nALTER FUNCTION app.reintroduced_after_b() OWNER TO app_owner;\n`;
  const bodies = injected.match(OBJECT_BODY_GLOBAL) ?? [];
  assert.ok(bodies.length > 0, 'object-body oracle did not see the injected statement');
  assert.match(injected, /\bapp_owner\b/u, 'retired-owner oracle did not see the injected statement');
  // The unmodified file must not match either class, so the two oracles above are not vacuously true.
  assert.ok(!/\bapp_owner\b/u.test(text), 'test-settings-override.sql already names the retired role');
});
