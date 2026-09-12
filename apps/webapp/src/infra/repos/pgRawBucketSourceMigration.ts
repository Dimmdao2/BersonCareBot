/**
 * DB side of the М7 relocation of already-uploaded originals into the raw bucket
 * (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`, М7 — «Перенос уже лежащих оригиналов в сырой
 * бакет + сверка счётчика»). Reads and writes go through the single `getDrizzle()` chokepoint;
 * the one function call (`app.read_org_enforced_quota_usage`) goes through `runWebappSql`, exactly
 * as the product's own platform quota view does — the counter this step is checked against must be
 * THE product's number, not a second sum written here.
 */
import { and, asc, eq, gt, isNotNull, like, sql } from 'drizzle-orm';
import { runWithDbPlatformPrincipal } from '@bersoncare/db-principal';
import { mediaFiles } from '../../../db/schema/schema';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import type {
  RawMigrationCandidateRow,
  RawMigrationJournalRow,
  RawMigrationRepo,
} from '@/app-layer/media/rawBucketSourceMigration';

/**
 * `LIKE 'media/%'` narrows the scan to the pre-М7 key shape; it is not the authority on what may
 * move. The per-row guard in the app layer (`rawMigrationRefusalFor`) decides that, so a row the
 * SQL happens to return and the guard refuses is skipped and reported, never relocated.
 */
export function createPgRawBucketSourceMigrationRepo(options: {
  /** Global-admin identity used ONLY to select the platform capability for the counter read. */
  platformUserId?: string;
}): RawMigrationRepo {
  return {
    async listCandidates(input) {
      const rows = await getDrizzle()
        .select({
          id: mediaFiles.id,
          organizationId: mediaFiles.organizationId,
          s3Key: mediaFiles.s3Key,
          sizeBytes: mediaFiles.sizeBytes,
          storageTarget: mediaFiles.storageTarget,
          status: mediaFiles.status,
          mimeType: mediaFiles.mimeType,
        })
        .from(mediaFiles)
        .where(
          and(
            eq(mediaFiles.storageTarget, 'library'),
            isNotNull(mediaFiles.s3Key),
            like(mediaFiles.s3Key, 'media/%'),
            ...(input.afterId ? [gt(mediaFiles.id, input.afterId)] : []),
          ),
        )
        .orderBy(asc(mediaFiles.id))
        .limit(input.limit);
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        s3Key: row.s3Key ?? '',
        sizeBytes: Number(row.sizeBytes ?? 0),
        storageTarget: row.storageTarget,
        status: row.status,
        mimeType: row.mimeType,
      })) satisfies RawMigrationCandidateRow[];
    },

    /**
     * Guarded by the key it is replacing: a row whose `s3_key` changed under us (a concurrent
     * upload-complete, another run of this tool) is left alone and reported, instead of being
     * pointed at a raw object that belongs to a different upload.
     */
    async updateSourceKey(input) {
      const updated = await getDrizzle()
        .update(mediaFiles)
        .set({ s3Key: input.toKey })
        .where(and(eq(mediaFiles.id, input.id), eq(mediaFiles.s3Key, input.fromKey)))
        .returning({ id: mediaFiles.id });
      return updated.length === 1;
    },

    /**
     * Every `ready` journal row with its organization, target and key — the counter's own source
     * rows. Bucket-vs-counter reconciliation classifies them in TypeScript with the application's
     * `sourceStorageKindForKey`, so «which bucket does this key live in» is answered by ONE
     * predicate for the product and for this check alike.
     */
    async listReadyJournalRows() {
      const rows = await getDrizzle()
        .select({
          organizationId: mediaFiles.organizationId,
          storageTarget: mediaFiles.storageTarget,
          s3Key: mediaFiles.s3Key,
          sizeBytes: mediaFiles.sizeBytes,
        })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.status, 'ready'), isNotNull(mediaFiles.s3Key)));
      return rows.map((row) => ({
        organizationId: row.organizationId,
        storageTarget: row.storageTarget,
        s3Key: row.s3Key ?? '',
        sizeBytes: Number(row.sizeBytes ?? 0),
      })) satisfies RawMigrationJournalRow[];
    },

    /**
     * The number the product shows for this organization: `files_used` from
     * `app.read_org_enforced_quota_usage`, the same SECURITY DEFINER read behind the global-admin
     * quota view (`pgOrgEntitlements.getEnforcedQuotaUsage`). EXECUTE on it is granted to
     * `app_platform_settings` only, which is why the read is scoped to a platform principal.
     */
    async readProductFilesUsed(organizationId) {
      const platformUserId = options.platformUserId;
      if (!platformUserId) return null;
      return runWithDbPlatformPrincipal(
        { platformUserId, source: 'ops/media-raw-bucket-migrate:verify' },
        async () => {
          const result = await runWebappSql<{ files_used: string | number | null }>(
            getWebappSqlDb(),
            sql`SELECT files_used FROM app.read_org_enforced_quota_usage(${organizationId}::uuid)`,
          );
          const value = result.rows[0]?.files_used;
          return value == null ? null : Number(value);
        },
      );
    },
  };
}
