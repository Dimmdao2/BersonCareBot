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
};

export interface PatientFilesPort {
  listFiles(patientUserId: string, category?: PatientFileCategory): Promise<PatientFileRecord[]>;
  getFile(id: string): Promise<PatientFileRecord | null>;
  createFile(params: CreatePatientFileParams): Promise<PatientFileRecord>;
  linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null>;
  renameFile(id: string, fileName: string): Promise<PatientFileRecord | null>;
}
