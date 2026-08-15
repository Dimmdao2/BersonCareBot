#!/usr/bin/env node
/**
 * C4 operational-runtime overlay must not recreate bodies of functions owned by the drizzle
 * migration ledger. Those bodies change with product migrations; reapply_c4_operational_runtime_overlays
 * runs after every migrate and a stale CREATE OR REPLACE silently reverts fixes on deploy.
 *
 * Pattern: migration owns CREATE OR REPLACE; c4 owns ALTER FUNCTION / REVOKE / GRANT only
 * (same as app.open_or_touch_operator_incident in deploy/postgres/c4-operational-runtime.sql).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const c4Path = `${repoRoot}/deploy/postgres/c4-operational-runtime.sql`;

/** Function name prefixes whose bodies must not appear in the C4 overlay. */
const MIGRATION_OWNED_FUNCTION_NAMES = [
  'app.resolve_outgoing_delivery_scope',
  'app.list_scheduler_reminder_organization_ids',
  'app.read_media_worker_runtime_setting',
  'app.open_or_touch_operator_incident',
  'app.read_integrator_platform_integration_availability',
  'app.record_operator_delivery_attempt',
  'app.release_principal_context',
];

function findMigrationOwnedBodiesInC4(sql) {
  const violations = [];
  for (const name of MIGRATION_OWNED_FUNCTION_NAMES) {
    const pattern = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${name}\\b`, 'i');
    if (pattern.test(sql)) {
      violations.push(name);
    }
  }
  return violations;
}

function runSelfTest() {
  const badSql =
    'CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid) RETURNS TABLE(queue_kind text)';
  const goodSql =
    '-- app.resolve_outgoing_delivery_scope is owned by the drizzle migration ledger\nALTER FUNCTION app.resolve_outgoing_delivery_scope(uuid) OWNER TO app_owner;';

  const badViolations = findMigrationOwnedBodiesInC4(badSql);
  const goodViolations = findMigrationOwnedBodiesInC4(goodSql);

  if (badViolations.length !== 1 || badViolations[0] !== 'app.resolve_outgoing_delivery_scope') {
    console.error('check-c4-migration-owned-function-bodies: self-test bad fixture failed', badViolations);
    process.exit(1);
  }
  if (goodViolations.length !== 0) {
    console.error('check-c4-migration-owned-function-bodies: self-test good fixture failed', goodViolations);
    process.exit(1);
  }

  const liveViolations = findMigrationOwnedBodiesInC4(readFileSync(c4Path, 'utf8'));
  if (liveViolations.length !== 0) {
    console.error(
      'check-c4-migration-owned-function-bodies: self-test live c4 file still recreates bodies:',
      liveViolations,
    );
    process.exit(1);
  }

  console.log('check-c4-migration-owned-function-bodies: self-test OK');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const violations = findMigrationOwnedBodiesInC4(readFileSync(c4Path, 'utf8'));
if (violations.length > 0) {
  console.error(
    'check-c4-migration-owned-function-bodies: C4 overlay recreates migration-owned function bodies:',
    violations.join(', '),
  );
  console.error(
    'Keep only ALTER FUNCTION / REVOKE / GRANT for these in deploy/postgres/c4-operational-runtime.sql',
  );
  process.exit(1);
}

console.log('check-c4-migration-owned-function-bodies: OK');
