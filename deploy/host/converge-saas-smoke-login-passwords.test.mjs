import assert from 'node:assert/strict';
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

test('hashes and verifies smoke-login passwords with Argon2id', async () => {
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

test('builds a pseudonymous identifier-backoff key', () => {
  assert.match(
    passwordIdentifierRateLimitKey('doctor@example.test'),
    /^password-email:v1:[a-f0-9]{64}$/u,
  );
});
