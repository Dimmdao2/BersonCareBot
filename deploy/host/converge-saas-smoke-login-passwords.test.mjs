import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertSmokeLoginAccountFact,
  hashSmokeLoginPassword,
  passwordIdentifierRateLimitKey,
  smokeLoginAccountsFromPacket,
  verifySmokeLoginPassword,
} from '../../apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs';
import { parseSmokeLoginPacket } from './smoke-login-packet.mjs';

const packetText = [
  'SAAS_SMOKE_LOGIN_ENABLED="1"',
  'SAAS_SMOKE_DOCTOR_EMAIL="doctor@example.test"',
  'SAAS_SMOKE_DOCTOR_PASSWORD="doctor-password"',
  'SAAS_SMOKE_GLOBAL_ADMIN_EMAIL="admin@example.test"',
  'SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD="admin-password"',
  'SAAS_SMOKE_PATIENT_EMAIL="patient@example.test"',
  'SAAS_SMOKE_PATIENT_PASSWORD="patient-password"',
  '',
].join('\n');

test('uses the Argon2id PHC mechanism consumed by the actual password-login repository', async () => {
  const [loginRouteSource, passwordRepositorySource] = await Promise.all([
    readFile(
      new URL('../../apps/webapp/src/app/api/auth/email-password/login/route.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../apps/webapp/src/infra/repos/pgUserPasswordCredentials.ts', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(
    loginRouteSource,
    /deps\.userPasswordCredentials\.verifyEmailPasswordForLogin\(emailNorm, parsed\.data\.password\)/u,
  );
  assert.match(
    passwordRepositorySource,
    /argon2\.verify\(row\?\.password_hash \?\? DUMMY_PASSWORD_HASH, plainPassword\)/u,
  );

  const hash = await hashSmokeLoginPassword('same-mechanism-password');
  assert.match(hash, /^\$argon2id\$/u);
  assert.equal(await verifySmokeLoginPassword(hash, 'same-mechanism-password'), true);
  assert.equal(await verifySmokeLoginPassword(hash, 'wrong-password'), false);
});

test('derives exactly the three packet accounts and requires the doctor clinic-owner shape', () => {
  const accounts = smokeLoginAccountsFromPacket(parseSmokeLoginPacket(packetText));
  assert.deepEqual(
    accounts.map(({ actor }) => actor),
    ['doctor', 'global_admin', 'patient'],
  );
  assertSmokeLoginAccountFact('doctor', {
    role: 'doctor',
    email_verified: true,
    is_blocked: false,
    active_memberships: 1,
    owner_memberships: 1,
    owner_specialist_memberships: 1,
  });
  assert.throws(
    () =>
      assertSmokeLoginAccountFact('doctor', {
        role: 'doctor',
        email_verified: true,
        is_blocked: false,
        active_memberships: 0,
        owner_memberships: 0,
        owner_specialist_memberships: 0,
      }),
    /doctor_membership_shape_mismatch/u,
  );
  assert.throws(
    () =>
      assertSmokeLoginAccountFact('doctor', {
        role: 'doctor',
        email_verified: true,
        is_blocked: false,
        active_memberships: 2,
        owner_memberships: 1,
        owner_specialist_memberships: 1,
      }),
    /doctor_membership_shape_mismatch/u,
  );
});

test('pins TEST and converges before minting without password logging', async () => {
  const [convergerSource, deploySource] = await Promise.all([
    readFile(
      new URL('../../apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs', import.meta.url),
      'utf8',
    ),
    readFile(new URL('./deploy-test-saas.sh', import.meta.url), 'utf8'),
  ]);

  assert.match(convergerSource, /const REQUIRED_DATABASE = "bersoncarebot_test"/u);
  assert.match(convergerSource, /WHERE users\.email_normalized = \$1/u);
  assert.match(convergerSource, /WHERE user_id = \$1::uuid/u);
  assert.match(convergerSource, /argon2\.verify\(credential\.password_hash, account\.password\)/u);
  assert.match(
    convergerSource,
    /changed=\$\{changed\} unchanged=\$\{accounts\.length - changed\}/u,
  );
  assert.doesNotMatch(convergerSource, /console\.(?:log|error)\([^)]*password/iu);
  assert.doesNotMatch(deploySource, /echo [^\n]*SAAS_SMOKE_[A-Z_]*PASSWORD/iu);
  assert.match(deploySource, /if ! sudo test -r "\$packet"; then[\s\S]*?return 0/u);
  assert.match(
    deploySource,
    /if ! sudo env SAAS_SMOKE_PASSWORD_CONVERGENCE_TEST_ONLY=1[\s\S]*?password convergence failed — refusing the older fixture\.[\s\S]*?return 1/u,
  );
  assert.match(
    deploySource,
    /fresh session mint failed — refusing the older fixture\.[\s\S]*?return 1/u,
  );
  assert.match(
    deploySource,
    /if ! mint_smoke_sessions_if_possible; then[\s\S]*?A2 stays RED\.[\s\S]*?return 1/u,
  );

  const convergeCall = deploySource.indexOf('node "$password_converger" --packet="$packet"');
  const mintCall = deploySource.indexOf('sudo node "$minter"');
  assert.ok(convergeCall >= 0, 'password convergence call must exist');
  assert.ok(mintCall > convergeCall, 'password convergence must run before session mint');
});

test('uses the same pseudonymous identifier-backoff key as login protection', async () => {
  const protectionSource = await readFile(
    new URL('../../apps/webapp/src/modules/auth/passwordLoginProtection.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    protectionSource,
    /`password-email:v1:\$\{createHash\("sha256"\)\.update\(emailNormalized\)\.digest\("hex"\)\}`/u,
  );
  assert.match(
    passwordIdentifierRateLimitKey('doctor@example.test'),
    /^password-email:v1:[a-f0-9]{64}$/u,
  );
});
