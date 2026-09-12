/**
 * М7 (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): relocate originals that were uploaded BEFORE the
 * raw bucket existed out of the hot delivery bucket and into it, and check the volume counter
 * against a walk of that bucket.
 *
 * Owner, 10.09.2026: «Может быть, нам вообще нужен отдельный bucket, куда именно загрузки
 * складываются, чистые, и там размер считать тогда просто будет — по объёму этого бакета, и там по
 * папкам внутри него, каждая папка — организация». Both halves of the step live here: the
 * relocation gives the bucket its per-organization folders, and {@link verifyRawBucketCounters}
 * reads the volume back out of those folders and holds it against the number the product shows.
 *
 * Ordering per row is fixed and idempotent — COPY, HEAD (size), UPDATE, DELETE. Any failure before
 * the UPDATE leaves the row exactly as it was and addressable in the hot bucket
 * (`sourceStorageKindForKey` decides the bucket from the key's shape), so a re-run finishes the row
 * instead of duplicating it.
 */
import { posix } from 'node:path';
import {
  isCanonicalMediaRootForId,
  isLegacyHotMediaSourceKey,
  mediaRootFromSourceS3Key,
} from '@/shared/lib/hlsStorageLayout';
import { encoderOutputFor } from '@/shared/lib/mediaEncoderOutput';
import type { StorageTarget } from '@/shared/types/storageTarget';

/**
 * Reserved top-level folder for journal rows with no `organization_id` (platform-owned media).
 *
 * Not a uuid, so it can never collide with an organization folder, and named rather than derived:
 * silently attributing platform media to some organization would put bytes into that tenant's paid
 * volume. Owner's rule is «каждая папка — организация»; this is the one explicit exception to it.
 */
export const PLATFORM_RAW_FOLDER = 'platform';

export type RawMigrationCandidateRow = {
  id: string;
  organizationId: string | null;
  s3Key: string;
  sizeBytes: number;
  storageTarget: string;
  status: string;
  mimeType: string;
};

export type RawMigrationJournalRow = {
  organizationId: string | null;
  storageTarget: string;
  s3Key: string;
  sizeBytes: number;
};

export type RawMigrationRepo = {
  listCandidates(input: { afterId: string | null; limit: number }): Promise<
    RawMigrationCandidateRow[]
  >;
  updateSourceKey(input: { id: string; fromKey: string; toKey: string }): Promise<boolean>;
  listReadyJournalRows(): Promise<RawMigrationJournalRow[]>;
  /** `null` when the product counter was not read (no platform identity supplied). */
  readProductFilesUsed(organizationId: string): Promise<number | null>;
};

export type RawMigrationStorageKind = 'raw' | 'hot';

export type RawMigrationStorage = {
  headObject(key: string, kind: RawMigrationStorageKind): Promise<{ sizeBytes: number } | null>;
  copyObject(input: {
    sourceKey: string;
    sourceKind: RawMigrationStorageKind;
    destinationKey: string;
    destinationKind: RawMigrationStorageKind;
  }): Promise<void>;
  deleteObject(key: string, kind: RawMigrationStorageKind): Promise<void>;
  listObjects(
    prefix: string,
    kind: RawMigrationStorageKind,
  ): Promise<{ key: string; sizeBytes: number }[]>;
  /** `<folder>/media/<mediaId>/<file>` — the application's own raw key builder. */
  rawObjectKey(folder: string, mediaId: string, filename: string): string;
};

/** Why a row handed to the migrator must not be relocated. `null` = it may move. */
export type RawMigrationRefusal =
  | 'not_library_target'
  | 'not_ready'
  | 'not_pre_m7_key_shape'
  | 'unexpected_key_shape'
  | 'no_encoder_output_to_serve_from_raw';

export type RawMigrationRowOutcome =
  | 'migrated'
  | 'would_migrate'
  | 'already_in_raw'
  | 'source_object_missing'
  | 'size_mismatch'
  | 'update_conflict'
  | 'hot_delete_failed'
  | RawMigrationRefusal;

export type RawMigrationRowResult = {
  id: string;
  outcome: RawMigrationRowOutcome;
  fromKey: string;
  toKey: string | null;
  sizeBytes: number;
};

/**
 * The authority on what may move — deliberately independent of the SQL that selected the row.
 *
 * `patient` media is outside М7 entirely (its bucket does not split), a non-`ready` row is either
 * an upload still in flight or already staged for deletion, and a key that is not the pre-М7 shape
 * either already moved or was never a `media/<id>/…` original at all. Relocating any of those would
 * point the journal at a bucket the object is not in — the exact failure this whole seam exists to
 * prevent.
 *
 * Interim guard (raw-migration-audit-01, 2026-09-12 FAIL): a type `encoderOutputFor` says our
 * encoder never produces anything for (`'none'` — documents, audio, everything but image/video)
 * has no re-encoded fallback yet, and `resolveDeliverableMediaObject` serves that type ONLY when
 * the object is still physically in the HOT bucket. Relocating such a row here would 404 it for
 * everyone, permanently — the raw copy would exist, but nothing serves it. Left alone in hot until
 * a real re-encoding pipeline for those types lands (owner, 12.09: build it for every uploadable
 * type that can execute — PDF/audio/doc-docx/xls-xlsx — same as images/video already have).
 */
export function rawMigrationRefusalFor(row: {
  id: string;
  s3Key: string;
  storageTarget: string;
  status: string;
  mimeType: string;
}): RawMigrationRefusal | null {
  if (row.storageTarget !== 'library') return 'not_library_target';
  if (row.status !== 'ready') return 'not_ready';
  const key = row.s3Key.trim();
  if (!key || !isLegacyHotMediaSourceKey(key)) return 'not_pre_m7_key_shape';
  if (!isCanonicalMediaRootForId(mediaRootFromSourceS3Key(key), row.id)) {
    return 'unexpected_key_shape';
  }
  if (encoderOutputFor(row.mimeType) === 'none') return 'no_encoder_output_to_serve_from_raw';
  return null;
}

/** Top-level raw folder of a row: its organization, or the reserved platform folder. */
export function rawFolderForRow(row: { organizationId: string | null }): string {
  const organizationId = row.organizationId?.trim();
  return organizationId ? organizationId : PLATFORM_RAW_FOLDER;
}

export async function migrateOneSourceToRawBucket(
  row: RawMigrationCandidateRow,
  deps: { repo: RawMigrationRepo; storage: RawMigrationStorage; dryRun: boolean },
): Promise<RawMigrationRowResult> {
  const fromKey = row.s3Key.trim();
  const refusal = rawMigrationRefusalFor(row);
  if (refusal) {
    return { id: row.id, outcome: refusal, fromKey, toKey: null, sizeBytes: row.sizeBytes };
  }

  const toKey = deps.storage.rawObjectKey(rawFolderForRow(row), row.id, posix.basename(fromKey));

  /* The physical object decides, not `size_bytes`: a journal row whose object is gone must never
   * turn into an UPDATE pointing at a raw key that holds nothing. */
  const source = await deps.storage.headObject(fromKey, 'hot');
  if (!source) {
    return {
      id: row.id,
      outcome: 'source_object_missing',
      fromKey,
      toKey,
      sizeBytes: row.sizeBytes,
    };
  }

  const alreadyCopied = await deps.storage.headObject(toKey, 'raw');
  if (alreadyCopied && alreadyCopied.sizeBytes !== source.sizeBytes) {
    /* Same key, different bytes — a collision, not a resumable copy. Overwriting it would destroy
       whatever is there; the run reports it and moves on. */
    return { id: row.id, outcome: 'size_mismatch', fromKey, toKey, sizeBytes: source.sizeBytes };
  }

  if (deps.dryRun) {
    return {
      id: row.id,
      outcome: alreadyCopied ? 'already_in_raw' : 'would_migrate',
      fromKey,
      toKey,
      sizeBytes: source.sizeBytes,
    };
  }

  if (!alreadyCopied) {
    await deps.storage.copyObject({
      sourceKey: fromKey,
      sourceKind: 'hot',
      destinationKey: toKey,
      destinationKind: 'raw',
    });
  }

  const copied = await deps.storage.headObject(toKey, 'raw');
  if (!copied || copied.sizeBytes !== source.sizeBytes) {
    return { id: row.id, outcome: 'size_mismatch', fromKey, toKey, sizeBytes: source.sizeBytes };
  }

  const updated = await deps.repo.updateSourceKey({ id: row.id, fromKey, toKey });
  if (!updated) {
    return { id: row.id, outcome: 'update_conflict', fromKey, toKey, sizeBytes: source.sizeBytes };
  }

  try {
    await deps.storage.deleteObject(fromKey, 'hot');
  } catch {
    /* The journal already points at the raw copy, so the file is served and counted correctly; what
       is left behind is a stray hot object. Reported by id so it can be removed, never retried in a
       way that could touch the new key. */
    return {
      id: row.id,
      outcome: 'hot_delete_failed',
      fromKey,
      toKey,
      sizeBytes: source.sizeBytes,
    };
  }

  return { id: row.id, outcome: 'migrated', fromKey, toKey, sizeBytes: source.sizeBytes };
}

export type RawMigrationReport = {
  dryRun: boolean;
  scanned: number;
  /** Rows by outcome, and the bytes they represent. */
  outcomes: Record<string, { rows: number; bytes: number }>;
  rowsWithoutOrganization: number;
  bytesWithoutOrganization: number;
  /** Ids worth acting on by hand, grouped by the outcome that produced them. */
  flaggedIds: Record<string, string[]>;
  lastId: string | null;
};

const MAX_FLAGGED_IDS = 200;

export async function runRawBucketSourceMigration(
  deps: { repo: RawMigrationRepo; storage: RawMigrationStorage },
  options: { dryRun: boolean; limit: number; batchSize: number },
): Promise<RawMigrationReport> {
  const report: RawMigrationReport = {
    dryRun: options.dryRun,
    scanned: 0,
    outcomes: {},
    rowsWithoutOrganization: 0,
    bytesWithoutOrganization: 0,
    flaggedIds: {},
    lastId: null,
  };

  let afterId: string | null = null;
  while (report.scanned < options.limit) {
    const take = Math.min(options.batchSize, options.limit - report.scanned);
    const rows = await deps.repo.listCandidates({ afterId, limit: take });
    if (rows.length === 0) break;

    for (const row of rows) {
      const result = await migrateOneSourceToRawBucket(row, { ...deps, dryRun: options.dryRun });
      report.scanned += 1;
      report.lastId = row.id;
      const bucket = (report.outcomes[result.outcome] ??= { rows: 0, bytes: 0 });
      bucket.rows += 1;
      bucket.bytes += result.sizeBytes;
      if (!row.organizationId) {
        report.rowsWithoutOrganization += 1;
        report.bytesWithoutOrganization += result.sizeBytes;
      }
      if (result.outcome !== 'migrated' && result.outcome !== 'would_migrate') {
        const ids = (report.flaggedIds[result.outcome] ??= []);
        if (ids.length < MAX_FLAGGED_IDS) ids.push(row.id);
      }
    }

    afterId = rows[rows.length - 1]?.id ?? afterId;
    /* A COMMIT run takes migrated rows out of the candidate set, so the cursor only has to step
       over rows this run refused; a dry run changes nothing and needs the cursor for every row. */
    if (rows.length < take) break;
  }

  return report;
}

export type RawBucketCounterCheckRow = {
  /** Organization id, or {@link PLATFORM_RAW_FOLDER} for the reserved platform folder. */
  folder: string;
  /** Bytes read by walking the raw bucket — the owner's «по объёму этого бакета» number. */
  bucketBytes: number;
  bucketObjects: number;
  /** Journal bytes of rows whose key resolves to the RAW bucket — what the bucket should hold. */
  journalRawBytes: number;
  /** Journal bytes of rows that legitimately stay in the hot bucket (documents, audio, patient). */
  journalHotBytes: number;
  /** `bucketBytes - journalRawBytes`: everything the walk and the journal disagree about. */
  bucketMinusJournalRaw: number;
  /** `files_used` as the product reports it, or `null` when it was not read. */
  productFilesUsed: number | null;
  /**
   * `productFilesUsed - (journalRawBytes + journalHotBytes)`. Non-zero is not automatically a
   * defect: the counter also sums `patient_files` rows that have no journal row of their own.
   */
  productMinusJournal: number | null;
};

export type RawBucketCounterCheckReport = {
  rows: RawBucketCounterCheckRow[];
  totals: {
    bucketBytes: number;
    bucketObjects: number;
    journalRawBytes: number;
    mismatchedFolders: number;
  };
};

/**
 * Second half of the М7 checklist item: read the volume out of the raw bucket by top-level folder
 * and hold it against the counter, PER ORGANIZATION — a single total would hide two errors that
 * cancel out.
 */
export async function verifyRawBucketCounters(deps: {
  repo: RawMigrationRepo;
  storage: RawMigrationStorage;
  /** Classifies a persisted key's physical bucket — the application's own `sourceStorageKindForKey`. */
  sourceStorageKindForKey: (target: StorageTarget, key: string) => RawMigrationStorageKind;
}): Promise<RawBucketCounterCheckReport> {
  const bucketByFolder = new Map<string, { bytes: number; objects: number }>();
  for (const object of await deps.storage.listObjects('', 'raw')) {
    const folder = object.key.split('/')[0] ?? '';
    if (!folder) continue;
    const entry = bucketByFolder.get(folder) ?? { bytes: 0, objects: 0 };
    entry.bytes += object.sizeBytes;
    entry.objects += 1;
    bucketByFolder.set(folder, entry);
  }

  const journalByFolder = new Map<string, { raw: number; hot: number }>();
  for (const row of await deps.repo.listReadyJournalRows()) {
    const folder = rawFolderForRow(row);
    const target: StorageTarget = row.storageTarget === 'patient' ? 'patient' : 'library';
    const kind = deps.sourceStorageKindForKey(target, row.s3Key);
    const entry = journalByFolder.get(folder) ?? { raw: 0, hot: 0 };
    if (kind === 'raw') entry.raw += row.sizeBytes;
    else entry.hot += row.sizeBytes;
    journalByFolder.set(folder, entry);
  }

  const folders = [...new Set([...bucketByFolder.keys(), ...journalByFolder.keys()])].sort();
  const rows: RawBucketCounterCheckRow[] = [];
  for (const folder of folders) {
    const bucket = bucketByFolder.get(folder) ?? { bytes: 0, objects: 0 };
    const journal = journalByFolder.get(folder) ?? { raw: 0, hot: 0 };
    const productFilesUsed =
      folder === PLATFORM_RAW_FOLDER ? null : await deps.repo.readProductFilesUsed(folder);
    rows.push({
      folder,
      bucketBytes: bucket.bytes,
      bucketObjects: bucket.objects,
      journalRawBytes: journal.raw,
      journalHotBytes: journal.hot,
      bucketMinusJournalRaw: bucket.bytes - journal.raw,
      productFilesUsed,
      productMinusJournal:
        productFilesUsed === null ? null : productFilesUsed - (journal.raw + journal.hot),
    });
  }

  return {
    rows,
    totals: {
      bucketBytes: rows.reduce((sum, row) => sum + row.bucketBytes, 0),
      bucketObjects: rows.reduce((sum, row) => sum + row.bucketObjects, 0),
      journalRawBytes: rows.reduce((sum, row) => sum + row.journalRawBytes, 0),
      mismatchedFolders: rows.filter((row) => row.bucketMinusJournalRaw !== 0).length,
    },
  };
}
