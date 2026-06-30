/**
 * In-memory implementation of PatientClinicalPort — for Vitest / CI builds without a DB.
 * Mirrors the projection logic of pgPatientClinical (state = latest update per complaint;
 * trend = severities oldest→newest; resolved drops complaint out of active).
 */

import { randomUUID } from "node:crypto";
import type {
  ActiveComplaint,
  ActiveDiagnosis,
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
  DiagnosisClinicalStatus,
  DiagnosisStatusHistoryEntry,
  PatientClinicalPort,
  SetDiagnosisClinicalStatusInput,
  UpdateComplaintFieldsInput,
  UpdateDiagnosisFieldsInput,
  UpdateVisitFieldsInput,
  Visit,
} from "@/modules/patient-clinical/ports";

type VisitRow = {
  id: string;
  patientUserId: string;
  visitType: "first" | "repeat";
  visitedAt: string;
  location: string | null;
  service: string | null;
  duration: string | null;
  appointmentRecordId: string | null;
  exam: string | null;
  manipulations: string | null;
  trialResults: string | null;
  recommendations: string | null;
  createdBy: string;
  createdAt: string;
};

type ComplaintRow = {
  id: string;
  patientUserId: string;
  text: string;
  priority: boolean;
  status: "active" | "resolved";
  sourceVisitId: string;
  resolvedAt: string | null;
  createdAt: string;
};

type ComplaintUpdateRow = {
  id: string;
  complaintId: string;
  visitId: string;
  note: string | null;
  severity: number;
  resolved: boolean;
  createdAt: string;
  /** Monotonic insertion order — stable tiebreaker when timestamps collide. */
  seq: number;
};

type DiagnosisRow = {
  id: string;
  patientUserId: string;
  catalogId: string | null;
  text: string;
  priority: boolean;
  status: "active" | "refined" | "resolved";
  clinicalStatus: DiagnosisClinicalStatus;
  sourceVisitId: string;
  resolvedAt: string | null;
  createdAt: string;
};

type DiagnosisStatusHistoryRow = {
  id: string;
  diagnosisId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  changedAt: string;
  note: string | null;
};

type DiagnosisUpdateRow = {
  id: string;
  diagnosisId: string;
  visitId: string;
  refinement: string | null;
  status: string;
  removed: boolean;
  createdAt: string;
};

type CatalogRow = {
  id: string;
  label: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

type AnamnesisTraumaRow = {
  id: string;
  patientUserId: string;
  year: string;
  what: string;
  type: string;
  immobilization: string;
  createdBy: string;
  createdAt: string;
};

type AnamnesisIllnessRow = {
  id: string;
  patientUserId: string;
  period: string;
  what: string;
  comment: string;
  createdBy: string;
  createdAt: string;
};

type AnamnesisLifestyleRow = {
  id: string;
  patientUserId: string;
  recordDate: string;
  text: string;
  createdBy: string;
  createdAt: string;
};

const visits: VisitRow[] = [];
const complaints: ComplaintRow[] = [];
const complaintUpdates: ComplaintUpdateRow[] = [];
const diagnoses: DiagnosisRow[] = [];
const diagnosisUpdates: DiagnosisUpdateRow[] = [];
const diagnosisStatusHistory: DiagnosisStatusHistoryRow[] = [];
const catalog: CatalogRow[] = [];
const anamnesisTrauma: AnamnesisTraumaRow[] = [];
const anamnesisIllness: AnamnesisIllnessRow[] = [];
const anamnesisLifestyle: AnamnesisLifestyleRow[] = [];
let seqCounter = 0;

/** @internal Vitest: reset between tests. */
export function __resetInMemoryPatientClinicalForTest() {
  visits.length = 0;
  complaints.length = 0;
  complaintUpdates.length = 0;
  diagnoses.length = 0;
  diagnosisUpdates.length = 0;
  catalog.length = 0;
  anamnesisTrauma.length = 0;
  anamnesisIllness.length = 0;
  anamnesisLifestyle.length = 0;
  seqCounter = 0;
}

function fmtDisplayDateInMemory(isoOrLocal: string): string {
  const d = new Date(isoOrLocal.length === 10 ? isoOrLocal + "T00:00:00Z" : isoOrLocal);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function fmtSince(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `с ${dd}.${mm}`;
}

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function fmtVisitDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtDayMonth(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

export const inMemoryPatientClinicalPort: PatientClinicalPort = {
  async getClinicalState(patientUserId: string): Promise<ClinicalState> {
    const activeComplaints: ActiveComplaint[] = complaints
      .filter((c) => c.patientUserId === patientUserId && c.status === "active")
      .map((c) => {
        const updates = complaintUpdates
          .filter((u) => u.complaintId === c.id)
          .sort((a, b) => a.seq - b.seq);
        const trend = updates.map((u) => u.severity);
        const currentSeverity = trend.length > 0 ? trend[trend.length - 1] : 0;
        const sourceVisit = visits.find((v) => v.id === c.sourceVisitId);
        return {
          id: c.id,
          text: c.text,
          priority: c.priority,
          currentSeverity,
          trend,
          since: fmtSince(sourceVisit?.visitedAt ?? c.createdAt),
        };
      })
      .sort((a, b) => Number(b.priority) - Number(a.priority));

    const activeDiagnoses: ActiveDiagnosis[] = diagnoses
      .filter((d) => d.patientUserId === patientUserId && d.status !== "resolved")
      .map((d): ActiveDiagnosis => {
        const updates = diagnosisUpdates
          .filter((u) => u.diagnosisId === d.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const last = updates[updates.length - 1];
        const lastVisit = last ? visits.find((v) => v.id === last.visitId) : undefined;
        const sourceVisit = visits.find((v) => v.id === d.sourceVisitId);
        const meta =
          d.status === "refined" && last
            ? `уточнён ${fmtDayMonth(lastVisit?.visitedAt ?? last.createdAt)}`
            : `поставлен ${fmtDayMonth(sourceVisit?.visitedAt ?? d.createdAt)}`;
        return {
          id: d.id,
          text: d.text,
          priority: d.priority,
          status: d.status === "refined" ? "refined" : "active",
          clinicalStatus: d.clinicalStatus ?? "предварительный",
          meta,
          comment: null,
        };
      })
      .sort((a, b) => Number(b.priority) - Number(a.priority));

    return { complaints: activeComplaints, diagnoses: activeDiagnoses };
  },

  async listVisits(patientUserId: string): Promise<Visit[]> {
    const rows = visits
      .filter((v) => v.patientUserId === patientUserId)
      .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));

    return rows.map((v) => {
      // Dynamics: complaint updates written in this visit (from→to severity).
      const dynamics = complaintUpdates
        .filter((u) => u.visitId === v.id)
        .map((u) => {
          const complaint = complaints.find((c) => c.id === u.complaintId);
          const prior = complaintUpdates
            .filter((x) => x.complaintId === u.complaintId && x.seq < u.seq)
            .sort((a, b) => a.seq - b.seq);
          const from = prior.length > 0 ? prior[prior.length - 1].severity : u.severity;
          return {
            id: u.id,
            priority: complaint?.priority ?? false,
            label: complaint?.text ?? "",
            from,
            to: u.severity,
            note: u.note ?? "",
          };
        });

      // Text sections — only non-empty ones.
      const sections: { title: string; body: string }[] = [];
      if (v.exam) sections.push({ title: "Осмотр", body: v.exam });
      if (v.manipulations) sections.push({ title: "Проведённые манипуляции", body: v.manipulations });
      if (v.trialResults) sections.push({ title: "Результаты проб", body: v.trialResults });
      if (v.recommendations) sections.push({ title: "Рекомендации / Назначения", body: v.recommendations });

      return {
        id: v.id,
        date: fmtVisitDate(v.visitedAt),
        type: v.visitType,
        location: v.location ?? "",
        duration: v.duration ?? "",
        dynamics: dynamics.length > 0 ? dynamics : undefined,
        sections: sections.length > 0 ? sections : undefined,
        files: undefined, // files joined from patient_files in pg repo; n/a in memory
      };
    });
  },

  async searchDiagnosisCatalog(query: string): Promise<DiagnosisCatalogSuggestion[]> {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((c) => c.label.toLowerCase().includes(q))
      .slice(0, 20)
      .map((c) => ({ id: c.id, label: c.label, note: c.note }));
  },

  async createDiagnosisCatalogEntry(
    params: CreateDiagnosisCatalogParams,
  ): Promise<DiagnosisCatalogSuggestion> {
    const row: CatalogRow = {
      id: randomUUID(),
      label: params.label,
      note: params.note ?? null,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
    };
    catalog.push(row);
    return { id: row.id, label: row.label, note: row.note };
  },

  async createVisit(input: CreateVisitInput): Promise<string> {
    const now = new Date().toISOString();
    const visitId = randomUUID();
    visits.push({
      id: visitId,
      patientUserId: input.patientUserId,
      visitType: input.visitType,
      visitedAt: input.visitedAt,
      location: input.location ?? null,
      service: input.service ?? null,
      duration: input.duration ?? null,
      appointmentRecordId: input.appointmentRecordId ?? null,
      exam: input.exam ?? null,
      manipulations: input.manipulations ?? null,
      trialResults: input.trialResults ?? null,
      recommendations: input.recommendations ?? null,
      createdBy: input.createdBy,
      createdAt: now,
    });

    if (input.visitType === "first") {
      for (const c of input.complaints ?? []) {
        const complaintId = randomUUID();
        complaints.push({
          id: complaintId,
          patientUserId: input.patientUserId,
          text: c.text,
          priority: c.priority,
          status: "active",
          sourceVisitId: visitId,
          resolvedAt: null,
          createdAt: now,
        });
        complaintUpdates.push({
          id: randomUUID(),
          complaintId,
          visitId,
          note: null,
          severity: c.severity,
          resolved: false,
          createdAt: now,
          seq: seqCounter++,
        });
      }
      for (const d of input.diagnoses ?? []) {
        diagnoses.push({
          id: randomUUID(),
          patientUserId: input.patientUserId,
          catalogId: d.catalogId ?? null,
          text: d.text,
          priority: d.priority,
          status: "active",
          clinicalStatus: "предварительный",
          sourceVisitId: visitId,
          resolvedAt: null,
          createdAt: now,
        });
      }
    } else {
      for (const u of input.complaintUpdates ?? []) {
        complaintUpdates.push({
          id: randomUUID(),
          complaintId: u.complaintId,
          visitId,
          note: u.note,
          severity: u.severity,
          resolved: u.resolved,
          createdAt: now,
          seq: seqCounter++,
        });
        if (u.resolved) {
          const complaint = complaints.find((c) => c.id === u.complaintId);
          if (complaint) {
            complaint.status = "resolved";
            complaint.resolvedAt = now;
          }
        }
      }
      for (const u of input.diagnosisUpdates ?? []) {
        const diagnosis = diagnoses.find((d) => d.id === u.diagnosisId);
        const nextStatus = u.removed ? "resolved" : "refined";
        diagnosisUpdates.push({
          id: randomUUID(),
          diagnosisId: u.diagnosisId,
          visitId,
          refinement: u.refinement ?? null,
          status: nextStatus,
          removed: u.removed,
          createdAt: now,
        });
        if (diagnosis) {
          diagnosis.status = nextStatus;
          if (u.removed) diagnosis.resolvedAt = now;
        }
      }
    }

    return visitId;
  },

  // -- Инлайн-правка полей ------------------------------------------------------

  async updateComplaintFields(input: UpdateComplaintFieldsInput): Promise<boolean> {
    const row = complaints.find(
      (c) => c.id === input.complaintId && c.patientUserId === input.patientUserId,
    );
    if (!row) return false;
    if (input.text !== undefined) row.text = input.text;
    if (input.priority !== undefined) row.priority = input.priority;
    return true;
  },

  async updateDiagnosisFields(input: UpdateDiagnosisFieldsInput): Promise<boolean> {
    const row = diagnoses.find(
      (d) => d.id === input.diagnosisId && d.patientUserId === input.patientUserId,
    );
    if (!row) return false;
    if (input.text !== undefined) row.text = input.text;
    if (input.priority !== undefined) row.priority = input.priority;
    return true;
  },

  async updateVisitFields(input: UpdateVisitFieldsInput): Promise<boolean> {
    const row = visits.find(
      (v) => v.id === input.visitId && v.patientUserId === input.patientUserId,
    );
    if (!row) return false;
    if (input.location !== undefined) row.location = input.location;
    if (input.duration !== undefined) row.duration = input.duration;
    if (input.exam !== undefined) row.exam = input.exam;
    if (input.manipulations !== undefined) row.manipulations = input.manipulations;
    if (input.trialResults !== undefined) row.trialResults = input.trialResults;
    if (input.recommendations !== undefined) row.recommendations = input.recommendations;
    return true;
  },

  // -- Анамнез ------------------------------------------------------------------

  async getAnamnesis(patientUserId: string): Promise<AnamnesisState> {
    return {
      trauma: anamnesisTrauma
        .filter((r) => r.patientUserId === patientUserId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => ({ id: r.id, year: r.year, what: r.what, type: r.type, immobilization: r.immobilization })),
      illness: anamnesisIllness
        .filter((r) => r.patientUserId === patientUserId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => ({ id: r.id, period: r.period, what: r.what, comment: r.comment })),
      lifestyle: anamnesisLifestyle
        .filter((r) => r.patientUserId === patientUserId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => ({ id: r.id, date: fmtDisplayDateInMemory(r.recordDate), text: r.text })),
    };
  },

  async appendAnamnesisTrauma(input: AppendAnamnesisTraumaInput): Promise<AnamnesisTraumaEntry> {
    const row: AnamnesisTraumaRow = {
      id: randomUUID(),
      patientUserId: input.patientUserId,
      year: input.year,
      what: input.what,
      type: input.type,
      immobilization: input.immobilization,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    anamnesisTrauma.push(row);
    return { id: row.id, year: row.year, what: row.what, type: row.type, immobilization: row.immobilization };
  },

  async appendAnamnesisIllness(input: AppendAnamnesisIllnessInput): Promise<AnamnesisIllnessEntry> {
    const row: AnamnesisIllnessRow = {
      id: randomUUID(),
      patientUserId: input.patientUserId,
      period: input.period,
      what: input.what,
      comment: input.comment,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    anamnesisIllness.push(row);
    return { id: row.id, period: row.period, what: row.what, comment: row.comment };
  },

  async appendAnamnesisLifestyle(input: AppendAnamnesisLifestyleInput): Promise<AnamnesisLifestyleEntry> {
    const row: AnamnesisLifestyleRow = {
      id: randomUUID(),
      patientUserId: input.patientUserId,
      recordDate: input.recordDate,
      text: input.text,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    anamnesisLifestyle.push(row);
    return { id: row.id, date: fmtDisplayDateInMemory(row.recordDate), text: row.text };
  },

  // -- Клинический статус диагноза ------------------------------------------

  async setDiagnosisClinicalStatus(input: SetDiagnosisClinicalStatusInput): Promise<boolean> {
    const diagnosis = diagnoses.find(
      (d) => d.id === input.diagnosisId && d.patientUserId === input.patientUserId,
    );
    if (!diagnosis) return false;
    const oldStatus = diagnosis.clinicalStatus;
    diagnosis.clinicalStatus = input.newStatus;
    diagnosisStatusHistory.push({
      id: randomUUID(),
      diagnosisId: input.diagnosisId,
      oldStatus,
      newStatus: input.newStatus,
      changedBy: input.changedBy,
      changedAt: new Date().toISOString(),
      note: input.note ?? null,
    });
    return true;
  },

  async getDiagnosisStatusHistory(diagnosisId: string): Promise<DiagnosisStatusHistoryEntry[]> {
    return diagnosisStatusHistory
      .filter((h) => h.diagnosisId === diagnosisId)
      .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
      .map((h) => ({
        id: h.id,
        oldStatus: h.oldStatus,
        newStatus: h.newStatus,
        changedAt: h.changedAt,
        changedByName: null,
        note: h.note,
      }));
  },

  async listLinkedAppointmentRecordIds(patientUserId: string): Promise<string[]> {
    return visits
      .filter((v) => v.patientUserId === patientUserId && v.appointmentRecordId != null)
      .map((v) => v.appointmentRecordId as string);
  },
};
