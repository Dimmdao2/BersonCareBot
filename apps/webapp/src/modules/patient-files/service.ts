/**
 * Patient Files service — orchestrates port calls.
 * No DB/infra imports; receives port via DI.
 */

import type {
  PatientFileCategory,
  PatientFileRecord,
  PatientFilesPort,
  CreatePatientFileParams,
} from "./ports";

export type PatientFilesServiceDeps = {
  patientFilesPort: PatientFilesPort;
};

export function createPatientFilesService({ patientFilesPort }: PatientFilesServiceDeps) {
  return {
    async listFiles(patientUserId: string, category?: PatientFileCategory): Promise<PatientFileRecord[]> {
      return patientFilesPort.listFiles(patientUserId, category);
    },

    async getFile(id: string): Promise<PatientFileRecord | null> {
      return patientFilesPort.getFile(id);
    },

    async createFile(params: CreatePatientFileParams): Promise<PatientFileRecord> {
      return patientFilesPort.createFile(params);
    },

    async linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null> {
      return patientFilesPort.linkFileToVisit(id, visitId);
    },

    async renameFile(id: string, fileName: string): Promise<PatientFileRecord | null> {
      return patientFilesPort.renameFile(id, fileName);
    },
  };
}

export type PatientFilesService = ReturnType<typeof createPatientFilesService>;
