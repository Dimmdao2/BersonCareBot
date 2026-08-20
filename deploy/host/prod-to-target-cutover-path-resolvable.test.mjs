// Guards the exact regression class that produced FAIL-B (audit AUDIT_RESTORE_AB_2026-08-20):
// a step on the full-reset TEST path was silently deleted from the tree, yet every existing test
// stayed green because deploy-test-full-reset.test.mjs stubs the engine and never resolves the real
// `\ir` include graph or the port-context script's external artifacts. This test proves, statically
// (no database, no live run — allowed by the branch-consolidation freeze), that the full-reset path
// still reaches the end: every `\ir` include transitively resolves and every repo-relative artifact
// the port-context cutover depends on exists. If a restored file is dropped again, this goes red.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');

// The two `\ir` roots the engine feeds to psql on the full-reset path, read from the engine itself
// (deploy-test-saas.sh) so this test tracks the real entrypoints rather than a hand-copied list.
const engine = readFileSync(resolve(repoRoot, 'deploy/host/deploy-test-saas.sh'), 'utf8');
function engineVar(name) {
  const match = new RegExp(`^${name}=(\\S+)`, 'mu').exec(engine);
  assert.ok(match, `deploy-test-saas.sh no longer defines ${name}; update this path guard`);
  return match[1];
}
const irRoots = [engineVar('PRE_CUTOVER_DATA_ASSERTIONS'), engineVar('CUTOVER_MIGRATION')];

// Transitively resolve every `\ir` include. psql resolves `\ir` relative to the including file's
// directory, so the walk mirrors that exactly.
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
      const childRel = relative(repoRoot, resolve(dirname(abs), match[1]));
      stack.push(childRel);
    }
  }
  return { seen, missing };
}

test('every \\ir include on the full-reset cutover path resolves', () => {
  for (const root of irRoots) {
    const { seen, missing } = collectIncludes(root);
    assert.deepEqual(missing, [], `unresolved \\ir include(s) reachable from ${root}: ${missing.join(', ')}`);
    // Sanity: the sequencer must actually pull in the generated schema dumps, not just its own shell.
    assert.ok(seen.size >= 1);
  }
  // The known generated dumps must be among the resolved set — a deletion that also removed the
  // parent sequencer would otherwise make `missing` empty and hide the regression.
  const { seen } = collectIncludes('deploy/postgres/prod-to-target-cutover.sql');
  for (const required of [
    'deploy/postgres/generated/prod-to-target/schema-pre.sql',
    'deploy/postgres/generated/prod-to-target/schema-post.sql',
    'deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql',
    'deploy/postgres/generated/prod-to-target/runtime-settings.sql',
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

  // Parse the artifacts the script's own existence guard iterates, so the test follows the script.
  const guard = /^for path in (.+); do$/mu.exec(script);
  assert.ok(guard, `${rel} no longer has the artifact existence guard loop`);
  const guarded = new Set([...guard[1].matchAll(/"\$(\w+)"/gu)].map((match) => match[1]));

  // Only the repo-relative artifacts are checkable here; $api_env/$webapp_env are runtime host paths.
  const assignments = [...script.matchAll(/^(\w+)="\$repo_root\/([^"]+)"$/gmu)];
  const checked = [];
  for (const [, name, artifactRel] of assignments) {
    if (!guarded.has(name)) continue;
    checked.push(name);
    assert.ok(existsSync(resolve(repoRoot, artifactRel)), `${rel} references missing artifact ${artifactRel}`);
  }
  // The install target now runs generate-cli + reconcile-access; both must be among the guarded set.
  assert.ok(checked.includes('generator') && checked.includes('reconcile'),
    `expected generator+reconcile among guarded artifacts, got: ${checked.join(', ')}`);

  // Regression guard: the deleted, structurally-incompatible primitive must not creep back in — its
  // dependencies (post-zero-roots.sql, generated/zero-state.*, --zero-state* flags) no longer exist,
  // so any executable reference would silently un-run the path again. Comment lines that merely
  // explain the removal are allowed (and are the reason we strip comments before checking).
  const executable = script
    .split(/\r?\n/u)
    .filter((line) => !/^\s*#/u.test(line))
    .join('\n');
  assert.ok(!/initial-cutover\.mjs/u.test(executable),
    `${rel} has an executable reference to the deleted privileges/initial-cutover.mjs; the path would not run`);
});
