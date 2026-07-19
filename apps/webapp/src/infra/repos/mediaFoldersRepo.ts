import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runDrizzleMutationTransaction } from "@/infra/db/drizzleMutationTx";
import { mediaFiles, mediaFolders } from "../../../db/schema/schema";
import type { MediaFolderRecord } from "@/modules/media/types";

function mapFolderRow(row: {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  patientUserId: string | null;
  createdAt: string;
}): MediaFolderRecord {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind as MediaFolderRecord["kind"],
    patientUserId: row.patientUserId,
    createdAt: row.createdAt,
  };
}

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error("organization_principal_required");
  }
  return principalOrganizationId;
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string {
  const principalOrganizationId = currentPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (hasFallbackMismatch || (fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)) {
    throw new Error("organization_principal_mismatch");
  }
  return principalOrganizationId;
}

export async function pgListFolders(parentId: string | null): Promise<MediaFolderRecord[]> {
  const organizationId = currentPrincipalOrganizationId();
  const db = getDrizzle();
  const rows = await db
    .select({
      id: mediaFolders.id,
      parentId: mediaFolders.parentId,
      name: mediaFolders.name,
      kind: mediaFolders.kind,
      patientUserId: mediaFolders.patientUserId,
      createdAt: mediaFolders.createdAt,
    })
    .from(mediaFolders)
    .where(
      parentId === null
        ? and(isNull(mediaFolders.parentId), eq(mediaFolders.kind, "standard"), eq(mediaFolders.organizationId, organizationId))
        : and(eq(mediaFolders.parentId, parentId), eq(mediaFolders.organizationId, organizationId)),
    )
    .orderBy(asc(mediaFolders.nameNormalized));
  return rows.map(mapFolderRow);
}

export async function pgCreateFolder(params: {
  name: string;
  parentId: string | null;
  createdBy: string;
}): Promise<MediaFolderRecord> {
  const organizationId = currentPrincipalOrganizationId();
  const rows = await runDrizzleMutationTransaction(async (tx) => {
    if (params.parentId) {
      const [parent] = await tx
        .select({ organizationId: mediaFolders.organizationId })
        .from(mediaFolders)
        .where(eq(mediaFolders.id, params.parentId))
        .limit(1);
      currentWriteOrganizationId(parent?.organizationId);
    }
    return tx
      .insert(mediaFolders)
      .values({
        organizationId,
        parentId: params.parentId,
        name: params.name.trim(),
        createdBy: params.createdBy,
      })
      .returning({
        id: mediaFolders.id,
        parentId: mediaFolders.parentId,
        name: mediaFolders.name,
        kind: mediaFolders.kind,
        patientUserId: mediaFolders.patientUserId,
        createdAt: mediaFolders.createdAt,
      });
    });
  const row = rows[0];
  if (!row) throw new Error("folder_create_failed");
  return mapFolderRow(row);
}

export async function pgRenameFolder(folderId: string, name: string): Promise<boolean> {
  const organizationId = currentPrincipalOrganizationId();
  const rows = await runDrizzleMutationTransaction(async (tx) => {
    const [folder] = await tx
      .select({ organizationId: mediaFolders.organizationId })
      .from(mediaFolders)
      .where(eq(mediaFolders.id, folderId))
      .limit(1);
    if (!folder) return [];
    currentWriteOrganizationId(folder.organizationId);
    return tx
      .update(mediaFolders)
      .set({ organizationId, name: name.trim(), updatedAt: sql`now()` })
      .where(eq(mediaFolders.id, folderId))
      .returning({ id: mediaFolders.id });
  });
  return rows.length > 0;
}

export async function pgMoveFolder(folderId: string, newParentId: string | null): Promise<boolean> {
  const organizationId = currentPrincipalOrganizationId();
  const rows = await runDrizzleMutationTransaction(async (tx) => {
    const [folder] = await tx
      .select({ organizationId: mediaFolders.organizationId })
      .from(mediaFolders)
      .where(eq(mediaFolders.id, folderId))
      .limit(1);
    if (!folder) return [];
    const parentRows =
      newParentId === null
        ? []
        : await tx
            .select({ organizationId: mediaFolders.organizationId })
            .from(mediaFolders)
            .where(eq(mediaFolders.id, newParentId))
            .limit(1);
    currentWriteOrganizationId(folder.organizationId, parentRows[0]?.organizationId);
    return tx
      .update(mediaFolders)
      .set({ organizationId, parentId: newParentId, updatedAt: sql`now()` })
      .where(eq(mediaFolders.id, folderId))
      .returning({ id: mediaFolders.id });
  });
  return rows.length > 0;
}

export async function pgDeleteFolderIfEmpty(folderId: string): Promise<{ ok: true } | { ok: false; error: "not_empty" }> {
  return runDrizzleMutationTransaction(async (tx) => {
    const [folder] = await tx
      .select({ organizationId: mediaFolders.organizationId })
      .from(mediaFolders)
      .where(eq(mediaFolders.id, folderId))
      .limit(1);
    if (!folder) return { ok: false, error: "not_empty" };
    currentWriteOrganizationId(folder.organizationId);
    const child = await tx
      .select({ one: sql<number>`1` })
      .from(mediaFolders)
      .where(eq(mediaFolders.parentId, folderId))
      .limit(1);
    if (child.length > 0) {
      return { ok: false, error: "not_empty" };
    }
    const files = await tx
      .select({ one: sql<number>`1` })
      .from(mediaFiles)
      .where(eq(mediaFiles.folderId, folderId))
      .limit(1);
    if (files.length > 0) {
      return { ok: false, error: "not_empty" };
    }
    const del = await tx.delete(mediaFolders).where(eq(mediaFolders.id, folderId)).returning({ id: mediaFolders.id });
    return del.length > 0 ? { ok: true } : { ok: false, error: "not_empty" };
  });
}

export async function pgGetMediaFolderById(id: string): Promise<MediaFolderRecord | null> {
  const organizationId = currentPrincipalOrganizationId();
  const db = getDrizzle();
  const [row] = await db
    .select({
      id: mediaFolders.id,
      parentId: mediaFolders.parentId,
      name: mediaFolders.name,
      kind: mediaFolders.kind,
      patientUserId: mediaFolders.patientUserId,
      createdAt: mediaFolders.createdAt,
    })
    .from(mediaFolders)
    .where(and(eq(mediaFolders.id, id), eq(mediaFolders.organizationId, organizationId)))
    .limit(1);
  return row ? mapFolderRow(row) : null;
}

export async function pgFolderExists(id: string): Promise<boolean> {
  const organizationId = currentPrincipalOrganizationId();
  const db = getDrizzle();
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(mediaFolders)
    .where(and(eq(mediaFolders.id, id), eq(mediaFolders.organizationId, organizationId)))
    .limit(1);
  return rows.length > 0;
}

export async function pgListAllFolders(): Promise<MediaFolderRecord[]> {
  const organizationId = currentPrincipalOrganizationId();
  const db = getDrizzle();
  const rows = await db
    .select({
      id: mediaFolders.id,
      parentId: mediaFolders.parentId,
      name: mediaFolders.name,
      kind: mediaFolders.kind,
      patientUserId: mediaFolders.patientUserId,
      createdAt: mediaFolders.createdAt,
    })
    .from(mediaFolders)
    .where(eq(mediaFolders.organizationId, organizationId))
    .orderBy(sql`${mediaFolders.parentId} NULLS FIRST`, asc(mediaFolders.nameNormalized));
  return rows.map(mapFolderRow);
}
