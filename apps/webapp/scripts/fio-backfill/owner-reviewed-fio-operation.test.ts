import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertFioApplyTarget,
  assertTestTarget,
  buildRollbackArtifact,
  buildManifest,
  parseAndVerifyManifest,
  parseAndVerifyRollbackArtifact,
  sameIdentityState,
  type CurrentFioRow,
  type FioIdentityState,
  type FioNameState,
  type OwnerReviewedFioManifest,
} from './owner-reviewed-fio-contract';
import {
  applyOwnerReviewedFio,
  createDurableRollbackWriter,
  readRegularJsonFile,
  rollbackOwnerReviewedFio,
  sealManifestFile,
  type FioDatabasePort,
  type FioTransactionPort,
} from './owner-reviewed-fio-operation';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const BEFORE: FioIdentityState = {
  displayName: 'Legacy A',
  firstName: 'A',
  lastName: null,
  patronymic: null,
  mergedIntoId: null,
};
const AFTER: FioNameState = {
  displayName: 'Reviewed A',
  firstName: 'Reviewed',
  lastName: 'A',
  patronymic: null,
};
const REVIEW_TIME_DRIFT: FioIdentityState = {
  ...BEFORE,
  firstName: 'Changed after review',
};

function manifestPayload(rows = [{ id: ID_A, expectedBefore: BEFORE, desiredAfter: AFTER }]) {
  return {
    schemaVersion: 'bersoncare.fio-owner-review.test/v1',
    environment: 'TEST',
    runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    createdAt: '2026-07-19T00:00:00.000Z',
    reviewSourceSha256: 'a'.repeat(64),
    approval: {
      decision: 'approved_for_test',
      approvedAt: '2026-07-19T00:00:00.000Z',
      reference: 'owner-review-task-849',
    },
    exceptions: { expectedMissing: [], preserveCurrent: [] },
    rows,
  };
}

function makeManifest(rows?: Parameters<typeof manifestPayload>[0]): OwnerReviewedFioManifest {
  return buildManifest(manifestPayload(rows));
}

function current(id: string, state: FioIdentityState): CurrentFioRow {
  return { id, ...state };
}

function memoryDb(initial: CurrentFioRow[]) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  const transaction = async <T>(run: (tx: FioTransactionPort) => Promise<T>) => {
    const snapshot = new Map([...rows].map(([id, row]) => [id, { ...row }]));
    const tx: FioTransactionPort = {
      lockRows: async (ids) => ids.flatMap((id) => (rows.has(id) ? [{ ...rows.get(id)! }] : [])),
      conditionalUpdate: async (id, expected, desired) => {
        const row = rows.get(id);
        if (!row) return false;
        const identity = {
          displayName: row.displayName,
          firstName: row.firstName,
          lastName: row.lastName,
          patronymic: row.patronymic,
          mergedIntoId: row.mergedIntoId,
        };
        if (!sameIdentityState(identity, expected)) return false;
        rows.set(id, { id, ...desired, mergedIntoId: expected.mergedIntoId });
        return true;
      },
    };
    try {
      return await run(tx);
    } catch (error) {
      rows.clear();
      for (const [id, row] of snapshot) rows.set(id, row);
      throw error;
    }
  };
  const db: FioDatabasePort = {
    readRows: async (ids) => ids.flatMap((id) => (rows.has(id) ? [{ ...rows.get(id)! }] : [])),
    transaction,
  };
  return { db, rows, transaction };
}

describe('owner-reviewed FIO manifest contract', () => {
  it('is hash-bound and rejects mutation', () => {
    const manifest = makeManifest();
    expect(parseAndVerifyManifest(manifest)).toEqual(manifest);
    expect(() =>
      parseAndVerifyManifest({ ...manifest, rows: [{ ...manifest.rows[0], id: ID_B }] }),
    ).toThrow('SHA-256 mismatch');
  });

  it('rejects duplicate identities and invalid exception bindings', () => {
    expect(() => makeManifest([manifestPayload().rows[0], manifestPayload().rows[0]])).toThrow(
      'duplicate IDs',
    );
    expect(() =>
      buildManifest({
        ...manifestPayload(),
        exceptions: {
          expectedMissing: [{ id: ID_B, reference: 'not-in-manifest' }],
          preserveCurrent: [],
        },
      }),
    ).toThrow('exception ID must exist in rows');
    expect(() =>
      buildManifest({
        ...manifestPayload(),
        exceptions: {
          expectedMissing: [{ id: ID_A, reference: 'known-missing' }],
          preserveCurrent: [
            { id: ID_A, exactCurrent: REVIEW_TIME_DRIFT, reference: 'known-drift' },
          ],
        },
      }),
    ).toThrow('duplicate exception IDs');
  });

  it('requires explicit TEST, exact database, and exact loopback', () => {
    expect(() =>
      assertTestTarget('postgres://u:p@127.0.0.1/bersoncarebot_test', 'bersoncarebot_test', false),
    ).toThrow('--test');
    expect(() =>
      assertTestTarget('postgres://u:p@localhost/bersoncarebot_test', 'bersoncarebot_test', true),
    ).toThrow('127.0.0.1');
    expect(() =>
      assertTestTarget('postgres://u:p@127.0.0.1/bcb_webapp_prod', 'bcb_webapp_prod', true),
    ).toThrow('bersoncarebot_test');
    expect(() =>
      assertTestTarget('postgres://u:p@127.0.0.1/bersoncarebot_test', 'bersoncarebot_test', true),
    ).not.toThrow();
  });

  // B-8 (owner 2026-07-25): the cutover apply path. Default behavior must stay the TEST-only gate.
  describe('assertFioApplyTarget cutover gate', () => {
    const TEST_URL = 'postgres://u:p@127.0.0.1/bersoncarebot_test';
    const PROD_URL = 'postgres://u:p@127.0.0.1/bcb_webapp_prod';

    it('keeps the historical TEST-only behavior when the cutover flag is absent', () => {
      expect(() =>
        assertFioApplyTarget(TEST_URL, 'bersoncarebot_test', 'TEST', { explicitTest: false }),
      ).toThrow('--test');
      expect(() =>
        assertFioApplyTarget(PROD_URL, 'bcb_webapp_prod', 'TEST', { explicitTest: true }),
      ).toThrow('bersoncarebot_test');
      expect(
        assertFioApplyTarget(TEST_URL, 'bersoncarebot_test', 'TEST', { explicitTest: true }),
      ).toBe('TEST');
    });

    it('permits the cutover target only on an exact expected-name match', () => {
      expect(
        assertFioApplyTarget(PROD_URL, 'bcb_webapp_prod', 'PROD', {
          explicitTest: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: 'bcb_webapp_prod',
        }),
      ).toBe('PROD');

      expect(() =>
        assertFioApplyTarget(PROD_URL, 'bcb_webapp_prod', 'PROD', {
          explicitTest: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: 'bcb_webapp_prod_TYPO',
        }),
      ).toThrow('does not match current_database()');

      expect(() =>
        assertFioApplyTarget(PROD_URL, 'bcb_webapp_prod', 'PROD', {
          explicitTest: false,
          allowAuthorizedProdTarget: true,
        }),
      ).toThrow('expected database name');
    });

    it('refuses an environment mismatch in either direction', () => {
      expect(() =>
        assertFioApplyTarget(PROD_URL, 'bcb_webapp_prod', 'TEST', {
          explicitTest: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: 'bcb_webapp_prod',
        }),
      ).toThrow('PROD-approved manifest');

      expect(() =>
        assertFioApplyTarget(TEST_URL, 'bersoncarebot_test', 'PROD', { explicitTest: true }),
      ).toThrow('TEST-approved manifest');
    });

    it('never lets the cutover flag bypass loopback or URL/database agreement', () => {
      expect(() =>
        assertFioApplyTarget('postgres://u:p@10.0.0.5/bcb_webapp_prod', 'bcb_webapp_prod', 'PROD', {
          explicitTest: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: 'bcb_webapp_prod',
        }),
      ).toThrow('127.0.0.1');

      expect(() =>
        assertFioApplyTarget(PROD_URL, 'some_other_db', 'PROD', {
          explicitTest: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: 'some_other_db',
        }),
      ).toThrow('must agree');
    });
  });
});

describe('owner-reviewed FIO apply and rollback', () => {
  it('seals a verifiable 0600 manifest without overwrite or symlink following', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fio-owner-review-seal-'));
    const output = path.join(directory, 'sealed.json');
    const sealed = await sealManifestFile(manifestPayload(), output);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(parseAndVerifyManifest(await readRegularJsonFile(output))).toEqual(sealed);
    await expect(sealManifestFile(manifestPayload(), output)).rejects.toThrow();

    const target = path.join(directory, 'target.json');
    const link = path.join(directory, 'linked-output.json');
    await writeFile(target, 'preserve\n', { mode: 0o600 });
    await symlink(target, link);
    await expect(sealManifestFile(manifestPayload(), link)).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('preserve\n');
  });

  it('rejects symlink JSON inputs and symlinked rollback directory parents', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fio-owner-review-path-'));
    const target = path.join(directory, 'target.json');
    const link = path.join(directory, 'manifest.json');
    await writeFile(target, '{}\n', { mode: 0o600 });
    await symlink(target, link);
    await expect(readRegularJsonFile(link)).rejects.toThrow();

    const realDirectory = path.join(directory, 'real');
    await mkdir(realDirectory);
    const directoryLink = path.join(directory, 'redirect');
    await symlink(realDirectory, directoryLink);
    const writer = createDurableRollbackWriter(path.join(directoryLink, 'nested'));
    const manifest = makeManifest();
    const plan = {
      updates: [{ manifest: manifest.rows[0]!, current: current(ID_A, BEFORE) }],
      alreadyMatched: [],
      expectedMissing: [],
      preservedCurrent: [],
      unexpectedMissing: [],
      unexpectedDrift: [],
    };
    await expect(
      writer.writeBeforeMutation(buildRollbackArtifact(manifest, plan.updates, manifest.createdAt)),
    ).rejects.toThrow('real directories');
  });

  it('persists the rollback artifact before the first update', async () => {
    const events: string[] = [];
    const db: FioDatabasePort = {
      readRows: async () => [current(ID_A, BEFORE)],
      transaction: async (run) =>
        run({
          lockRows: async () => [current(ID_A, BEFORE)],
          conditionalUpdate: async () => {
            events.push('update');
            return true;
          },
        }),
    };
    await applyOwnerReviewedFio(makeManifest(), db, {
      writeBeforeMutation: async () => {
        events.push('artifact');
        return '/secure/artifact';
      },
    });
    expect(events).toEqual(['artifact', 'update']);
  });

  it('writes a durable 0600 rollback artifact before the conditional update', async () => {
    const manifest = makeManifest();
    const { db, rows } = memoryDb([current(ID_A, BEFORE)]);
    const directory = await mkdtemp(path.join(tmpdir(), 'fio-owner-review-'));
    const result = await applyOwnerReviewedFio(
      manifest,
      db,
      createDurableRollbackWriter(directory),
      () => '2026-07-19T01:00:00.000Z',
    );
    expect(rows.get(ID_A)).toMatchObject(AFTER);
    expect(result.artifactPath).not.toBeNull();
    expect((await stat(result.artifactPath!)).mode & 0o777).toBe(0o600);
    const artifact = parseAndVerifyRollbackArtifact(
      JSON.parse(await readFile(result.artifactPath!, 'utf8')),
    );
    expect(artifact.rows).toHaveLength(1);
    expect(artifact.rows[0]?.restoreBefore).toEqual(BEFORE);
  });

  it('keeps distinct durable artifacts for repeated attempts of the same manifest', async () => {
    const manifest = makeManifest();
    const directory = await mkdtemp(path.join(tmpdir(), 'fio-owner-review-retry-'));
    const writer = createDurableRollbackWriter(directory);
    const fixedNow = () => '2026-07-19T01:00:00.000Z';
    const first = await applyOwnerReviewedFio(
      manifest,
      memoryDb([current(ID_A, BEFORE)]).db,
      writer,
      fixedNow,
    );
    const second = await applyOwnerReviewedFio(
      manifest,
      memoryDb([current(ID_A, BEFORE)]).db,
      writer,
      fixedNow,
    );

    expect(first.artifactSha256).toBe(second.artifactSha256);
    expect(first.artifactPath).not.toBe(second.artifactPath);
    expect((await stat(first.artifactPath!)).mode & 0o777).toBe(0o600);
    expect((await stat(second.artifactPath!)).mode & 0o777).toBe(0o600);
  });

  it('does not write when artifact creation fails and rolls back a later conditional failure', async () => {
    const manifest = makeManifest();
    const first = memoryDb([current(ID_A, BEFORE)]);
    await expect(
      applyOwnerReviewedFio(manifest, first.db, {
        writeBeforeMutation: async () => Promise.reject(new Error('disk')),
      }),
    ).rejects.toThrow('disk');
    expect(first.rows.get(ID_A)).toEqual(current(ID_A, BEFORE));

    const second = memoryDb([current(ID_A, BEFORE)]);
    const originalTransaction = second.db.transaction;
    second.db.transaction = (run) =>
      originalTransaction(async (tx) => run({ ...tx, conditionalUpdate: async () => false }));
    await expect(
      applyOwnerReviewedFio(manifest, second.db, {
        writeBeforeMutation: async () => '/secure/artifact',
      }),
    ).rejects.toThrow('conditional FIO update failed');
    expect(second.rows.get(ID_A)).toEqual(current(ID_A, BEFORE));
  });

  it('aborts an unlisted missing row and allows only its exact hash-bound exception', async () => {
    await expect(
      applyOwnerReviewedFio(makeManifest(), memoryDb([]).db, {
        writeBeforeMutation: async () => '/unused',
      }),
    ).rejects.toThrow('unexpected missing rows (1)');

    const exactExceptionManifest = buildManifest({
      ...manifestPayload(),
      exceptions: {
        expectedMissing: [{ id: ID_A, reference: 'owner-reviewed-missing-exception' }],
        preserveCurrent: [],
      },
    });
    const result = await applyOwnerReviewedFio(exactExceptionManifest, memoryDb([]).db, {
      writeBeforeMutation: async () => '/unused',
    });
    expect(result.plan.expectedMissing).toHaveLength(1);
    expect(result.artifactPath).toBeNull();

    await expect(
      applyOwnerReviewedFio(exactExceptionManifest, memoryDb([current(ID_A, BEFORE)]).db, {
        writeBeforeMutation: async () => '/unused',
      }),
    ).rejects.toThrow('unexpected row drift (1)');
  });

  it('preserves only the exact reviewed drift and aborts a later edit', async () => {
    await expect(
      applyOwnerReviewedFio(makeManifest(), memoryDb([current(ID_A, REVIEW_TIME_DRIFT)]).db, {
        writeBeforeMutation: async () => '/unused',
      }),
    ).rejects.toThrow('unexpected row drift (1)');

    const exactExceptionManifest = buildManifest({
      ...manifestPayload(),
      exceptions: {
        expectedMissing: [],
        preserveCurrent: [
          {
            id: ID_A,
            exactCurrent: REVIEW_TIME_DRIFT,
            reference: 'owner-reviewed-changed-row-exception',
          },
        ],
      },
    });
    const result = await applyOwnerReviewedFio(
      exactExceptionManifest,
      memoryDb([current(ID_A, REVIEW_TIME_DRIFT)]).db,
      { writeBeforeMutation: async () => '/unused' },
    );
    expect(result.plan.preservedCurrent).toHaveLength(1);
    expect(result.artifactPath).toBeNull();

    const laterEdit = { ...REVIEW_TIME_DRIFT, lastName: 'Later edit' };
    await expect(
      applyOwnerReviewedFio(exactExceptionManifest, memoryDb([current(ID_A, laterEdit)]).db, {
        writeBeforeMutation: async () => '/unused',
      }),
    ).rejects.toThrow('unexpected row drift (1)');
  });

  it('rolls back only from the exact recorded post-apply state', async () => {
    const manifest = makeManifest();
    const appliedDb = memoryDb([current(ID_A, BEFORE)]);
    let captured: ReturnType<typeof parseAndVerifyRollbackArtifact> | undefined;
    await applyOwnerReviewedFio(manifest, appliedDb.db, {
      writeBeforeMutation: async (artifact) => {
        captured = artifact;
        return '/secure/artifact';
      },
    });
    expect(await rollbackOwnerReviewedFio(captured!, appliedDb.db)).toBe(1);
    expect(appliedDb.rows.get(ID_A)).toEqual(current(ID_A, BEFORE));

    const changedAfterApply = memoryDb([
      current(ID_A, { ...AFTER, firstName: 'Later edit', mergedIntoId: null }),
    ]);
    await expect(rollbackOwnerReviewedFio(captured!, changedAfterApply.db)).rejects.toThrow(
      'rollback conflict',
    );
    expect(changedAfterApply.rows.get(ID_A)?.firstName).toBe('Later edit');
  });
});
