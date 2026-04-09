import type { PoolClient } from "pg";

export type ResolvedMediaForIntake = {
  mediaId: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
};

/**
 * Resolve `media_files.id` for LFK intake: ownership + readable status + s3_key.
 * Call inside the same transaction as attachment inserts.
 */
export async function resolveMediaFileForLfkAttachment(
  client: PoolClient,
  mediaId: string,
  userId: string,
): Promise<ResolvedMediaForIntake> {
  const { rows } = await client.query<{
    id: string;
    s3_key: string | null;
    mime_type: string;
    size_bytes: string;
    original_name: string;
    status: string | null;
    uploaded_by: string | null;
  }>(
    `SELECT id, s3_key, mime_type, size_bytes, original_name, status, uploaded_by
     FROM media_files WHERE id = $1::uuid`,
    [mediaId],
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error("attachment_file_not_found"), { code: "ATTACHMENT_FILE_INVALID" as const });
  }
  if (row.uploaded_by !== userId) {
    throw Object.assign(new Error("attachment_file_forbidden"), { code: "ATTACHMENT_FILE_FORBIDDEN" as const });
  }
  const st = row.status;
  if (st === "pending" || st === "deleting" || st === "pending_delete") {
    throw Object.assign(new Error("attachment_file_not_ready"), { code: "ATTACHMENT_FILE_INVALID" as const });
  }
  if (!row.s3_key) {
    throw Object.assign(new Error("attachment_file_no_s3"), { code: "ATTACHMENT_FILE_INVALID" as const });
  }
  return {
    mediaId: row.id,
    s3Key: row.s3_key,
    mimeType: row.mime_type,
    sizeBytes: parseInt(row.size_bytes, 10),
    originalName: row.original_name,
  };
}
