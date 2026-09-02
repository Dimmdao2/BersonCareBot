#!/usr/bin/env node
import { readSmokeLoginPacket } from './smoke-login-packet.mjs';

const baseUrl = 'https://test.bersoncare.ru';
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
  await verifyLogin(
    'patient',
    packet.SAAS_SMOKE_PATIENT_EMAIL,
    packet.SAAS_SMOKE_PATIENT_PASSWORD,
    'client',
  );
} catch (error) {
  process.stderr.write(
    `TEST owner login verification failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
  );
  process.exitCode = 1;
}
