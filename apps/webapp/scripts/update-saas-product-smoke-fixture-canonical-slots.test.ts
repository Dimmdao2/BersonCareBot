import { chmodSync, lstatSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FixtureUpdateError,
  assertProtectedMetadata,
  inspectProtectedMetadata,
  resolveOneCanonicalSlotPair,
  updateCanonicalSlotRefs,
  type CanonicalSlotProbe,
} from './update-saas-product-smoke-fixture-canonical-slots';

const BRANCH_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const LEGACY_ID = '33333333-3333-4333-8333-333333333333';
const tempRoots: string[] = [];

function exactProbe(overrides: Partial<CanonicalSlotProbe> = {}): CanonicalSlotProbe {
  return {
    databaseName: 'bersoncarebot_test',
    organizationCount: 1,
    legacyMatchCount: 1,
    candidates: [{ branchId: BRANCH_ID, clinicServiceId: SERVICE_ID }],
    ...overrides,
  };
}

function fixtureText(): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      authProfiles: { preserved: true },
      refs: {
        publicBookingOrganizationSlug: 'saas-test-clinic-a',
        publicBookingServiceId: LEGACY_ID,
        unrelatedRef: 'preserve-me',
      },
      forbiddenBodyText: ['preserve-this-too'],
    },
    null,
    2,
  )}\n`;
}

async function createFixture(): Promise<Readonly<{ root: string; fixture: string; previous: string }>> {
  const root = await mkdtemp(join(tmpdir(), 'bcb-canonical-slot-fixture.'));
  tempRoots.push(root);
  const fixture = join(root, 'saas-smoke.fixture');
  const previous = join(root, 'saas-smoke.fixture.previous');
  writeFileSync(fixture, fixtureText(), { encoding: 'utf8', mode: 0o640 });
  chmodSync(fixture, 0o640);
  return { root, fixture, previous };
}

function expectCode(run: () => void, code: string): void {
  try {
    run();
    throw new Error('expected operation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(FixtureUpdateError);
    expect((error as FixtureUpdateError).code).toBe(code);
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('canonical public-booking fixture selection', () => {
  it('fails closed for the wrong database', () => {
    expectCode(
      () => resolveOneCanonicalSlotPair(exactProbe({ databaseName: 'bcb_webapp_dev' }), true),
      'wrong_database',
    );
  });

  it('fails closed for no match and ambiguity', () => {
    expectCode(
      () => resolveOneCanonicalSlotPair(exactProbe({ legacyMatchCount: 0 }), true),
      'legacy_ref_not_unique',
    );
    expectCode(
      () => resolveOneCanonicalSlotPair(exactProbe({ candidates: [] }), true),
      'canonical_slot_pair_not_found',
    );
    expectCode(
      () =>
        resolveOneCanonicalSlotPair(
          exactProbe({
            candidates: [
              { branchId: BRANCH_ID, clinicServiceId: SERVICE_ID },
              {
                branchId: '44444444-4444-4444-8444-444444444444',
                clinicServiceId: '55555555-5555-4555-8555-555555555555',
              },
            ],
          }),
          true,
        ),
      'canonical_slot_pair_ambiguous',
    );
  });
});

describe('protected fixture metadata', () => {
  it('rejects a symlink and a non-0640 file', async () => {
    const { root, fixture } = await createFixture();
    const symlink = join(root, 'fixture-link');
    symlinkSync(fixture, symlink);
    const uid = lstatSync(fixture).uid;
    const gid = lstatSync(fixture).gid;

    expectCode(
      () => assertProtectedMetadata(inspectProtectedMetadata(symlink), uid, gid),
      'symlink_forbidden',
    );
    chmodSync(fixture, 0o644);
    expectCode(
      () => assertProtectedMetadata(inspectProtectedMetadata(fixture), uid, gid),
      'mode_must_be_0640',
    );
  });
});

describe('protected fixture atomic update', () => {
  it('preserves unrelated refs, creates a protected backup, and emits no opaque ids', async () => {
    const { fixture, previous } = await createFixture();
    const metadata = lstatSync(fixture);
    const logs: string[] = [];
    updateCanonicalSlotRefs(fixture, previous, {
      expectedOwnerId: metadata.uid,
      expectedGroupId: metadata.gid,
      query: () => exactProbe(),
      validateProtectedFile(path) {
        assertProtectedMetadata(inspectProtectedMetadata(path), metadata.uid, metadata.gid);
      },
      checkFixture: () => undefined,
      log: (message) => logs.push(message),
    });

    const updated = JSON.parse(readFileSync(fixture, 'utf8')) as {
      refs: Record<string, string>;
      forbiddenBodyText: string[];
    };
    expect(updated.refs).toMatchObject({
      publicBookingBranchId: BRANCH_ID,
      publicBookingClinicServiceId: SERVICE_ID,
      publicBookingServiceId: LEGACY_ID,
      unrelatedRef: 'preserve-me',
    });
    expect(updated.forbiddenBodyText).toEqual(['preserve-this-too']);
    expect(readFileSync(previous, 'utf8')).toBe(fixtureText());
    expect(inspectProtectedMetadata(previous).mode).toBe(0o640);
    expect(logs.join('\n')).not.toContain(BRANCH_ID);
    expect(logs.join('\n')).not.toContain(SERVICE_ID);
    expect(logs.join('\n')).not.toContain(LEGACY_ID);
  });

  it('does not replace or back up when the existing validator rejects the candidate', async () => {
    const { fixture, previous } = await createFixture();
    const metadata = lstatSync(fixture);
    let validationCalls = 0;
    expectCode(
      () =>
        updateCanonicalSlotRefs(fixture, previous, {
          expectedOwnerId: metadata.uid,
          expectedGroupId: metadata.gid,
          query: () => exactProbe(),
          validateProtectedFile() {
            validationCalls += 1;
            if (validationCalls === 2) throw new FixtureUpdateError('offline_fixture_check_failed');
          },
          checkFixture: () => undefined,
          log: () => undefined,
        }),
      'offline_fixture_check_failed',
    );
    expect(readFileSync(fixture, 'utf8')).toBe(fixtureText());
    expect(() => readFileSync(previous, 'utf8')).toThrow();
  });

  it('atomically restores the original when the post-replace checker fails', async () => {
    const { fixture, previous } = await createFixture();
    const metadata = lstatSync(fixture);
    let checkCalls = 0;
    expectCode(
      () =>
        updateCanonicalSlotRefs(fixture, previous, {
          expectedOwnerId: metadata.uid,
          expectedGroupId: metadata.gid,
          query: () => exactProbe(),
          validateProtectedFile(path) {
            assertProtectedMetadata(inspectProtectedMetadata(path), metadata.uid, metadata.gid);
          },
          checkFixture() {
            checkCalls += 1;
            if (checkCalls === 2) throw new FixtureUpdateError('offline_fixture_check_failed');
          },
          log: () => undefined,
        }),
      'post_replace_check_failed_rolled_back',
    );
    expect(readFileSync(fixture, 'utf8')).toBe(fixtureText());
    expect(readFileSync(previous, 'utf8')).toBe(fixtureText());
    expect(inspectProtectedMetadata(fixture).mode).toBe(0o640);
  });
});
