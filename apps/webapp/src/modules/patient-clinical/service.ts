/**
 * Patient Clinical Core service — orchestrates port calls + light input rules.
 * No DB/infra imports; receives port via DI.
 */

import type {
  AnamnesisIllnessEntry,
  AnamnesisLifestyleEntry,
  AnamnesisState,
  AnamnesisTraumaEntry,
  AppendAnamnesisIllnessInput,
  AppendAnamnesisLifestyleInput,
  AppendAnamnesisTraumaInput,
  ClinicalState,
  CreateDiagnosisCatalogParams,
  CreateVisitInput,
  DiagnosisCatalogSuggestion,
  PatientClinicalPort,
  UpdateComplaintFieldsInput,
  UpdateDiagnosisFieldsInput,
  UpdateVisitFieldsInput,
  Visit,
} from "./ports";

/** Тримминг текстовой секции визита: пустая после трима → null (очистка поля). */
function normalizeVisitSection(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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

    // -- Инлайн-правка полей -------------------------------------------------

    async updateComplaintFields(input: UpdateComplaintFieldsInput): Promise<boolean> {
      const patch: UpdateComplaintFieldsInput = {
        patientUserId: input.patientUserId,
        complaintId: input.complaintId,
      };
      if (input.text !== undefined) {
        const text = input.text.trim();
        if (!text) throw new Error("complaint_text_required");
        patch.text = text;
      }
      if (input.priority !== undefined) patch.priority = input.priority;
      if (patch.text === undefined && patch.priority === undefined) {
        throw new Error("nothing_to_update");
      }
      return patientClinicalPort.updateComplaintFields(patch);
    },

    async updateDiagnosisFields(input: UpdateDiagnosisFieldsInput): Promise<boolean> {
      const patch: UpdateDiagnosisFieldsInput = {
        patientUserId: input.patientUserId,
        diagnosisId: input.diagnosisId,
      };
      if (input.text !== undefined) {
        const text = input.text.trim();
        if (!text) throw new Error("diagnosis_text_required");
        patch.text = text;
      }
      if (input.priority !== undefined) patch.priority = input.priority;
      if (patch.text === undefined && patch.priority === undefined) {
        throw new Error("nothing_to_update");
      }
      return patientClinicalPort.updateDiagnosisFields(patch);
    },

    async updateVisitFields(input: UpdateVisitFieldsInput): Promise<boolean> {
      const patch: UpdateVisitFieldsInput = {
        patientUserId: input.patientUserId,
        visitId: input.visitId,
        location: normalizeVisitSection(input.location),
        duration: normalizeVisitSection(input.duration),
        exam: normalizeVisitSection(input.exam),
        manipulations: normalizeVisitSection(input.manipulations),
        trialResults: normalizeVisitSection(input.trialResults),
        recommendations: normalizeVisitSection(input.recommendations),
      };
      const hasChange = (
        ["location", "duration", "exam", "manipulations", "trialResults", "recommendations"] as const
      ).some((k) => patch[k] !== undefined);
      if (!hasChange) throw new Error("nothing_to_update");
      return patientClinicalPort.updateVisitFields(patch);
    },

    // -- Анамнез -------------------------------------------------------------

    async getAnamnesis(patientUserId: string): Promise<AnamnesisState> {
      return patientClinicalPort.getAnamnesis(patientUserId);
    },

    async appendAnamnesisTrauma(
      input: AppendAnamnesisTraumaInput,
    ): Promise<AnamnesisTraumaEntry> {
      const year = input.year.trim();
      const what = input.what.trim();
      const type = input.type.trim();
      if (!year) throw new Error("anamnesis_trauma_year_required");
      if (!what) throw new Error("anamnesis_trauma_what_required");
      if (!type) throw new Error("anamnesis_trauma_type_required");
      return patientClinicalPort.appendAnamnesisTrauma({
        ...input,
        year,
        what,
        type,
        immobilization: input.immobilization.trim() || "—",
      });
    },

    async appendAnamnesisIllness(
      input: AppendAnamnesisIllnessInput,
    ): Promise<AnamnesisIllnessEntry> {
      const period = input.period.trim();
      const what = input.what.trim();
      if (!period) throw new Error("anamnesis_illness_period_required");
      if (!what) throw new Error("anamnesis_illness_what_required");
      return patientClinicalPort.appendAnamnesisIllness({
        ...input,
        period,
        what,
        comment: input.comment.trim(),
      });
    },

    async appendAnamnesisLifestyle(
      input: AppendAnamnesisLifestyleInput,
    ): Promise<AnamnesisLifestyleEntry> {
      const text = input.text.trim();
      const recordDate = input.recordDate.trim();
      if (!text) throw new Error("anamnesis_lifestyle_text_required");
      if (!recordDate) throw new Error("anamnesis_lifestyle_record_date_required");
      return patientClinicalPort.appendAnamnesisLifestyle({ ...input, text, recordDate });
    },
  };
}

export type PatientClinicalService = ReturnType<typeof createPatientClinicalService>;
