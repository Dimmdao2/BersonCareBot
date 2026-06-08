#!/usr/bin/env tsx
/**
 * Backfill: rebuild instance stage item snapshots corrupted by editor-batch draft preview
 * (`mediaUrl` + `/preview/sm` + `mediaType: image` on exercises, etc.) using catalog `buildSnapshot`.
 *
 * Usage (production host — load env first):
 *   set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
 *   pnpm --dir /opt/projects/bersoncarebot/apps/webapp run backfill-treatment-program-editor-draft-snapshots
 *   pnpm --dir /opt/projects/bersoncarebot/apps/webapp run backfill-treatment-program-editor-draft-snapshots -- --commit
 *   pnpm --dir ... run backfill-treatment-program-editor-draft-snapshots -- --commit --since-days=14
 *   pnpm --dir ... run backfill-treatment-program-editor-draft-snapshots -- --commit --instance-id=UUID
 *   pnpm --dir ... run backfill-treatment-program-editor-draft-snapshots -- --commit --all
 *
 * Default: dry-run (lists candidates, no UPDATE).
 */
import "dotenv/config";
import pg from "pg";
import { createPgTreatmentProgramItemSnapshotPort } from "../src/infra/repos/pgTreatmentProgramItemSnapshot";
import {
  EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE,
  instanceStageItemSnapshotNeedsCatalogRebuild,
} from "../src/modules/treatment-program/editorDraftSnapshotDetect";
import type { TreatmentProgramItemType } from "../src/modules/treatment-program/types";

type CandidateRow = {
  id: string;
  item_type: string;
  item_ref_id: string;
  instance_id: string;
  instance_title: string;
  instance_updated_at: string;
  snapshot: Record<string, unknown>;
};

type BackfillError = {
  itemId: string;
  instanceId: string;
  itemType: string;
  itemRefId: string;
  message: string;
};

type BatchStats = {
  fetched: number;
  candidates: number;
  sqlFalsePositives: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

const argv = process.argv.slice(2);

function has(flag: string): boolean {
  return argv.includes(flag);
}

function strArg(prefix: string): string | null {
  const raw = argv.find((a) => a.startsWith(`${prefix}=`));
  if (!raw) return null;
  const v = raw.slice(prefix.length + 1).trim();
  return v || null;
}

function numArg(prefix: string, fallback: number): number {
  const raw = argv.find((a) => a.startsWith(`${prefix}=`));
  if (!raw) return fallback;
  const n = Number(raw.slice(prefix.length + 1));
  return Number.isFinite(n) ? n : fallback;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function printHelp(): void {
  console.log(`backfill-treatment-program-editor-draft-snapshots

  --commit              Apply UPDATE. Default is dry-run.
  --since-days=N        Only instances with updated_at >= now() - N days (default: all).
  --instance-id=UUID    Limit to one program instance.
  --limit=N             Max candidate rows per batch (default 5000). LIMIT applies after SQL draft-detector filter.
  --all                 Process all matching candidates in batches of --limit (keyset pagination by ti.id).
  -h, --help            This help.
`);
}

function buildBaseWhere(params: {
  sinceDays: number;
  instanceId: string | null;
}): { where: string[]; values: unknown[] } {
  const where: string[] = [
    `ti.item_type IN ('exercise', 'recommendation', 'clinical_test')`,
    `inst.status IN ('active', 'completed')`,
    EDITOR_DRAFT_SNAPSHOT_SQL_PREDICATE,
  ];
  const values: unknown[] = [];
  if (params.sinceDays > 0) {
    values.push(params.sinceDays);
    where.push(`inst.updated_at >= now() - make_interval(days => $${values.length}::int)`);
  }
  if (params.instanceId) {
    values.push(params.instanceId);
    where.push(`inst.id = $${values.length}::uuid`);
  }
  return { where, values };
}

function fromJoinSql(): string {
  return `
    FROM public.treatment_program_instance_stage_items ti
    JOIN public.treatment_program_instance_stages st ON st.id = ti.stage_id
    JOIN public.treatment_program_instances inst ON inst.id = st.instance_id
  `;
}

async function countCandidates(
  pool: pg.Pool,
  base: ReturnType<typeof buildBaseWhere>,
): Promise<number> {
  const sql = `
    SELECT COUNT(*)::int AS n
    ${fromJoinSql()}
    WHERE ${base.where.join(" AND ")}
  `;
  const { rows } = await pool.query<{ n: number }>(sql, base.values);
  return rows[0]?.n ?? 0;
}

async function fetchCandidateBatch(
  pool: pg.Pool,
  base: ReturnType<typeof buildBaseWhere>,
  opts: { limit: number; processAll: boolean; afterItemId: string | null },
): Promise<CandidateRow[]> {
  const values = [...base.values];
  const where = [...base.where];
  if (opts.processAll && opts.afterItemId) {
    values.push(opts.afterItemId);
    where.push(`ti.id > $${values.length}::uuid`);
  }
  values.push(opts.limit);
  const orderBy = opts.processAll ? `ti.id ASC` : `inst.updated_at DESC, ti.id ASC`;
  const sql = `
    SELECT
      ti.id,
      ti.item_type,
      ti.item_ref_id,
      ti.snapshot,
      inst.id AS instance_id,
      inst.title AS instance_title,
      inst.updated_at::text AS instance_updated_at
    ${fromJoinSql()}
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${values.length}
  `;
  const { rows } = await pool.query<CandidateRow>(sql, values);
  return rows;
}

async function processBatch(
  pool: pg.Pool,
  snapshots: ReturnType<typeof createPgTreatmentProgramItemSnapshotPort>,
  rows: CandidateRow[],
  dryRun: boolean,
): Promise<{ stats: BatchStats; errors: BackfillError[] }> {
  const candidates = rows.filter((row) =>
    instanceStageItemSnapshotNeedsCatalogRebuild(row.item_type, row.snapshot ?? {}),
  );
  const stats: BatchStats = {
    fetched: rows.length,
    candidates: candidates.length,
    sqlFalsePositives: rows.length - candidates.length,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  };
  const errors: BackfillError[] = [];

  for (const row of candidates) {
    const itemType = row.item_type as TreatmentProgramItemType;
    try {
      const next = await snapshots.buildSnapshot(itemType, row.item_ref_id);
      if (stableJson(next) === stableJson(row.snapshot)) {
        stats.unchanged += 1;
        continue;
      }
      if (dryRun) {
        console.log(
          `[dry-run] would update item=${row.id} instance=${row.instance_id} title=${JSON.stringify(row.instance_title)} type=${itemType}`,
        );
        stats.updated += 1;
        continue;
      }
      await pool.query(
        `UPDATE public.treatment_program_instance_stage_items
         SET snapshot = $1::jsonb
         WHERE id = $2::uuid`,
        [JSON.stringify(next), row.id],
      );
      stats.updated += 1;
    } catch (e) {
      stats.skipped += 1;
      errors.push({
        itemId: row.id,
        instanceId: row.instance_id,
        itemType: row.item_type,
        itemRefId: row.item_ref_id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { stats, errors };
}

async function main(): Promise<void> {
  if (has("-h") || has("--help")) {
    printHelp();
    return;
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }

  const dryRun = !has("--commit");
  const sinceDays = numArg("--since-days", 0);
  const limit = Math.max(1, Math.min(numArg("--limit", 5000), 50_000));
  const instanceId = strArg("--instance-id");
  const processAll = has("--all");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const snapshots = createPgTreatmentProgramItemSnapshotPort();
  const base = buildBaseWhere({ sinceDays, instanceId });

  try {
    const candidatesTotal = await countCandidates(pool, base);

    console.log(
      JSON.stringify(
        {
          dryRun,
          candidatesTotal,
          sinceDays: sinceDays > 0 ? sinceDays : null,
          instanceId,
          processAll,
          batchLimit: limit,
        },
        null,
        2,
      ),
    );

    if (candidatesTotal === 0) {
      return;
    }

    const totals: BatchStats = {
      fetched: 0,
      candidates: 0,
      sqlFalsePositives: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    };
    const allErrors: BackfillError[] = [];
    let afterItemId: string | null = null;
    let batchIndex = 0;

    do {
      batchIndex += 1;
      const rows = await fetchCandidateBatch(pool, base, {
        limit,
        processAll,
        afterItemId,
      });
      if (rows.length === 0) {
        break;
      }

      const { stats, errors } = await processBatch(pool, snapshots, rows, dryRun);
      totals.fetched += stats.fetched;
      totals.candidates += stats.candidates;
      totals.sqlFalsePositives += stats.sqlFalsePositives;
      totals.updated += stats.updated;
      totals.unchanged += stats.unchanged;
      totals.skipped += stats.skipped;
      allErrors.push(...errors);

      if (processAll) {
        afterItemId = rows[rows.length - 1]!.id;
        console.log(
          JSON.stringify(
            {
              batch: batchIndex,
              fetched: stats.fetched,
              candidates: stats.candidates,
              wouldUpdateThisBatch: dryRun ? stats.updated : undefined,
              updatedThisBatch: dryRun ? undefined : stats.updated,
            },
            null,
            2,
          ),
        );
      }

      if (!processAll || rows.length < limit) {
        break;
      }
    } while (processAll);

    console.log(
      JSON.stringify(
        {
          dryRun,
          candidatesTotal,
          fetched: totals.fetched,
          candidates: totals.candidates,
          sqlFalsePositives: totals.sqlFalsePositives,
          updated: dryRun ? 0 : totals.updated,
          wouldUpdate: dryRun ? totals.updated : undefined,
          unchanged: totals.unchanged,
          skipped: totals.skipped,
          batches: batchIndex,
          errors: allErrors.length > 0 ? allErrors.slice(0, 20) : undefined,
        },
        null,
        2,
      ),
    );

    if (allErrors.length > 20) {
      console.log(`… and ${allErrors.length - 20} more errors`);
    }

    if (!processAll && candidatesTotal > totals.fetched) {
      console.log(
        `Note: ${candidatesTotal - totals.fetched} more candidate(s) in DB; re-run with --all or increase --limit.`,
      );
    }
  } finally {
    await pool.end();
  }
}

void main();
