import type { MediaFolderKind, MediaFolderRecord } from "./types";

export const CLIENT_FILES_ROOT_FOLDER_NAME = "Пациенты";

/** Legacy name used before rename — kept for promoteLegacy matching. */
export const CLIENT_FILES_ROOT_FOLDER_NAME_LEGACY = "Файлы клиентов";

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

export function clientPatientFolderBaseName(displayName: string): string {
  const base = displayName.trim() || "Клиент";
  return base.length <= 180 ? base : base.slice(0, 180);
}

/**
 * Build the default subfolder name for a patient in «Фамилия Имя Отчество» order.
 * Null/empty parts are omitted; result is trimmed and capped at 180 chars.
 */
export function clientPatientFolderFioName(
  lastName: string | null,
  firstName: string | null,
  patronymic: string | null,
): string {
  const parts = [lastName, firstName, patronymic].filter((p): p is string => Boolean(p?.trim())).map((p) => p.trim());
  const full = parts.join(" ");
  const base = full || "Клиент";
  return base.length <= 180 ? base : base.slice(0, 180);
}

/** Fallback when plain display name collides under the same parent. */
export function clientPatientFolderFallbackName(displayName: string, patientUserId: string): string {
  const base = clientPatientFolderBaseName(displayName);
  const suffix = patientUserId.slice(0, 8);
  const candidate = `${base} · ${suffix}`;
  return candidate.length <= 180 ? candidate : candidate.slice(0, 180);
}

/** @deprecated Use clientPatientFolderBaseName / clientPatientFolderFallbackName */
export function formatClientPatientFolderName(displayName: string, patientUserId: string): string {
  return clientPatientFolderFallbackName(displayName, patientUserId);
}
