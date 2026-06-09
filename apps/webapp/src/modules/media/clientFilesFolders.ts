import type { MediaFolderKind, MediaFolderRecord } from "./types";

export const CLIENT_FILES_ROOT_FOLDER_NAME = "Файлы клиентов";

export function isClientFilesFolderKind(kind: MediaFolderKind | undefined): boolean {
  return kind === "client_files_root" || kind === "client_patient";
}

export function findClientFilesRootFolder(folders: MediaFolderRecord[]): MediaFolderRecord | null {
  return folders.find((f) => f.kind === "client_files_root") ?? null;
}

/** Folders shown in «Область списка» (excludes client subtree except root entry). */
export function foldersForLibraryScopeSelect(folders: MediaFolderRecord[]): MediaFolderRecord[] {
  return folders.filter((f) => f.kind === "standard");
}

export function formatClientPatientFolderName(displayName: string, patientUserId: string): string {
  const base = displayName.trim() || "Клиент";
  const suffix = patientUserId.slice(0, 8);
  const candidate = `${base} · ${suffix}`;
  return candidate.length <= 180 ? candidate : candidate.slice(0, 180);
}
