import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const SMOKE_LOGIN_PACKET_KEYS = Object.freeze([
  'SAAS_SMOKE_LOGIN_ENABLED',
  'SAAS_SMOKE_DOCTOR_EMAIL',
  'SAAS_SMOKE_DOCTOR_PASSWORD',
  'SAAS_SMOKE_GLOBAL_ADMIN_EMAIL',
  'SAAS_SMOKE_GLOBAL_ADMIN_PASSWORD',
  'SAAS_SMOKE_PATIENT_EMAIL',
  'SAAS_SMOKE_PATIENT_PASSWORD',
]);

const ALLOWED_PACKET_KEYS = new Set(SMOKE_LOGIN_PACKET_KEYS);
const UNSAFE_VALUE_PATTERN = /\$\(|\$\{|`/;

function fail(code) {
  throw new Error(code);
}

function assertNoSymlinkParents(filePath) {
  let current = dirname(resolve(filePath));
  while (true) {
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink()) fail('symlink_parent_forbidden');
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function resolveDeployGroupId(groupFile = '/etc/group') {
  const line = readFileSync(groupFile, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('deploy:'));
  const groupId = Number((line?.split(':') ?? [])[2]);
  if (!Number.isSafeInteger(groupId) || groupId < 0) fail('deploy_group_not_found');
  return groupId;
}

function validatePacketMetadata(metadata, expectedGroupId) {
  if (metadata.isSymbolicLink()) fail('symlink_forbidden');
  if (!metadata.isFile()) fail('regular_file_required');
  if ((metadata.mode & 0o777) !== 0o640) fail('mode_must_be_0640');
  if (metadata.uid !== 0) fail('owner_must_be_root');
  if (metadata.gid !== expectedGroupId) fail('group_must_be_deploy');
}

export function parseSmokeLoginPacket(text) {
  const parsed = Object.create(null);
  const seen = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=("(?:[^"\\]|\\.)*")$/.exec(rawLine);
    if (!match) fail('malformed_line');
    const [, key, encodedValue] = match;
    if (!ALLOWED_PACKET_KEYS.has(key)) fail('unknown_key');
    if (seen.has(key)) fail('duplicate_key');
    if (UNSAFE_VALUE_PATTERN.test(encodedValue)) fail('unsafe_value');
    let value;
    try {
      value = JSON.parse(encodedValue);
    } catch {
      fail('malformed_value');
    }
    if (typeof value !== 'string' || value.length === 0) fail('empty_value');
    if (UNSAFE_VALUE_PATTERN.test(value)) fail('unsafe_value');
    seen.add(key);
    parsed[key] = value;
  }
  if (
    seen.size !== SMOKE_LOGIN_PACKET_KEYS.length ||
    SMOKE_LOGIN_PACKET_KEYS.some((key) => !seen.has(key))
  ) {
    fail('missing_key');
  }
  if (parsed.SAAS_SMOKE_LOGIN_ENABLED !== '1') fail('explicit_enable_required');
  return Object.freeze(parsed);
}

export function readSmokeLoginPacket(filePath) {
  try {
    assertNoSymlinkParents(filePath);
    validatePacketMetadata(lstatSync(filePath), resolveDeployGroupId());
    return parseSmokeLoginPacket(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') fail('packet_missing');
    throw error;
  }
}
