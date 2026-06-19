import { and, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { mediaFolders, platformUsers } from "../../../db/schema/schema";
import {
  CLIENT_FILES_ROOT_FOLDER_NAME,
  CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY,
  clientPatientFolderBaseName,
  clientPatientFolderFioName,
  clientPatientFolderFallbackName,
} from "@/modules/media/clientFilesFolders";
import type { MediaFolderKind, MediaFolderRecord } from "@/modules/media/types";
import { pgGetMediaFolderById } from "./mediaFoldersRepo";

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

async function promoteLegacyClientFilesRootFolder(db: ReturnType<typeof getDrizzle>): Promise<void> {
  const [hasRoot] = await db
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(eq(mediaFolders.kind, "client_files_root"))
    .limit(1);
  if (hasRoot) return;

  // Match either the current name ("Пациенты") or the legacy name ("Файлы клиентов")
  // so existing root folders are recognised and promoted rather than duplicated.
  await db
    .update(mediaFolders)
    .set({ kind: "client_files_root", updatedAt: sql`now()` })
    .where(
      and(
        sql`${mediaFolders.parentId} IS NULL`,
        eq(mediaFolders.kind, "standard"),
        sql`${mediaFolders.nameNormalized} IN (${CLIENT_FILES_ROOT_FOLDER_NAME.toLowerCase()}, ${CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY.toLowerCase()})`,
      ),
    );
}

export async function pgEnsureClientFilesRootFolder(): Promise<MediaFolderRecord> {
  const db = getDrizzle();
  const [existing] = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.kind, "client_files_root"))
    .limit(1);
  if (existing) return mapFolderRow(existing);

  await promoteLegacyClientFilesRootFolder(db);

  const [promoted] = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.kind, "client_files_root"))
    .limit(1);
  if (promoted) return mapFolderRow(promoted);

  const [created] = await db
    .insert(mediaFolders)
    .values({
      name: CLIENT_FILES_ROOT_FOLDER_NAME,
      parentId: null,
      kind: "client_files_root",
    })
    .returning();
  if (!created) throw new Error("client_files_root_create_failed");
  return mapFolderRow(created);
}

async function resolvePatientDisplayNameAndPhone(
  patientUserId: string,
): Promise<{ displayName: string; phoneNormalized: string | null }> {
  const db = getDrizzle();
  const [row] = await db
    .select({
      firstName: platformUsers.firstName,
      lastName: platformUsers.lastName,
      patronymic: platformUsers.patronymic,
      displayName: platformUsers.displayName,
      phoneNormalized: platformUsers.phoneNormalized,
    })
    .from(platformUsers)
    .where(eq(platformUsers.id, patientUserId))
    .limit(1);
  if (!row) return { displayName: "Клиент", phoneNormalized: null };
  const fio = clientPatientFolderFioName(row.lastName, row.firstName, row.patronymic);
  const displayName = fio !== "Клиент" ? fio : row.displayName?.trim() || "Клиент";
  return { displayName, phoneNormalized: row.phoneNormalized ?? null };
}

async function insertClientPatientFolder(
  db: ReturnType<typeof getDrizzle>,
  params: { parentId: string; patientUserId: string; name: string },
): Promise<MediaFolderRecord> {
  const [created] = await db
    .insert(mediaFolders)
    .values({
      name: params.name,
      parentId: params.parentId,
      kind: "client_patient",
      patientUserId: params.patientUserId,
    })
    .returning();
  if (!created) throw new Error("client_patient_folder_create_failed");
  return mapFolderRow(created);
}

export async function pgEnsureClientPatientFolder(patientUserId: string): Promise<MediaFolderRecord> {
  const db = getDrizzle();
  const [existing] = await db
    .select()
    .from(mediaFolders)
    .where(and(eq(mediaFolders.kind, "client_patient"), eq(mediaFolders.patientUserId, patientUserId)))
    .limit(1);
  if (existing) return mapFolderRow(existing);

  const root = await pgEnsureClientFilesRootFolder();
  const { displayName, phoneNormalized } = await resolvePatientDisplayNameAndPhone(patientUserId);
  const primaryName = clientPatientFolderBaseName(displayName);
  const fallbackName = clientPatientFolderFallbackName(displayName, patientUserId, phoneNormalized);

  try {
    return await insertClientPatientFolder(db, {
      parentId: root.id,
      patientUserId,
      name: primaryName,
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
    if (code !== "23505") throw error;
  }

  if (primaryName !== fallbackName) {
    try {
      return await insertClientPatientFolder(db, {
        parentId: root.id,
        patientUserId,
        name: fallbackName,
      });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
      if (code !== "23505") throw error;
    }
  }

  const [retry] = await db
    .select()
    .from(mediaFolders)
    .where(and(eq(mediaFolders.kind, "client_patient"), eq(mediaFolders.patientUserId, patientUserId)))
    .limit(1);
  if (retry) return mapFolderRow(retry);
  throw new Error("client_patient_folder_create_failed");
}

/** SQL fragment: folder ids in the client-files subtree (root + patient folders). */
export function clientFilesSubtreeFolderIdsSql(): ReturnType<typeof sql> {
  return sql`(
    WITH RECURSIVE client_tree AS (
      SELECT id FROM media_folders WHERE kind = 'client_files_root'
      UNION ALL
      SELECT f.id FROM media_folders f INNER JOIN client_tree t ON f.parent_id = t.id
    )
    SELECT id FROM client_tree
  )`;
}

export function isSystemManagedMediaFolder(kind: MediaFolderKind | undefined): boolean {
  return kind === "client_files_root" || kind === "client_patient";
}

export type MediaFolderAssignmentError =
  | "folder_not_found"
  | "client_folder_requires_patient"
  | "system_folder_readonly";

export async function pgValidateUserAssignableMediaFolder(
  folderId: string | null,
): Promise<{ ok: true } | { ok: false; error: MediaFolderAssignmentError }> {
  if (folderId === null) return { ok: true };
  const folder = await pgGetMediaFolderById(folderId);
  if (!folder) return { ok: false, error: "folder_not_found" };
  if (folder.kind === "client_files_root") return { ok: false, error: "client_folder_requires_patient" };
  return { ok: true };
}

export async function pgValidateManualFolderParent(
  parentId: string | null,
): Promise<{ ok: true } | { ok: false; error: MediaFolderAssignmentError }> {
  if (parentId === null) return { ok: true };
  const parent = await pgGetMediaFolderById(parentId);
  if (!parent) return { ok: false, error: "folder_not_found" };
  if (isSystemManagedMediaFolder(parent.kind)) return { ok: false, error: "system_folder_readonly" };
  return { ok: true };
}
