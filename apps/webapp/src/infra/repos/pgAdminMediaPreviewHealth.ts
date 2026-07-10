import { runWebappPgText } from "@/infra/db/runWebappSql";

export type AdminMediaPreviewGroupedRow = {
  mime_type: string;
  preview_status: string;
  cnt: string;
};

export async function loadAdminMediaPreviewGroupedCounts(
  mimeTypes: readonly string[],
): Promise<AdminMediaPreviewGroupedRow[]> {
  const r = await runWebappPgText<AdminMediaPreviewGroupedRow>(
    `SELECT mime_type, preview_status, count(*)::text AS cnt
     FROM media_files
     WHERE mime_type = ANY($1::text[])
     GROUP BY mime_type, preview_status`,
    [mimeTypes],
  );
  return r.rows;
}

export async function loadAdminMediaPreviewStalePendingCount(
  mimeTypes: readonly string[],
  stalePendingMinutes: number,
): Promise<number> {
  const r = await runWebappPgText<{ stale_pending_count: string }>(
    `SELECT count(*)::text AS stale_pending_count
     FROM media_files
     WHERE mime_type = ANY($1::text[])
       AND preview_status = 'pending'
       AND created_at < now() - ($2::numeric * interval '1 minute')`,
    [mimeTypes, stalePendingMinutes],
  );
  return Number.parseInt(r.rows[0]?.stale_pending_count ?? "0", 10) || 0;
}
