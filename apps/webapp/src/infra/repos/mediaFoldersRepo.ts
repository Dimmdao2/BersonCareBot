import { getPool } from "@/infra/db/client";
import type { MediaFolderRecord } from "@/modules/media/types";

export async function pgListFolders(parentId: string | null): Promise<MediaFolderRecord[]> {
  const pool = getPool();
  const res = await pool.query<{ id: string; parent_id: string | null; name: string; created_at: Date }>(
    parentId === null
      ? `SELECT id, parent_id, name, created_at FROM media_folders WHERE parent_id IS NULL ORDER BY name_normalized ASC`
      : `SELECT id, parent_id, name, created_at FROM media_folders WHERE parent_id = $1::uuid ORDER BY name_normalized ASC`,
    parentId === null ? [] : [parentId],
  );
  return res.rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function pgCreateFolder(params: {
  name: string;
  parentId: string | null;
  createdBy: string;
}): Promise<MediaFolderRecord> {
  const pool = getPool();
  const res = await pool.query<{ id: string; parent_id: string | null; name: string; created_at: Date }>(
    `INSERT INTO media_folders (parent_id, name, created_by)
     VALUES ($1::uuid, $2, $3::uuid)
     RETURNING id, parent_id, name, created_at`,
    [params.parentId, params.name.trim(), params.createdBy],
  );
  const row = res.rows[0];
  if (!row) throw new Error("folder_create_failed");
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

export async function pgRenameFolder(folderId: string, name: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(`UPDATE media_folders SET name = $2, updated_at = now() WHERE id = $1::uuid`, [
    folderId,
    name.trim(),
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function pgMoveFolder(folderId: string, newParentId: string | null): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(
    `UPDATE media_folders SET parent_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
    [folderId, newParentId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function pgDeleteFolderIfEmpty(folderId: string): Promise<{ ok: true } | { ok: false; error: "not_empty" }> {
  const pool = getPool();
  const child = await pool.query(`SELECT 1 FROM media_folders WHERE parent_id = $1::uuid LIMIT 1`, [folderId]);
  if ((child.rowCount ?? 0) > 0) {
    return { ok: false, error: "not_empty" };
  }
  const files = await pool.query(`SELECT 1 FROM media_files WHERE folder_id = $1::uuid LIMIT 1`, [folderId]);
  if ((files.rowCount ?? 0) > 0) {
    return { ok: false, error: "not_empty" };
  }
  const del = await pool.query(`DELETE FROM media_folders WHERE id = $1::uuid`, [folderId]);
  return (del.rowCount ?? 0) > 0 ? { ok: true } : { ok: false, error: "not_empty" };
}

export async function pgFolderExists(id: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(`SELECT 1 FROM media_folders WHERE id = $1::uuid`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function pgListAllFolders(): Promise<MediaFolderRecord[]> {
  const pool = getPool();
  const res = await pool.query<{ id: string; parent_id: string | null; name: string; created_at: Date }>(
    `SELECT id, parent_id, name, created_at FROM media_folders ORDER BY parent_id NULLS FIRST, name_normalized ASC`,
  );
  return res.rows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  }));
}
