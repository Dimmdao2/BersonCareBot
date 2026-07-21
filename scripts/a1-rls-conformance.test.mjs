import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const verifier = read('scripts/verify-a1-rls-conformance.mjs');
const runner = read('apps/webapp/scripts/run-a1-rls-conformance.ts');
const fixture = read('docs/ARCHITECTURE/DB_DUMPS/a1-rls/seed.sql');
const missingContextDenial = read('docs/ARCHITECTURE/DB_DUMPS/a1-rls/missing-context-denial.sql');
const forceCutover = read('deploy/postgres/phase4-force-rls-cutover.sql');
const workflow = read('.github/workflows/ci.yml');
const packageJson = JSON.parse(read('package.json'));

test('A1 uses the canonical A0 baseline, role/context policy artifacts and real webapp query boundary', () => {
  for (const fragment of [
    'validatePackage()',
    'scripts/migrate-all.sh',
    'p0-5b-role-split-staff-patient.sql',
    'p2-b-protected-principal-context.sql',
    'p0-5b-grants.sql',
    'phase4-locked-helper-rls-policies.sql',
    'ALTER TABLE public.be_appointments FORCE ROW LEVEL SECURITY',
  ]) {
    assert.ok(verifier.includes(fragment), `missing A1 canonical fragment: ${fragment}`);
  }
  assert.ok(runner.includes('createWebappPoolProvider'));
  assert.ok(runner.includes('runWithDbStaffPrincipal'));
  assert.ok(runner.includes('runWithDbPatientPrincipal'));
  assert.ok(forceCutover.includes(`('"public"."be_appointments"')`));
});

test('A1 evidence is non-owner and covers own, cross-org and missing-principal paths', () => {
  assert.ok(!runner.includes('bcb_a0_owner'));
  assert.ok(verifier.includes('postgresql://${staffLoginRole}'));
  assert.ok(verifier.includes('postgresql://${nonstaffLoginRole}'));
  assert.ok(runner.includes('foreignAppointmentId'));
  assert.ok(runner.includes('assert.rejects'));
  assert.ok(runner.includes('context_org'));
  assert.ok(runner.includes('context_patient'));
});

test('A1 proves literal DB-layer denial without a signed principal context on both fresh base logins', () => {
  for (const fragment of [
    'SET ROLE :"a1_expected_runtime_role"',
    "session_user = :'a1_expected_login_role'",
    'app.current_org_id() IS NULL',
    'app.current_patient_user_id() IS NULL',
    'app.current_integrator_user_id() IS NULL',
    "row_security_active('public.be_appointments'::regclass)",
    'SELECT count(*) INTO visible_rows FROM public.be_appointments',
    'WHEN insufficient_privilege THEN',
    "RAISE EXCEPTION 'a1_missing_context_exposed_rows:%'",
  ]) {
    assert.ok(
      missingContextDenial.includes(fragment),
      `missing literal DB-layer proof fragment: ${fragment}`,
    );
  }
  assert.match(
    verifier,
    /psqlFileAs\(\s*staffLoginRole,\s*databaseName,\s*missingContextDenialPath,\s*'unsigned_staff_db_layer_denial'/u,
  );
  assert.match(
    verifier,
    /psqlFileAs\(\s*nonstaffLoginRole,\s*databaseName,\s*missingContextDenialPath,\s*'unsigned_patient_db_layer_denial'/u,
  );
});

test('A1 fixture is deterministic and PII-free', () => {
  const emails = fixture.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
  assert.ok(emails.length > 0);
  assert.ok(emails.every((email) => email.toLowerCase().endsWith('@baseline.test')));
  assert.ok(!/['"]\+[1-9][0-9]{9,14}['"]/u.test(fixture));
  assert.ok(!/postgres(?:ql)?:\/\/[^\s'";]+/iu.test(fixture));
});

test('A1 is a dedicated serialized CI gate, not folded into every generic test shard', () => {
  assert.match(workflow, /saas-rls-conformance:\n\s+name: SaaS RLS conformance/u);
  assert.match(workflow, /timeout-minutes: 15/u);
  assert.match(workflow, /run: pnpm run check:saas-a1-rls-conformance/u);
  assert.equal(
    packageJson.scripts['check:saas-a1-rls-conformance'],
    'node --test scripts/a1-rls-conformance.test.mjs && node scripts/verify-a1-rls-conformance.mjs',
  );
});
