import { and, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { mediaFolders, platformUsers } from "../../../db/schema/schema";
import {
  CLIENT_FILES_ROOT_FOLDER_NAME,
  formatClientPatientFolderName,
} from "@/modules/media/clientFilesFolders";
import type { MediaFolderKind, MediaFolderRecord } from "@/modules/media/types";

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

export async function pgEnsureClientFilesRootFolder(): Promise<MediaFolderRecord> {
  const db = getDrizzle();
  const [existing] = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.kind, "client_files_root"))
    .limit(1);
  if (existing) return mapFolderRow(existing);

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

async function resolvePatientDisplayName(patientUserId: string): Promise<string> {
  const db = getDrizzle();
  const [row] = await db
    .select({
      firstName: platformUsers.firstName,
      lastName: platformUsers.lastName,
      displayName: platformUsers.displayName,
    })
    .from(platformUsers)
    .where(eq(platformUsers.id, patientUserId))
    .limit(1);
  if (!row) return "Клиент";
  const full = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return full || row.displayName?.trim() || "Клиент";
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
  const displayName = await resolvePatientDisplayName(patientUserId);
  const name = formatClientPatientFolderName(displayName, patientUserId);

  try {
    const [created] = await db
      .insert(mediaFolders)
      .values({
        name,
        parentId: root.id,
        kind: "client_patient",
        patientUserId,
      })
      .returning();
    if (!created) throw new Error("client_patient_folder_create_failed");
    return mapFolderRow(created);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
    if (code === "23505") {
      const [retry] = await db
        .select()
        .from(mediaFolders)
        .where(and(eq(mediaFolders.kind, "client_patient"), eq(mediaFolders.patientUserId, patientUserId)))
        .limit(1);
      if (retry) return mapFolderRow(retry);
    }
    throw error;
  }
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
