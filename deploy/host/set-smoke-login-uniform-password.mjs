#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  chownSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { readSmokeLoginPacket, SMOKE_LOGIN_PACKET_KEYS } from './smoke-login-packet.mjs';

function fail(code) {
  throw new Error(code);
}

function deployGroupId() {
  const line = readFileSync('/etc/group', 'utf8')
    .split(/\r?\n/u)
    .find((candidate) => candidate.startsWith('deploy:'));
  const gid = Number((line?.split(':') ?? [])[2]);
  if (!Number.isSafeInteger(gid) || gid < 0) fail('deploy_group_not_found');
  return gid;
}

async function readPassword() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/u, '');
  if (password.length < 8 || password.length > 128) fail('invalid_password_length');
  return password;
}

async function main() {
  if (process.getuid?.() !== 0) fail('root_required');
  if (process.argv.length !== 3) fail('usage');
  const packetPath = resolve(process.argv[2]);
  const packet = readSmokeLoginPacket(packetPath);
  const password = await readPassword();
  const next = {
    ...packet,
    SAAS_SMOKE_DOCTOR_PASSWORD: password,
    SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD: password,
    SAAS_SMOKE_PATIENT_PASSWORD: password,
  };
  const temporaryPath = `${packetPath}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  let renamed = false;
  try {
    const contents = `${SMOKE_LOGIN_PACKET_KEYS.map((key) => `${key}=${JSON.stringify(next[key])}`).join('\n')}\n`;
    writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    chownSync(temporaryPath, 0, deployGroupId());
    chmodSync(temporaryPath, 0o640);
    renameSync(temporaryPath, packetPath);
    renamed = true;
    const metadata = lstatSync(packetPath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o640) {
      fail('packet_metadata_verification_failed');
    }
  } finally {
    if (!renamed) rmSync(temporaryPath, { force: true });
  }
  process.stdout.write('smoke-login packet passwords updated for doctor, global_admin, patient\n');
}

main().catch(() => {
  process.stderr.write('set-smoke-login-uniform-password: failed without printing the password\n');
  process.exitCode = 1;
});
