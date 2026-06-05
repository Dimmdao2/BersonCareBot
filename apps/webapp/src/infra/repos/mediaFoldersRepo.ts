import { asc, eq, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { mediaFiles, mediaFolders } from "../../../db/schema/schema";
import type { MediaFolderRecord } from "@/modules/media/types";

function mapFolderRow(row: {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
}): MediaFolderRecord {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    createdAt: row.createdAt,
  };
}

export async function pgListFolders(parentId: string | null): Promise<MediaFolderRecord[]> {
  const db = getDrizzle();
  const rows = await db
    .select({
      id: mediaFolders.id,
      parentId: mediaFolders.parentId,
      name: mediaFolders.name,
      createdAt: mediaFolders.createdAt,
    })
    .from(mediaFolders)
    .where(parentId === null ? isNull(mediaFolders.parentId) : eq(mediaFolders.parentId, parentId))
    .orderBy(asc(mediaFolders.nameNormalized));
  return rows.map(mapFolderRow);
}

export async function pgCreateFolder(params: {
  name: string;
  parentId: string | null;
  createdBy: string;
}): Promise<MediaFolderRecord> {
  const db = getDrizzle();
  const rows = await db
    .insert(mediaFolders)
    .values({
      parentId: params.parentId,
      name: params.name.trim(),
      createdBy: params.createdBy,
    })
    .returning({
      id: mediaFolders.id,
      parentId: mediaFolders.parentId,
      name: mediaFolders.name,
      createdAt: mediaFolders.createdAt,
    });
  const row = rows[0];
  if (!row) throw new Error("folder_create_failed");
  return mapFolderRow(row);
}

export async function pgRenameFolder(folderId: string, name: string): Promise<boolean> {
  const db = getDrizzle();
  const rows = await db
    .update(mediaFolders)
    .set({ name: name.trim(), updatedAt: sql`now()` })
    .where(eq(mediaFolders.id, folderId))
    .returning({ id: mediaFolders.id });
  return rows.length > 0;
}

export async function pgMoveFolder(folderId: string, newParentId: string | null): Promise<boolean> {
  const db = getDrizzle();
  const rows = await db
    .update(mediaFolders)
    .set({ parentId: newParentId, updatedAt: sql`now()` })
    .where(eq(mediaFolders.id, folderId))
    .returning({ id: mediaFolders.id });
  return rows.length > 0;
}

export async function pgDeleteFolderIfEmpty(folderId: string): Promise<{ ok: true } | { ok: false; error: "not_empty" }> {
  const db = getDrizzle();
  const child = await db
    .select({ one: sql<number>`1` })
    .from(mediaFolders)
    .where(eq(mediaFolders.parentId, folderId))
    .limit(1);
  if (child.length > 0) {
    return { ok: false, error: "not_empty" };
  }
  const files = await db
    .select({ one: sql<number>`1` })
    .from(mediaFiles)
    .where(eq(mediaFiles.folderId, folderId))
    .limit(1);
  if (files.length > 0) {
    return { ok: false, error: "not_empty" };
  }
  const del = await db.delete(mediaFolders).where(eq(mediaFolders.id, folderId)).returning({ id: mediaFolders.id });
  return del.length > 0 ? { ok: true } : { ok: false, error: "not_empty" };
}

export async function pgFolderExists(id: string): Promise<boolean> {
  const db = getDrizzle();
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(mediaFolders)
    .where(eq(mediaFolders.id, id))
    .limit(1);
  return rows.length > 0;
}

export async function pgListAllFolders(): Promise<MediaFolderRecord[]> {
  const db = getDrizzle();
  const rows = await db
    .select({
      id: mediaFolders.id,
      parentId: mediaFolders.parentId,
      name: mediaFolders.name,
      createdAt: mediaFolders.createdAt,
    })
    .from(mediaFolders)
    .orderBy(sql`${mediaFolders.parentId} NULLS FIRST`, asc(mediaFolders.nameNormalized));
  return rows.map(mapFolderRow);
}
