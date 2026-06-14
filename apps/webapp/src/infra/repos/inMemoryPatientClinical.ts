/**
 * In-memory implementation of PatientClinicalPort — for Vitest / CI builds without a DB.
 * Mirrors the projection logic of pgPatientClinical (state = latest update per complaint;
 * trend = severities oldest→newest; resolved drops complaint out of active).
 */

import { randomUUID } from "node:crypto";
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  ClinicalState,
  CreateDiagnosisCatalogParams,
  CreateVisitInput,
  DiagnosisCatalogSuggestion,
  PatientClinicalPort,
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
  sourceVisitId: string;
  resolvedAt: string | null;
  createdAt: string;
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

const visits: VisitRow[] = [];
const complaints: ComplaintRow[] = [];
const complaintUpdates: ComplaintUpdateRow[] = [];
const diagnoses: DiagnosisRow[] = [];
const diagnosisUpdates: DiagnosisUpdateRow[] = [];
const catalog: CatalogRow[] = [];
let seqCounter = 0;

/** @internal Vitest: reset between tests. */
export function __resetInMemoryPatientClinicalForTest() {
  visits.length = 0;
  complaints.length = 0;
  complaintUpdates.length = 0;
  diagnoses.length = 0;
  diagnosisUpdates.length = 0;
  catalog.length = 0;
  seqCounter = 0;
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
          meta,
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
};
