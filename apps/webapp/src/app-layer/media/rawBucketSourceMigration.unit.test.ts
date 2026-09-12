import { describe, expect, it } from 'vitest';
import {
  migrateOneSourceToRawBucket,
  PLATFORM_RAW_FOLDER,
  rawFolderForRow,
  rawMigrationRefusalFor,
  runRawBucketSourceMigration,
  verifyRawBucketCounters,
  type RawMigrationCandidateRow,
  type RawMigrationJournalRow,
  type RawMigrationRepo,
  type RawMigrationStorage,
} from './rawBucketSourceMigration';

const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';

/** In-memory stand-in for the two buckets: key → byte length, per bucket. */
function fakeStorage(initial: { hot?: Record<string, number>; raw?: Record<string, number> } = {}) {
  const buckets = {
    hot: new Map(Object.entries(initial.hot ?? {})),
    raw: new Map(Object.entries(initial.raw ?? {})),
  };
  const calls = { copies: [] as string[], deletes: [] as string[] };
  const storage: RawMigrationStorage & { buckets: typeof buckets; calls: typeof calls } = {
    buckets,
    calls,
    async headObject(key, kind) {
      const size = buckets[kind].get(key);
      return size === undefined ? null : { sizeBytes: size };
    },
    async copyObject(input) {
      const size = buckets[input.sourceKind].get(input.sourceKey);
      if (size === undefined) throw new Error(`copy of missing key ${input.sourceKey}`);
      buckets[input.destinationKind].set(input.destinationKey, size);
      calls.copies.push(`${input.sourceKey} -> ${input.destinationKey}`);
    },
    async deleteObject(key, kind) {
      buckets[kind].delete(key);
      calls.deletes.push(key);
    },
    async listObjects(prefix, kind) {
      return [...buckets[kind].entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, sizeBytes]) => ({ key, sizeBytes }));
    },
    rawObjectKey: (folder, mediaId, filename) => `${folder}/media/${mediaId}/${filename}`,
  };
  return storage;
}

function fakeRepo(rows: RawMigrationCandidateRow[]): RawMigrationRepo & {
  rows: RawMigrationCandidateRow[];
  updates: { id: string; toKey: string }[];
} {
  const updates: { id: string; toKey: string }[] = [];
  return {
    rows,
    updates,
    async listCandidates({ afterId, limit }) {
      return rows
        .filter((row) => row.s3Key.startsWith('media/') && (!afterId || row.id > afterId))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);
    },
    async updateSourceKey({ id, fromKey, toKey }) {
      const row = rows.find((candidate) => candidate.id === id && candidate.s3Key === fromKey);
      if (!row) return false;
      row.s3Key = toKey;
      updates.push({ id, toKey });
      return true;
    },
    async listReadyJournalRows() {
      return [];
    },
    async readProductFilesUsed() {
      return null;
    },
  };
}

function libraryRow(overrides: Partial<RawMigrationCandidateRow> = {}): RawMigrationCandidateRow {
  return {
    id: MEDIA_ID,
    organizationId: ORG_ID,
    s3Key: `media/${MEDIA_ID}/clip.mp4`,
    sizeBytes: 1024,
    storageTarget: 'library',
    status: 'ready',
    ...overrides,
  };
}

describe('М7 raw-bucket relocation — what may move', () => {
  it('refuses a patient-target row: М7 does not split patient storage', () => {
    expect(rawMigrationRefusalFor(libraryRow({ storageTarget: 'patient' }))).toBe(
      'not_library_target',
    );
  });

  it('refuses a row that is not ready (upload in flight or staged for deletion)', () => {
    expect(rawMigrationRefusalFor(libraryRow({ status: 'pending' }))).toBe('not_ready');
    expect(rawMigrationRefusalFor(libraryRow({ status: 'pending_delete' }))).toBe('not_ready');
  });

  it('refuses a key that is not the pre-M7 shape, including one that already moved', () => {
    expect(rawMigrationRefusalFor(libraryRow({ s3Key: `${ORG_ID}/media/${MEDIA_ID}/clip.mp4` }))).toBe(
      'not_pre_m7_key_shape',
    );
    expect(rawMigrationRefusalFor(libraryRow({ s3Key: 'patient-files/abc/scan.png' }))).toBe(
      'not_pre_m7_key_shape',
    );
  });

  it("refuses a media/ key that belongs to a different media id", () => {
    expect(
      rawMigrationRefusalFor(libraryRow({ s3Key: 'media/33333333-3333-4333-8333-333333333333/x.mp4' })),
    ).toBe('unexpected_key_shape');
  });

  it('puts a row with no organization under the reserved platform folder, never under a tenant', () => {
    expect(rawFolderForRow({ organizationId: null })).toBe(PLATFORM_RAW_FOLDER);
    expect(rawFolderForRow({ organizationId: '  ' })).toBe(PLATFORM_RAW_FOLDER);
    expect(rawFolderForRow({ organizationId: ORG_ID })).toBe(ORG_ID);
  });
});

describe('М7 raw-bucket relocation — one row', () => {
  it('copies, verifies the size, rewrites the key and only then deletes the hot object', async () => {
    const row = libraryRow();
    const storage = fakeStorage({ hot: { [row.s3Key]: 1024 } });
    const repo = fakeRepo([row]);

    const result = await migrateOneSourceToRawBucket({ ...row }, { repo, storage, dryRun: false });

    expect(result.outcome).toBe('migrated');
    expect(result.toKey).toBe(`${ORG_ID}/media/${MEDIA_ID}/clip.mp4`);
    expect(storage.buckets.raw.get(result.toKey!)).toBe(1024);
    expect(storage.buckets.hot.has(row.s3Key)).toBe(false);
    expect(repo.rows[0]!.s3Key).toBe(result.toKey);
  });

  it('writes nothing at all in a dry run', async () => {
    const row = libraryRow();
    const storage = fakeStorage({ hot: { [row.s3Key]: 1024 } });
    const repo = fakeRepo([row]);

    const result = await migrateOneSourceToRawBucket({ ...row }, { repo, storage, dryRun: true });

    expect(result.outcome).toBe('would_migrate');
    expect(storage.calls.copies).toEqual([]);
    expect(storage.calls.deletes).toEqual([]);
    expect(repo.updates).toEqual([]);
    expect(repo.rows[0]!.s3Key).toBe(`media/${MEDIA_ID}/clip.mp4`);
  });

  it('leaves an orphaned journal row untouched instead of pointing it at an empty raw key', async () => {
    const row = libraryRow();
    const storage = fakeStorage();
    const repo = fakeRepo([row]);

    const result = await migrateOneSourceToRawBucket({ ...row }, { repo, storage, dryRun: false });

    expect(result.outcome).toBe('source_object_missing');
    expect(repo.updates).toEqual([]);
    expect(repo.rows[0]!.s3Key).toBe(`media/${MEDIA_ID}/clip.mp4`);
  });

  it('refuses to rewrite the key when the raw object does not match the source size', async () => {
    const row = libraryRow();
    const storage = fakeStorage({
      hot: { [row.s3Key]: 1024 },
      raw: { [`${ORG_ID}/media/${MEDIA_ID}/clip.mp4`]: 7 },
    });
    const repo = fakeRepo([row]);

    const result = await migrateOneSourceToRawBucket({ ...row }, { repo, storage, dryRun: false });

    expect(result.outcome).toBe('size_mismatch');
    expect(repo.updates).toEqual([]);
    expect(storage.buckets.hot.has(row.s3Key)).toBe(true);
  });

  /**
   * Resume after a crash between COPY and UPDATE: the object is already in raw, the row still
   * points at the hot key. The re-run must finish the row — not copy it twice, and not skip it.
   */
  it('finishes a row whose copy already landed, without copying again', async () => {
    const row = libraryRow();
    const storage = fakeStorage({
      hot: { [row.s3Key]: 1024 },
      raw: { [`${ORG_ID}/media/${MEDIA_ID}/clip.mp4`]: 1024 },
    });
    const repo = fakeRepo([row]);

    const result = await migrateOneSourceToRawBucket({ ...row }, { repo, storage, dryRun: false });

    expect(result.outcome).toBe('migrated');
    expect(storage.calls.copies).toEqual([]);
    expect(repo.rows[0]!.s3Key).toBe(`${ORG_ID}/media/${MEDIA_ID}/clip.mp4`);
    expect(storage.buckets.hot.has(row.s3Key)).toBe(false);
  });

  it('is idempotent: a second full run moves nothing and changes nothing', async () => {
    const row = libraryRow();
    const storage = fakeStorage({ hot: { [row.s3Key]: 1024 } });
    const repo = fakeRepo([row]);

    const first = await runRawBucketSourceMigration(
      { repo, storage },
      { dryRun: false, limit: 100, batchSize: 50 },
    );
    const second = await runRawBucketSourceMigration(
      { repo, storage },
      { dryRun: false, limit: 100, batchSize: 50 },
    );

    expect(first.outcomes.migrated).toEqual({ rows: 1, bytes: 1024 });
    expect(second.scanned).toBe(0);
    expect(storage.calls.copies).toHaveLength(1);
    expect(repo.updates).toHaveLength(1);
  });

  it('counts rows without an organization separately in the report', async () => {
    const row = libraryRow({ organizationId: null });
    const storage = fakeStorage({ hot: { [row.s3Key]: 512 } });
    const repo = fakeRepo([row]);

    const report = await runRawBucketSourceMigration(
      { repo, storage },
      { dryRun: true, limit: 100, batchSize: 50 },
    );

    expect(report.rowsWithoutOrganization).toBe(1);
    expect(report.bytesWithoutOrganization).toBe(512);
  });
});

describe('М7 counter check', () => {
  const OTHER_ORG = '44444444-4444-4444-8444-444444444444';

  function counterRepo(journal: RawMigrationJournalRow[], filesUsed: Record<string, number>) {
    return {
      ...fakeRepo([]),
      async listReadyJournalRows() {
        return journal;
      },
      async readProductFilesUsed(organizationId: string) {
        return filesUsed[organizationId] ?? null;
      },
    } satisfies RawMigrationRepo;
  }

  const sourceStorageKindForKey = (target: 'library' | 'patient', key: string) =>
    target !== 'library' ? ('hot' as const) : key.startsWith('media/') ? ('hot' as const) : ('raw' as const);

  it('reports per organization, and a folder that agrees with the journal shows no gap', async () => {
    const storage = fakeStorage({
      raw: {
        [`${ORG_ID}/media/${MEDIA_ID}/clip.mp4`]: 1000,
        [`${OTHER_ORG}/media/${MEDIA_ID}/clip.mp4`]: 30,
      },
    });
    const repo = counterRepo(
      [
        { organizationId: ORG_ID, storageTarget: 'library', s3Key: `${ORG_ID}/media/${MEDIA_ID}/clip.mp4`, sizeBytes: 1000 },
        { organizationId: ORG_ID, storageTarget: 'library', s3Key: `media/${MEDIA_ID}/report.pdf`, sizeBytes: 5 },
        { organizationId: OTHER_ORG, storageTarget: 'library', s3Key: `${OTHER_ORG}/media/${MEDIA_ID}/clip.mp4`, sizeBytes: 30 },
      ],
      { [ORG_ID]: 1005, [OTHER_ORG]: 42 },
    );

    const report = await verifyRawBucketCounters({ repo, storage, sourceStorageKindForKey });

    const first = report.rows.find((row) => row.folder === ORG_ID)!;
    expect(first.bucketBytes).toBe(1000);
    expect(first.journalRawBytes).toBe(1000);
    expect(first.bucketMinusJournalRaw).toBe(0);
    expect(first.journalHotBytes).toBe(5);
    expect(first.productMinusJournal).toBe(0);

    // The second organization's counter is 12 bytes above its journal rows — the check must show
    // that per organization, not average it away against the first one.
    const second = report.rows.find((row) => row.folder === OTHER_ORG)!;
    expect(second.productMinusJournal).toBe(12);
    expect(report.totals.mismatchedFolders).toBe(0);
  });

  it('flags a folder whose bucket volume and journal disagree', async () => {
    const storage = fakeStorage({ raw: { [`${ORG_ID}/media/${MEDIA_ID}/clip.mp4`]: 900 } });
    const repo = counterRepo(
      [
        {
          organizationId: ORG_ID,
          storageTarget: 'library',
          s3Key: `${ORG_ID}/media/${MEDIA_ID}/clip.mp4`,
          sizeBytes: 1000,
        },
      ],
      {},
    );

    const report = await verifyRawBucketCounters({ repo, storage, sourceStorageKindForKey });

    expect(report.rows[0]!.bucketMinusJournalRaw).toBe(-100);
    expect(report.totals.mismatchedFolders).toBe(1);
  });
});
