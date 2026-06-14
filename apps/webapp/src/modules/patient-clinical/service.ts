/**
 * Patient Clinical Core service — orchestrates port calls + light input rules.
 * No DB/infra imports; receives port via DI.
 */

import type {
  ClinicalState,
  CreateDiagnosisCatalogParams,
  CreateVisitInput,
  DiagnosisCatalogSuggestion,
  PatientClinicalPort,
  Visit,
} from "./ports";

export type PatientClinicalServiceDeps = {
  patientClinicalPort: PatientClinicalPort;
};

export function createPatientClinicalService({
  patientClinicalPort,
}: PatientClinicalServiceDeps) {
  return {
    async getClinicalState(patientUserId: string): Promise<ClinicalState> {
      return patientClinicalPort.getClinicalState(patientUserId);
    },

    async listVisits(patientUserId: string): Promise<Visit[]> {
      return patientClinicalPort.listVisits(patientUserId);
    },

    async searchDiagnosisCatalog(query: string): Promise<DiagnosisCatalogSuggestion[]> {
      const q = query.trim();
      if (q.length === 0) return [];
      return patientClinicalPort.searchDiagnosisCatalog(q);
    },

    async createDiagnosisCatalogEntry(
      params: CreateDiagnosisCatalogParams,
    ): Promise<DiagnosisCatalogSuggestion> {
      const label = params.label.trim();
      if (label.length === 0) {
        throw new Error("diagnosis_catalog_label_required");
      }
      const note = params.note?.trim();
      return patientClinicalPort.createDiagnosisCatalogEntry({
        label,
        note: note && note.length > 0 ? note : null,
        createdBy: params.createdBy,
      });
    },

    async createVisit(input: CreateVisitInput): Promise<string> {
      // Severity guardrails (DB also checks, but fail fast with a clear error).
      for (const c of input.complaints ?? []) {
        if (!Number.isInteger(c.severity) || c.severity < 0 || c.severity > 10) {
          throw new Error("complaint_severity_out_of_range");
        }
      }
      for (const u of input.complaintUpdates ?? []) {
        if (!Number.isInteger(u.severity) || u.severity < 0 || u.severity > 10) {
          throw new Error("complaint_update_severity_out_of_range");
        }
      }
      return patientClinicalPort.createVisit(input);
    },
  };
}

export type PatientClinicalService = ReturnType<typeof createPatientClinicalService>;
