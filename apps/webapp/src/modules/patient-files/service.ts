/**
 * Patient Files service — orchestrates port calls.
 * No DB/infra imports; receives port via DI.
 */

import type {
  DeletePatientFileResult,
  PatientFileCategory,
  PatientFileRecord,
  PatientFilesPort,
  CreatePatientFileParams,
} from './ports';
import type { ReceivedUpload } from '@/modules/media/uploadValidation';

export type PatientFilesServiceDeps = {
  patientFilesPort: PatientFilesPort;
  /**
   * 3.2: physically refuses a files write unless a passing `files` mutation decision already ran
   * in this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'files') => void;
};

export function createPatientFilesService({
  patientFilesPort,
  assertWriteClearance,
}: PatientFilesServiceDeps) {
  return {
    async listFiles(
      patientUserId: string,
      category?: PatientFileCategory,
    ): Promise<PatientFileRecord[]> {
      return patientFilesPort.listFiles(patientUserId, category);
    },

    async getFile(id: string): Promise<PatientFileRecord | null> {
      return patientFilesPort.getFile(id);
    },

    async createFile(params: CreatePatientFileParams): Promise<PatientFileRecord> {
      assertWriteClearance?.('files');
      return patientFilesPort.createFile(params);
    },

    async confirmFileUpload(mediaFileId: string, received: ReceivedUpload) {
      assertWriteClearance?.('files');
      return patientFilesPort.confirmFileUpload(mediaFileId, received);
    },

    async linkFileToVisit(id: string, visitId: string): Promise<PatientFileRecord | null> {
      assertWriteClearance?.('files');
      return patientFilesPort.linkFileToVisit(id, visitId);
    },

    async renameFile(id: string, fileName: string): Promise<PatientFileRecord | null> {
      assertWriteClearance?.('files');
      return patientFilesPort.renameFile(id, fileName);
    },

    async deleteFile(id: string): Promise<DeletePatientFileResult> {
      assertWriteClearance?.('files');
      return patientFilesPort.deleteFile(id);
    },

    async getStorageUsedBytes(): Promise<number> {
      return patientFilesPort.getStorageUsedBytes();
    },
  };
}

export type PatientFilesService = ReturnType<typeof createPatientFilesService>;
