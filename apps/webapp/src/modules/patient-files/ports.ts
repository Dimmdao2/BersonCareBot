/**
 * Patient Files module — ports (interfaces only; no DB/infra imports).
 * Single source of truth for a patient's files (standalone + linked from visits).
 */

export type PatientFileCategory =
  | "выписка"
  | "снимок"
  | "анализ"
  | "фото_теста"
  | "прочее";

export const PATIENT_FILE_CATEGORIES: PatientFileCategory[] = [
  "выписка",
  "снимок",
  "анализ",
  "фото_теста",
  "прочее",
];

export type PatientFileRecord = {
  id: string;
  patientUserId: string;
  category: PatientFileCategory;
  fileName: string;
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  sizeBytes: number;
  /** Null until explicitly linked via linkFileToVisit. */
  visitId: string | null;
  /** Null when uploaded without routing through the media library folder. onDelete set null means this can become null if the media_files row is removed. */
  mediaFileId: string | null;
  uploadedByUserId: string;
  createdAt: string; // ISO string
};

export type CreatePatientFileParams = {
  patientUserId: string;
  category: PatientFileCategory;
  fileName: string;
  s3Key: string;
  s3Bucket: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  /** When provided, a media_files row is co-created in this folder and linked via mediaFileId. */
  folderId?: string | null;
};

export interface PatientFilesPort {
  listFiles(patientUserId: string, category?: PatientFileCategory): Promise<PatientFileRecord[]>;
  getFile(id: string): Promise<PatientFileRecord | null>;
  createFile(params: CreatePatientFileParams): Promise<PatientFileRecord>;
  linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null>;
  renameFile(id: string, fileName: string): Promise<PatientFileRecord | null>;
}
