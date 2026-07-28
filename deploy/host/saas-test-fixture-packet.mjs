import { lstatSync, readFileSync } from 'node:fs';

export const SAAS_TEST_FIXTURE_PACKET_KEYS = Object.freeze([
  'SAAS_TEST_FIXTURE_ENABLED',
  'SAAS_TEST_FIXTURE_CLINIC_A_EMAIL',
  'SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD',
  'SAAS_TEST_FIXTURE_CLINIC_B_EMAIL',
  'SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD',
]);

const ALLOWED_KEYS = new Set(SAAS_TEST_FIXTURE_PACKET_KEYS);
const UNSAFE_VALUE_PATTERN = /\$\(|\$\{|`/;

export class SaasTestFixturePacketError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SaasTestFixturePacketError';
    this.code = code;
  }
}

function fail(code) {
  throw new SaasTestFixturePacketError(code);
}

export function parseSaasTestFixturePacket(text) {
  const parsed = Object.create(null);
  const seen = new Set();

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=("(?:[^"\\]|\\.)*")$/.exec(rawLine);
    if (!match) fail('malformed_line');
    const key = match[1];
    const encodedValue = match[2];
    if (!key || !encodedValue) fail('malformed_line');
    if (!ALLOWED_KEYS.has(key)) fail('unknown_key');
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

  if (seen.size !== SAAS_TEST_FIXTURE_PACKET_KEYS.length) fail('missing_key');
  for (const key of SAAS_TEST_FIXTURE_PACKET_KEYS) {
    if (!seen.has(key)) fail('missing_key');
  }
  if (parsed.SAAS_TEST_FIXTURE_ENABLED !== '1') fail('explicit_enable_required');
  return Object.freeze(parsed);
}

export function resolveDeployGroupId(groupFile = '/etc/group') {
  const line = readFileSync(groupFile, 'utf8')
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith('deploy:'));
  const fields = line?.split(':') ?? [];
  const groupId = Number(fields[2]);
  if (!Number.isSafeInteger(groupId) || groupId < 0) fail('deploy_group_not_found');
  return groupId;
}

export function validateSaasTestFixturePacketMetadata(
  metadata,
  { expectedGroupId, expectedOwnerId = 0 },
) {
  if (metadata.isSymbolicLink()) fail('symlink_forbidden');
  if (!metadata.isFile()) fail('regular_file_required');
  if (metadata.uid !== expectedOwnerId) fail('owner_must_be_root');
  if (metadata.gid !== expectedGroupId) fail('group_must_be_deploy');
  if ((metadata.mode & 0o777) !== 0o640) fail('mode_must_be_0640');
}

export function readSaasTestFixturePacket({ filePath, expectedGroupId, expectedOwnerId = 0 }) {
  if (!filePath) fail('packet_path_required');
  const metadata = lstatSync(filePath);
  validateSaasTestFixturePacketMetadata(metadata, { expectedGroupId, expectedOwnerId });
  return parseSaasTestFixturePacket(readFileSync(filePath, 'utf8'));
}

if (process.env.SAAS_TEST_FIXTURE_PACKET_VALIDATE_ONLY === '1') {
  try {
    readSaasTestFixturePacket({
      filePath: process.argv[2] ?? '',
      expectedGroupId: resolveDeployGroupId(),
    });
    process.stdout.write('SaaS TEST fixture packet: OK\n');
  } catch {
    process.stderr.write('SaaS TEST fixture packet: INVALID\n');
    process.exitCode = 1;
  }
}
