#!/usr/bin/env tsx

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const EXACT_TEST_DATABASE = 'bersoncarebot_test';
const EXACT_FIXTURE_PATH = '/run/bersoncarebot/saas-smoke.fixture';
const EXACT_PREVIOUS_PATH = '/run/bersoncarebot/saas-smoke.fixture.previous';
const EXACT_TEST_ENV_PATH = '/opt/env/bersoncarebot/webapp.test';
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export type CanonicalSlotCandidate = Readonly<{
  branchId: string;
  clinicServiceId: string;
}>;

export type CanonicalSlotProbe = Readonly<{
  databaseName: string;
  organizationCount: number;
  candidates: readonly CanonicalSlotCandidate[];
}>;

type ProtectedMetadata = Readonly<{
  uid: number;
  gid: number;
  mode: number;
  isFile: boolean;
  isSymbolicLink: boolean;
}>;

type UpdateDependencies = Readonly<{
  expectedOwnerId: number;
  expectedGroupId: number;
  query: (organizationSlug: string) => CanonicalSlotProbe;
  validateProtectedFile: (path: string) => void;
  checkFixture: (path: string) => void;
  log: (message: string) => void;
}>;

export class FixtureUpdateError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'FixtureUpdateError';
    this.code = code;
  }
}

function fail(code: string): never {
  throw new FixtureUpdateError(code);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) fail(`missing_${key}`);
  return value.trim();
}

export function parseFixtureForCanonicalSlots(text: string): Readonly<{
  document: JsonRecord;
  refs: JsonRecord;
  organizationSlug: string;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('fixture_json_invalid');
  }
  if (!isJsonRecord(parsed) || !isJsonRecord(parsed.refs)) fail('fixture_refs_invalid');
  const organizationSlug = requireString(parsed.refs, 'publicBookingOrganizationSlug');
  if (!SLUG_PATTERN.test(organizationSlug)) fail('organization_slug_invalid');
  return { document: parsed, refs: parsed.refs, organizationSlug };
}

export function resolveOneCanonicalSlotPair(probe: CanonicalSlotProbe): CanonicalSlotCandidate {
  if (probe.databaseName !== EXACT_TEST_DATABASE) fail('wrong_database');
  if (probe.organizationCount !== 1) fail('organization_not_unique');
  if (probe.candidates.length === 0) fail('canonical_slot_pair_not_found');
  if (probe.candidates.length !== 1) fail('canonical_slot_pair_ambiguous');
  const candidate = probe.candidates[0];
  if (
    !candidate ||
    !UUID_PATTERN.test(candidate.branchId) ||
    !UUID_PATTERN.test(candidate.clinicServiceId)
  ) {
    fail('canonical_slot_pair_invalid');
  }
  return candidate;
}

export function inspectProtectedMetadata(path: string): ProtectedMetadata {
  const metadata = lstatSync(path);
  return {
    uid: metadata.uid,
    gid: metadata.gid,
    mode: metadata.mode & 0o777,
    isFile: metadata.isFile(),
    isSymbolicLink: metadata.isSymbolicLink(),
  };
}

export function assertProtectedMetadata(
  metadata: ProtectedMetadata,
  expectedOwnerId: number,
  expectedGroupId: number,
): void {
  if (metadata.isSymbolicLink) fail('symlink_forbidden');
  if (!metadata.isFile) fail('regular_file_required');
  if (metadata.uid !== expectedOwnerId) fail('owner_must_be_root');
  if (metadata.gid !== expectedGroupId) fail('group_must_be_deploy');
  if (metadata.mode !== 0o640) fail('mode_must_be_0640');
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeSecureFile(path: string, contents: string, ownerId: number, groupId: number): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    fchownSync(fd, ownerId, groupId);
    fchmodSync(fd, 0o640);
    writeFileSync(fd, contents, { encoding: 'utf8' });
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function readProtectedFile(path: string, ownerId: number, groupId: number): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(fd);
    assertProtectedMetadata(
      {
        uid: metadata.uid,
        gid: metadata.gid,
        mode: metadata.mode & 0o777,
        isFile: metadata.isFile(),
        isSymbolicLink: false,
      },
      ownerId,
      groupId,
    );
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

function atomicWrite(targetPath: string, contents: string, ownerId: number, groupId: number): void {
  const parent = dirname(targetPath);
  const temporaryPath = join(
    parent,
    `.${targetPath.split('/').at(-1)}.next.${process.pid}.${randomUUID()}`,
  );
  try {
    writeSecureFile(temporaryPath, contents, ownerId, groupId);
    renameSync(temporaryPath, targetPath);
    fsyncDirectory(parent);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export function updateCanonicalSlotRefs(
  fixturePath: string,
  previousPath: string,
  dependencies: UpdateDependencies,
): void {
  dependencies.validateProtectedFile(fixturePath);
  const originalContents = readProtectedFile(
    fixturePath,
    dependencies.expectedOwnerId,
    dependencies.expectedGroupId,
  );
  const parsed = parseFixtureForCanonicalSlots(originalContents);
  const candidate = resolveOneCanonicalSlotPair(dependencies.query(parsed.organizationSlug));
  const updatedDocument: JsonRecord = {
    ...parsed.document,
    refs: {
      ...parsed.refs,
      publicBookingBranchId: candidate.branchId,
      publicBookingClinicServiceId: candidate.clinicServiceId,
    },
  };
  const updatedContents = `${JSON.stringify(updatedDocument, null, 2)}\n`;
  const parent = dirname(fixturePath);
  const candidatePath = join(
    parent,
    `.saas-smoke.fixture.candidate.${process.pid}.${randomUUID()}`,
  );

  try {
    writeSecureFile(
      candidatePath,
      updatedContents,
      dependencies.expectedOwnerId,
      dependencies.expectedGroupId,
    );
    dependencies.validateProtectedFile(candidatePath);
    dependencies.checkFixture(candidatePath);

    atomicWrite(
      previousPath,
      originalContents,
      dependencies.expectedOwnerId,
      dependencies.expectedGroupId,
    );
    dependencies.validateProtectedFile(previousPath);
    renameSync(candidatePath, fixturePath);
    try {
      fsyncDirectory(parent);
      dependencies.validateProtectedFile(fixturePath);
      dependencies.checkFixture(fixturePath);
    } catch {
      atomicWrite(
        fixturePath,
        originalContents,
        dependencies.expectedOwnerId,
        dependencies.expectedGroupId,
      );
      dependencies.validateProtectedFile(fixturePath);
      fail('post_replace_check_failed_rolled_back');
    }
    dependencies.log(
      'canonical public-booking fixture refs updated; protected previous copy retained',
    );
  } finally {
    try {
      unlinkSync(candidatePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function shellQuoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildReadOnlyProbeSql(organizationSlug: string): string {
  if (!SLUG_PATTERN.test(organizationSlug)) fail('organization_slug_invalid');
  const slugLiteral = shellQuoteSqlLiteral(organizationSlug);
  return `
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH slug_org AS (
  SELECT directory.organization_id
  FROM public.clinic_public_directory_entries AS directory
  JOIN public.be_organizations AS organization
    ON organization.id = directory.organization_id
   AND organization.is_active = true
  WHERE directory.slug = ${slugLiteral}
    AND directory.is_published = true
), candidates AS (
  SELECT DISTINCT branch.id AS branch_id, service.id AS clinic_service_id
  FROM slug_org
  JOIN public.be_branches AS branch
    ON branch.organization_id = slug_org.organization_id
   AND branch.is_active = true
  JOIN public.be_clinic_services AS service
    ON service.organization_id = slug_org.organization_id
   AND service.is_active = true
   AND service.public_widget_visible = true
   AND service.admin_manual_only = false
  JOIN public.be_specialist_service_availability AS availability
    ON availability.organization_id = slug_org.organization_id
   AND availability.branch_id = branch.id
   AND availability.service_id = service.id
   AND availability.is_active = true
)
SELECT json_build_object(
  'databaseName', current_database(),
  'organizationCount', (SELECT count(*)::int FROM slug_org),
  'candidates', COALESCE((
    SELECT json_agg(json_build_object(
      'branchId', candidates.branch_id,
      'clinicServiceId', candidates.clinic_service_id
    ) ORDER BY candidates.branch_id, candidates.clinic_service_id)
    FROM candidates
  ), '[]'::json)
)::text;
ROLLBACK;
`;
}

function runReadOnlyProbe(organizationSlug: string): CanonicalSlotProbe {
  const result = spawnSync(
    'sudo',
    [
      '-u',
      'postgres',
      'psql',
      '-d',
      EXACT_TEST_DATABASE,
      '-X',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      encoding: 'utf8',
      input: buildReadOnlyProbeSql(organizationSlug),
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.status !== 0) fail('database_probe_failed');
  const line = result.stdout.split(/\r?\n/).find((candidate) => candidate.trim().startsWith('{'));
  if (!line) fail('database_probe_invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    fail('database_probe_invalid');
  }
  if (!isJsonRecord(parsed) || !Array.isArray(parsed.candidates)) fail('database_probe_invalid');
  const candidates = parsed.candidates.map((candidate): CanonicalSlotCandidate => {
    if (!isJsonRecord(candidate)) fail('database_probe_invalid');
    return {
      branchId: requireString(candidate, 'branchId'),
      clinicServiceId: requireString(candidate, 'clinicServiceId'),
    };
  });
  if (
    typeof parsed.databaseName !== 'string' ||
    typeof parsed.organizationCount !== 'number'
  ) {
    fail('database_probe_invalid');
  }
  return {
    databaseName: parsed.databaseName,
    organizationCount: parsed.organizationCount,
    candidates,
  };
}

function runQuiet(command: string, args: readonly string[]): void {
  const result = spawnSync(command, [...args], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) fail('offline_fixture_check_failed');
}

function assertExactRuntime(projectRoot: string): void {
  if (process.getuid?.() !== 0) fail('root_operator_required');
  if (resolve(projectRoot) !== '/opt/projects/bersoncarebot-test') fail('wrong_project_root');
  if (process.env.BCB_OPERATOR_TEST_ENV_FILE !== EXACT_TEST_ENV_PATH) fail('wrong_test_env');
}

function resolveDeployGroupId(): number {
  const result = spawnSync('getent', ['group', 'deploy'], { encoding: 'utf8' });
  const groupId = Number(result.stdout.split(':')[2]);
  if (result.status !== 0 || !Number.isSafeInteger(groupId) || groupId < 0)
    fail('deploy_group_not_found');
  return groupId;
}

function main(): void {
  const projectRootArg = process.argv.find((arg) => arg.startsWith('--project-root='));
  const projectRoot = projectRootArg?.slice('--project-root='.length) ?? '';
  assertExactRuntime(projectRoot);
  const deployGroupId = resolveDeployGroupId();
  const validator = join(projectRoot, 'deploy/host/validate-saas-product-smoke-fixture.sh');
  const dependencies: UpdateDependencies = {
    expectedOwnerId: 0,
    expectedGroupId: deployGroupId,
    query: runReadOnlyProbe,
    validateProtectedFile(path) {
      runQuiet('bash', [validator, '--validate', path, projectRoot, projectRoot]);
    },
    checkFixture(path) {
      runQuiet('pnpm', [
        '--dir',
        projectRoot,
        'run',
        'smoke:saas-product',
        '--',
        '--check-fixture',
        `--fixture-file=${path}`,
        '--scenario-ids=public.booking.slots',
      ]);
    },
    log(message) {
      process.stdout.write(`${message}\n`);
    },
  };
  updateCanonicalSlotRefs(EXACT_FIXTURE_PATH, EXACT_PREVIOUS_PATH, dependencies);
}

const isDirectRun = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    const code = error instanceof FixtureUpdateError ? error.code : 'unexpected_failure';
    process.stderr.write(`fixture canonical-slot update failed: ${code}\n`);
    process.exitCode = 1;
  }
}
