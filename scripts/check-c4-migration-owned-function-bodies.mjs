#!/usr/bin/env node
/**
 * Repo-managed privilege overlays must not recreate bodies of functions owned by the drizzle
 * migration ledger. Those bodies change with product migrations; the overlays are re-applied after
 * every migrate, so a stale CREATE OR REPLACE silently reverts fixes on deploy — and nothing
 * compares the two copies, so the revert is invisible until the behaviour is missing in production.
 *
 * Pattern: migration owns CREATE OR REPLACE; the overlay owns ALTER FUNCTION / REVOKE / GRANT only
 * (as with app.open_or_touch_operator_incident in deploy/postgres/c4-operational-runtime.sql and
 * app.report_saas_isolation_event in deploy/postgres/saas-isolation-telemetry.sql).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Overlay → function names whose bodies belong to the migration ledger and must not appear in it.
 */
const MIGRATION_OWNED_FUNCTION_NAMES_BY_OVERLAY = {
  'deploy/postgres/c4-operational-runtime.sql': [
    'app.resolve_outgoing_delivery_scope',
    'app.list_scheduler_reminder_organization_ids',
    'app.read_media_worker_runtime_setting',
    'app.open_or_touch_operator_incident',
    'app.read_integrator_platform_integration_availability',
    'app.record_operator_delivery_attempt',
    'app.release_principal_context',
  ],
  'deploy/postgres/saas-isolation-telemetry.sql': ['app.report_saas_isolation_event'],
};

function findMigrationOwnedBodies(sql, functionNames) {
  const violations = [];
  for (const name of functionNames) {
    const pattern = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${name}\\b`, 'i');
    if (pattern.test(sql)) {
      violations.push(name);
    }
  }
  return violations;
}

function scanOverlays() {
  const findings = [];
  for (const [overlayPath, functionNames] of Object.entries(
    MIGRATION_OWNED_FUNCTION_NAMES_BY_OVERLAY,
  )) {
    const sql = readFileSync(`${repoRoot}${overlayPath}`, 'utf8');
    for (const name of findMigrationOwnedBodies(sql, functionNames)) {
      findings.push({ overlayPath, name });
    }
  }
  return findings;
}

function runSelfTest() {
  const allNames = Object.values(MIGRATION_OWNED_FUNCTION_NAMES_BY_OVERLAY).flat();
  const badSql =
    'CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid) RETURNS TABLE(queue_kind text)';
  const goodSql =
    '-- app.resolve_outgoing_delivery_scope is owned by the drizzle migration ledger\nALTER FUNCTION app.resolve_outgoing_delivery_scope(uuid) OWNER TO app_owner;';

  const badViolations = findMigrationOwnedBodies(badSql, allNames);
  const goodViolations = findMigrationOwnedBodies(goodSql, allNames);

  if (badViolations.length !== 1 || badViolations[0] !== 'app.resolve_outgoing_delivery_scope') {
    console.error('check-c4-migration-owned-function-bodies: self-test bad fixture failed', badViolations);
    process.exit(1);
  }
  if (goodViolations.length !== 0) {
    console.error('check-c4-migration-owned-function-bodies: self-test good fixture failed', goodViolations);
    process.exit(1);
  }

  // Every guarded function must actually be delivered by the migration ledger, or the rule above
  // would "pass" by guarding a body that no longer exists anywhere.
  const telemetryOverlaySql = readFileSync(
    `${repoRoot}deploy/postgres/saas-isolation-telemetry.sql`,
    'utf8',
  );
  if (!/ALTER FUNCTION app\.report_saas_isolation_event\(/.test(telemetryOverlaySql)) {
    console.error(
      'check-c4-migration-owned-function-bodies: self-test expected the telemetry overlay to still own ownership/grants for app.report_saas_isolation_event',
    );
    process.exit(1);
  }

  const liveViolations = scanOverlays();
  if (liveViolations.length !== 0) {
    console.error(
      'check-c4-migration-owned-function-bodies: self-test live overlays still recreate bodies:',
      liveViolations.map(({ overlayPath, name }) => `${overlayPath}:${name}`),
    );
    process.exit(1);
  }

  console.log('check-c4-migration-owned-function-bodies: self-test OK');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const violations = scanOverlays();
if (violations.length > 0) {
  for (const { overlayPath, name } of violations) {
    console.error(
      `check-c4-migration-owned-function-bodies: ${overlayPath} recreates migration-owned function body: ${name}`,
    );
  }
  console.error(
    'Keep only ALTER FUNCTION / REVOKE / GRANT for these in the overlay; the drizzle migration owns the body.',
  );
  process.exit(1);
}

console.log('check-c4-migration-owned-function-bodies: OK');
