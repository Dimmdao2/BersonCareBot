/**
 * In-memory implementation of PatientFilesPort — for Vitest / CI builds without a DB.
 */

import { randomUUID } from "node:crypto";
import type {
  CreatePatientFileParams,
  PatientFileCategory,
  PatientFileRecord,
  PatientFilesPort,
} from "@/modules/patient-files/ports";

const store: Map<string, PatientFileRecord> = new Map();

/** @internal Vitest: reset between tests. */
export function __resetInMemoryPatientFilesForTest() {
  store.clear();
}

export const inMemoryPatientFilesPort: PatientFilesPort = {
  async listFiles(patientUserId: string, category?: PatientFileCategory): Promise<PatientFileRecord[]> {
    return Array.from(store.values()).filter(
      (f) => f.patientUserId === patientUserId && (!category || f.category === category),
    );
  },

  async getFile(id: string): Promise<PatientFileRecord | null> {
    return store.get(id) ?? null;
  },

  async createFile(params: CreatePatientFileParams): Promise<PatientFileRecord> {
    const record: PatientFileRecord = {
      id: randomUUID(),
      patientUserId: params.patientUserId,
      category: params.category,
      fileName: params.fileName,
      s3Key: params.s3Key,
      s3Bucket: params.s3Bucket,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      visitId: null,
      uploadedByUserId: params.uploadedByUserId,
      createdAt: new Date().toISOString(),
    };
    store.set(record.id, record);
    return record;
  },

  async linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated = { ...existing, visitId };
    store.set(id, updated);
    return updated;
  },

  async renameFile(id: string, fileName: string): Promise<PatientFileRecord | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated = { ...existing, fileName };
    store.set(id, updated);
    return updated;
  },
};
