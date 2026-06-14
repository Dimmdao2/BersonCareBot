/**
 * Pg implementation of PatientClinicalPort.
 * Uses Drizzle ORM; createVisit is transactional. Projection assembly (state =
 * latest update per complaint, trend oldest→newest) mirrors inMemoryPatientClinical.
 */

import { and, asc, desc, eq, ilike, inArray, ne } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
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
  PatientClinicalPort,
  UpdateComplaintFieldsInput,
  UpdateDiagnosisFieldsInput,
  UpdateVisitFieldsInput,
  Visit,
  VisitFile,
} from "@/modules/patient-clinical/ports";
import {
  clinicalComplaint,
  clinicalComplaintUpdate,
  clinicalDiagnosis,
  clinicalDiagnosisCatalog,
  clinicalDiagnosisUpdate,
  clinicalVisit,
} from "../../../db/schema/patientClinical";
import {
  clinicalAnamnesisTrauma,
  clinicalAnamnesisIllness,
  clinicalAnamnesisLifestyle,
} from "../../../db/schema/patientClinicalAnamnesis";
import { patientFiles } from "../../../db/schema/patientFiles";

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

function fmtSince(iso: string): string {
  return `с ${fmtDayMonth(iso)}`;
}

/**
 * Format an ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ) as «ДД.ММ.ГГГГ».
 * Used for anamnesis lifestyle record_date display.
 */
function fmtDisplayDate(isoOrLocal: string): string {
  // Handles both "2026-01-18" (date-only) and full ISO timestamps.
  const d = new Date(isoOrLocal.length === 10 ? isoOrLocal + "T00:00:00Z" : isoOrLocal);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function fileIconForMime(mime: string): string {
  if (mime.startsWith("image/")) return "📷";
  if (mime === "application/pdf") return "📄";
  return "📎";
}

export function createPgPatientClinicalPort(): PatientClinicalPort {
  return {
    async getClinicalState(patientUserId: string): Promise<ClinicalState> {
      const db = getDrizzle();

      const complaintRows = await db
        .select()
        .from(clinicalComplaint)
        .where(
          and(
            eq(clinicalComplaint.patientUserId, patientUserId),
            eq(clinicalComplaint.status, "active"),
          ),
        )
        .orderBy(desc(clinicalComplaint.priority), asc(clinicalComplaint.createdAt));

      const complaintIds = complaintRows.map((c) => c.id);
      const updateRows =
        complaintIds.length > 0
          ? await db
              .select()
              .from(clinicalComplaintUpdate)
              .where(inArray(clinicalComplaintUpdate.complaintId, complaintIds))
              .orderBy(asc(clinicalComplaintUpdate.createdAt))
          : [];

      const diagnosisRows = await db
        .select()
        .from(clinicalDiagnosis)
        .where(
          and(
            eq(clinicalDiagnosis.patientUserId, patientUserId),
            ne(clinicalDiagnosis.status, "resolved"),
          ),
        )
        .orderBy(desc(clinicalDiagnosis.priority), asc(clinicalDiagnosis.createdAt));

      const diagnosisIds = diagnosisRows.map((d) => d.id);
      const diagUpdateRows =
        diagnosisIds.length > 0
          ? await db
              .select()
              .from(clinicalDiagnosisUpdate)
              .where(inArray(clinicalDiagnosisUpdate.diagnosisId, diagnosisIds))
              .orderBy(asc(clinicalDiagnosisUpdate.createdAt))
          : [];

      // "since"/"meta" derive from the visit date the item belongs to, not the row's
      // created_at (which is wall-clock at write time, not the clinical visit date).
      const relevantVisitIds = Array.from(
        new Set<string>([
          ...complaintRows.map((c) => c.sourceVisitId),
          ...diagnosisRows.map((d) => d.sourceVisitId),
          ...diagUpdateRows.map((u) => u.visitId),
        ]),
      );
      const relevantVisits =
        relevantVisitIds.length > 0
          ? await db
              .select({ id: clinicalVisit.id, visitedAt: clinicalVisit.visitedAt })
              .from(clinicalVisit)
              .where(inArray(clinicalVisit.id, relevantVisitIds))
          : [];
      const visitDateById = new Map(relevantVisits.map((v) => [v.id, v.visitedAt]));

      const complaints: ActiveComplaint[] = complaintRows.map((c) => {
        const trend = updateRows
          .filter((u) => u.complaintId === c.id)
          .map((u) => u.severity);
        return {
          id: c.id,
          text: c.text,
          priority: c.priority,
          currentSeverity: trend.length > 0 ? trend[trend.length - 1] : 0,
          trend,
          since: fmtSince(visitDateById.get(c.sourceVisitId) ?? c.createdAt),
        };
      });

      const diagnoses: ActiveDiagnosis[] = diagnosisRows.map((d) => {
        const updates = diagUpdateRows.filter((u) => u.diagnosisId === d.id);
        const last = updates[updates.length - 1];
        const refinedDate = last ? visitDateById.get(last.visitId) ?? last.createdAt : null;
        const placedDate = visitDateById.get(d.sourceVisitId) ?? d.createdAt;
        const meta =
          d.status === "refined" && refinedDate
            ? `уточнён ${fmtDayMonth(refinedDate)}`
            : `поставлен ${fmtDayMonth(placedDate)}`;
        return {
          id: d.id,
          text: d.text,
          priority: d.priority,
          status: d.status === "refined" ? "refined" : "active",
          meta,
        };
      });

      return { complaints, diagnoses };
    },

    async listVisits(patientUserId: string): Promise<Visit[]> {
      const db = getDrizzle();

      const visitRows = await db
        .select()
        .from(clinicalVisit)
        .where(eq(clinicalVisit.patientUserId, patientUserId))
        .orderBy(desc(clinicalVisit.visitedAt));

      if (visitRows.length === 0) return [];
      const visitIds = visitRows.map((v) => v.id);

      const cuRows = await db
        .select()
        .from(clinicalComplaintUpdate)
        .where(inArray(clinicalComplaintUpdate.visitId, visitIds))
        .orderBy(asc(clinicalComplaintUpdate.createdAt));

      // Resolve complaint labels/priority + prior severity for from→to dynamics.
      const allComplaintIds = Array.from(new Set(cuRows.map((u) => u.complaintId)));
      const complaintRows =
        allComplaintIds.length > 0
          ? await db
              .select()
              .from(clinicalComplaint)
              .where(inArray(clinicalComplaint.id, allComplaintIds))
          : [];
      const complaintById = new Map(complaintRows.map((c) => [c.id, c]));

      // All updates per complaint (chronological) to compute the "from" baseline.
      const allUpdatesByComplaint = new Map<string, typeof cuRows>();
      if (allComplaintIds.length > 0) {
        const everyUpdate = await db
          .select()
          .from(clinicalComplaintUpdate)
          .where(inArray(clinicalComplaintUpdate.complaintId, allComplaintIds))
          .orderBy(asc(clinicalComplaintUpdate.createdAt));
        for (const u of everyUpdate) {
          const list = allUpdatesByComplaint.get(u.complaintId) ?? [];
          list.push(u);
          allUpdatesByComplaint.set(u.complaintId, list);
        }
      }

      const fileRows = await db
        .select()
        .from(patientFiles)
        .where(inArray(patientFiles.visitId, visitIds))
        .orderBy(asc(patientFiles.createdAt));

      return visitRows.map((v) => {
        const dynamics = cuRows
          .filter((u) => u.visitId === v.id)
          .map((u) => {
            const complaint = complaintById.get(u.complaintId);
            const prior = (allUpdatesByComplaint.get(u.complaintId) ?? []).filter(
              (x) => x.createdAt < u.createdAt,
            );
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

        const sections: { title: string; body: string }[] = [];
        if (v.exam) sections.push({ title: "Осмотр", body: v.exam });
        if (v.manipulations) sections.push({ title: "Проведённые манипуляции", body: v.manipulations });
        if (v.trialResults) sections.push({ title: "Результаты проб", body: v.trialResults });
        if (v.recommendations) sections.push({ title: "Рекомендации / Назначения", body: v.recommendations });

        const files: VisitFile[] = fileRows
          .filter((f) => f.visitId === v.id)
          .map((f) => ({ id: f.id, icon: fileIconForMime(f.mimeType), name: f.fileName }));

        return {
          id: v.id,
          date: fmtVisitDate(v.visitedAt),
          type: v.visitType as "first" | "repeat",
          location: v.location ?? "",
          duration: v.duration ?? "",
          filesCount: files.length > 0 ? files.length : undefined,
          dynamics: dynamics.length > 0 ? dynamics : undefined,
          sections: sections.length > 0 ? sections : undefined,
          files: files.length > 0 ? files : undefined,
        };
      });
    },

    async searchDiagnosisCatalog(query: string): Promise<DiagnosisCatalogSuggestion[]> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(clinicalDiagnosisCatalog)
        .where(ilike(clinicalDiagnosisCatalog.label, `%${query}%`))
        .orderBy(asc(clinicalDiagnosisCatalog.label))
        .limit(20);
      return rows.map((r) => ({ id: r.id, label: r.label, note: r.note ?? null }));
    },

    async createDiagnosisCatalogEntry(
      params: CreateDiagnosisCatalogParams,
    ): Promise<DiagnosisCatalogSuggestion> {
      const db = getDrizzle();
      const inserted = await db
        .insert(clinicalDiagnosisCatalog)
        .values({
          label: params.label,
          note: params.note ?? null,
          createdBy: params.createdBy,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("clinical_diagnosis_catalog insert failed");
      return { id: row.id, label: row.label, note: row.note ?? null };
    },

    async createVisit(input: CreateVisitInput): Promise<string> {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const insertedVisit = await tx
          .insert(clinicalVisit)
          .values({
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
          })
          .returning({ id: clinicalVisit.id });
        const visitId = insertedVisit[0]?.id;
        if (!visitId) throw new Error("clinical_visit insert failed");

        if (input.visitType === "first") {
          for (const c of input.complaints ?? []) {
            const insertedComplaint = await tx
              .insert(clinicalComplaint)
              .values({
                patientUserId: input.patientUserId,
                text: c.text,
                priority: c.priority,
                status: "active",
                sourceVisitId: visitId,
              })
              .returning({ id: clinicalComplaint.id });
            const complaintId = insertedComplaint[0]?.id;
            if (!complaintId) throw new Error("clinical_complaint insert failed");
            await tx.insert(clinicalComplaintUpdate).values({
              complaintId,
              visitId,
              note: null,
              severity: c.severity,
              resolved: false,
            });
          }
          for (const d of input.diagnoses ?? []) {
            await tx.insert(clinicalDiagnosis).values({
              patientUserId: input.patientUserId,
              catalogId: d.catalogId ?? null,
              text: d.text,
              priority: d.priority,
              status: "active",
              sourceVisitId: visitId,
            });
          }
        } else {
          for (const u of input.complaintUpdates ?? []) {
            await tx.insert(clinicalComplaintUpdate).values({
              complaintId: u.complaintId,
              visitId,
              note: u.note,
              severity: u.severity,
              resolved: u.resolved,
            });
            if (u.resolved) {
              await tx
                .update(clinicalComplaint)
                .set({ status: "resolved", resolvedAt: new Date().toISOString() })
                .where(eq(clinicalComplaint.id, u.complaintId));
            }
          }
          for (const u of input.diagnosisUpdates ?? []) {
            const nextStatus = u.removed ? "resolved" : "refined";
            await tx.insert(clinicalDiagnosisUpdate).values({
              diagnosisId: u.diagnosisId,
              visitId,
              refinement: u.refinement ?? null,
              status: nextStatus,
              removed: u.removed,
            });
            await tx
              .update(clinicalDiagnosis)
              .set({
                status: nextStatus,
                resolvedAt: u.removed ? new Date().toISOString() : null,
              })
              .where(eq(clinicalDiagnosis.id, u.diagnosisId));
          }
        }

        return visitId;
      });
    },

    // -- Инлайн-правка полей ------------------------------------------------------

    async updateComplaintFields(input: UpdateComplaintFieldsInput): Promise<boolean> {
      const set: Partial<{ text: string; priority: boolean }> = {};
      if (input.text !== undefined) set.text = input.text;
      if (input.priority !== undefined) set.priority = input.priority;
      if (Object.keys(set).length === 0) return false;
      const db = getDrizzle();
      const updated = await db
        .update(clinicalComplaint)
        .set(set)
        .where(
          and(
            eq(clinicalComplaint.id, input.complaintId),
            eq(clinicalComplaint.patientUserId, input.patientUserId),
          ),
        )
        .returning({ id: clinicalComplaint.id });
      return updated.length > 0;
    },

    async updateDiagnosisFields(input: UpdateDiagnosisFieldsInput): Promise<boolean> {
      const set: Partial<{ text: string; priority: boolean }> = {};
      if (input.text !== undefined) set.text = input.text;
      if (input.priority !== undefined) set.priority = input.priority;
      if (Object.keys(set).length === 0) return false;
      const db = getDrizzle();
      const updated = await db
        .update(clinicalDiagnosis)
        .set(set)
        .where(
          and(
            eq(clinicalDiagnosis.id, input.diagnosisId),
            eq(clinicalDiagnosis.patientUserId, input.patientUserId),
          ),
        )
        .returning({ id: clinicalDiagnosis.id });
      return updated.length > 0;
    },

    async updateVisitFields(input: UpdateVisitFieldsInput): Promise<boolean> {
      const set: Partial<{
        location: string | null;
        duration: string | null;
        exam: string | null;
        manipulations: string | null;
        trialResults: string | null;
        recommendations: string | null;
      }> = {};
      if (input.location !== undefined) set.location = input.location;
      if (input.duration !== undefined) set.duration = input.duration;
      if (input.exam !== undefined) set.exam = input.exam;
      if (input.manipulations !== undefined) set.manipulations = input.manipulations;
      if (input.trialResults !== undefined) set.trialResults = input.trialResults;
      if (input.recommendations !== undefined) set.recommendations = input.recommendations;
      if (Object.keys(set).length === 0) return false;
      const db = getDrizzle();
      const updated = await db
        .update(clinicalVisit)
        .set(set)
        .where(
          and(
            eq(clinicalVisit.id, input.visitId),
            eq(clinicalVisit.patientUserId, input.patientUserId),
          ),
        )
        .returning({ id: clinicalVisit.id });
      return updated.length > 0;
    },

    // -- Анамнез ------------------------------------------------------------------

    async getAnamnesis(patientUserId: string): Promise<AnamnesisState> {
      const db = getDrizzle();

      const [traumaRows, illnessRows, lifestyleRows] = await Promise.all([
        db
          .select()
          .from(clinicalAnamnesisTrauma)
          .where(eq(clinicalAnamnesisTrauma.patientUserId, patientUserId))
          .orderBy(asc(clinicalAnamnesisTrauma.createdAt)),
        db
          .select()
          .from(clinicalAnamnesisIllness)
          .where(eq(clinicalAnamnesisIllness.patientUserId, patientUserId))
          .orderBy(asc(clinicalAnamnesisIllness.createdAt)),
        db
          .select()
          .from(clinicalAnamnesisLifestyle)
          .where(eq(clinicalAnamnesisLifestyle.patientUserId, patientUserId))
          .orderBy(asc(clinicalAnamnesisLifestyle.createdAt)),
      ]);

      return {
        trauma: traumaRows.map((r) => ({
          id: r.id,
          year: r.year,
          what: r.what,
          type: r.type,
          immobilization: r.immobilization,
        })),
        illness: illnessRows.map((r) => ({
          id: r.id,
          period: r.period,
          what: r.what,
          comment: r.comment,
        })),
        lifestyle: lifestyleRows.map((r) => ({
          id: r.id,
          date: fmtDisplayDate(r.recordDate),
          text: r.text,
        })),
      };
    },

    async appendAnamnesisTrauma(
      input: AppendAnamnesisTraumaInput,
    ): Promise<AnamnesisTraumaEntry> {
      const db = getDrizzle();
      const rows = await db
        .insert(clinicalAnamnesisTrauma)
        .values({
          patientUserId: input.patientUserId,
          year: input.year,
          what: input.what,
          type: input.type,
          immobilization: input.immobilization,
          createdBy: input.createdBy,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("clinical_anamnesis_trauma insert failed");
      return { id: row.id, year: row.year, what: row.what, type: row.type, immobilization: row.immobilization };
    },

    async appendAnamnesisIllness(
      input: AppendAnamnesisIllnessInput,
    ): Promise<AnamnesisIllnessEntry> {
      const db = getDrizzle();
      const rows = await db
        .insert(clinicalAnamnesisIllness)
        .values({
          patientUserId: input.patientUserId,
          period: input.period,
          what: input.what,
          comment: input.comment,
          createdBy: input.createdBy,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("clinical_anamnesis_illness insert failed");
      return { id: row.id, period: row.period, what: row.what, comment: row.comment };
    },

    async appendAnamnesisLifestyle(
      input: AppendAnamnesisLifestyleInput,
    ): Promise<AnamnesisLifestyleEntry> {
      const db = getDrizzle();
      const rows = await db
        .insert(clinicalAnamnesisLifestyle)
        .values({
          patientUserId: input.patientUserId,
          recordDate: input.recordDate,
          text: input.text,
          createdBy: input.createdBy,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("clinical_anamnesis_lifestyle insert failed");
      return { id: row.id, date: fmtDisplayDate(row.recordDate), text: row.text };
    },
  };
}
