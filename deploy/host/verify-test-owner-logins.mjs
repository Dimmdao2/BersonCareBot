#!/usr/bin/env node
import { readSmokeLoginPacket } from './smoke-login-packet.mjs';

const baseUrl = 'https://test.therapysto.ru';
const packetPath = '/opt/env/bersoncarebot/saas-smoke-login.env';

function fail(message) {
  throw new Error(message);
}

async function verifyLogin(label, email, password, expectedRole) {
  const response = await fetch(`${baseUrl}/api/auth/email-password/login`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  if (
    response.status !== 200 ||
    body?.ok !== true ||
    body.factorRequired === true ||
    body.role !== expectedRole
  ) {
    fail(`${label}_login_failed:${response.status}:${body?.error ?? 'unexpected_response'}`);
  }
  process.stdout.write(`${label}: login PASS (role=${expectedRole})\n`);
}

async function verifyPatientPasswordDenied(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/email-password/login`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  const deniedByCredentialOrRole =
    (response.status === 401 && body?.error === 'invalid_credentials') ||
    (response.status === 403 && body?.error === 'password_not_available_for_role');
  if (
    !deniedByCredentialOrRole ||
    body?.ok !== false ||
    body?.role === 'client' ||
    response.headers.has('set-cookie')
  ) {
    fail(`patient_password_not_denied:${response.status}:${body?.error ?? 'unexpected_response'}`);
  }
  process.stdout.write('patient: password denied PASS (no client session)\n');
}

try {
  const packet = readSmokeLoginPacket(packetPath);
  await verifyLogin(
    'doctor',
    packet.SAAS_SMOKE_DOCTOR_EMAIL,
    packet.SAAS_SMOKE_DOCTOR_PASSWORD,
    'doctor',
  );
  await verifyLogin(
    'global_admin',
    packet.SAAS_SMOKE_GLOBAL_ADMIN_EMAIL,
    packet.SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD,
    'admin',
  );
  await verifyPatientPasswordDenied(
    packet.SAAS_SMOKE_PATIENT_EMAIL,
    packet.SAAS_SMOKE_PATIENT_PASSWORD,
  );
} catch (error) {
  process.stderr.write(
    `TEST owner login verification failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
  );
  process.exitCode = 1;
}
