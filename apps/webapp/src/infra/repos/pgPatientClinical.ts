/**
 * Pg implementation of PatientClinicalPort.
 * Uses Drizzle ORM; createVisit is transactional. Projection assembly (state =
 * latest update per complaint, trend oldest→newest) mirrors inMemoryPatientClinical.
 */

import { and, asc, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runWebappTransaction } from "@/infra/db/runWebappSql";
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
  VisitFile,
} from "@/modules/patient-clinical/ports";
import {
  clinicalComplaint,
  clinicalComplaintUpdate,
  clinicalDiagnosis,
  clinicalDiagnosisCatalog,
  clinicalDiagnosisStatusHistory,
  clinicalDiagnosisUpdate,
  clinicalVisit,
} from "../../../db/schema/patientClinical";
import {
  clinicalAnamnesisTrauma,
  clinicalAnamnesisIllness,
  clinicalAnamnesisLifestyle,
} from "../../../db/schema/patientClinicalAnamnesis";
import { patientFiles } from "../../../db/schema/patientFiles";
import { beAppointments } from "../../../db/schema/bookingEngine";

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function fmtVisitDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtVisitTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
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
          description: c.description ?? null,
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
          clinicalStatus: (d.clinicalStatus ?? "предварительный") as DiagnosisClinicalStatus,
          meta,
          comment: d.comment ?? null,
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

      // Package data by clinical_visit.appointmentRecordId. The visit stores
      // appointment_records.id, so resolve it to be_appointments through the
      // native `be:<uuid>` projection or Rubitime external mapping first.
      const packageByAppointmentRecordId = new Map<
        string,
        { title: string; displayNumber: number | null }
      >();
      const appointmentRecordIds = visitRows
        .map((v) => v.appointmentRecordId)
        .filter((id): id is string => id != null);
      if (appointmentRecordIds.length > 0) {
        const idValues = sql.join(
          appointmentRecordIds.map((id) => sql`(${id}::uuid)`),
          sql`, `,
        );
        const pkgRows = await db.execute<{
          appointment_record_id: string;
          title: string;
          display_number: number | null;
        }>(sql`
          WITH visit_ar(id) AS (
            SELECT * FROM (VALUES ${idValues}) v(id)
          ),
          resolved AS (
            SELECT
              ar.id AS appointment_record_id,
              COALESCE(be_from_id.id, be_from_map.id) AS be_appointment_id
            FROM visit_ar va
            JOIN appointment_records ar ON ar.id = va.id
            LEFT JOIN be_external_entity_mappings appt_map
              ON appt_map.entity_type = 'appointment'
             AND appt_map.external_system = 'rubitime'
             AND appt_map.external_id = ar.integrator_record_id
            LEFT JOIN be_appointments be_from_map ON be_from_map.id = appt_map.canonical_id
            LEFT JOIN be_appointments be_from_id ON be_from_id.id = CASE
              WHEN ar.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
                THEN (substring(ar.integrator_record_id from 4))::uuid
              ELSE NULL
            END
          )
          SELECT DISTINCT ON (r.appointment_record_id)
            r.appointment_record_id,
            pp.title,
            pp.display_number
          FROM resolved r
          JOIN be_package_usages u
            ON u.appointment_id = r.be_appointment_id
           AND u.usage_kind IN ('consume', 'penalty')
          JOIN be_patient_packages pp ON pp.id = u.patient_package_id
          ORDER BY r.appointment_record_id, u.occurred_at DESC, u.id DESC
        `);
        for (const row of pkgRows.rows) {
          if (!packageByAppointmentRecordId.has(row.appointment_record_id)) {
            packageByAppointmentRecordId.set(row.appointment_record_id, {
              title: row.title,
              displayNumber: row.display_number,
            });
          }
        }
      }

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
        if (v.anamnesisText) sections.push({ title: "Анамнез / история жалобы", body: v.anamnesisText });
        if (v.exam) sections.push({ title: "Осмотр", body: v.exam });
        if (v.manipulations) sections.push({ title: "Проведённые манипуляции", body: v.manipulations });
        if (v.trialResults) sections.push({ title: "Результаты проб", body: v.trialResults });
        if (v.recommendations) sections.push({ title: "Рекомендации / Назначения", body: v.recommendations });

        const files: VisitFile[] = fileRows
          .filter((f) => f.visitId === v.id)
          .map((f) => ({ id: f.id, icon: fileIconForMime(f.mimeType), name: f.fileName }));

        const pkg = v.appointmentRecordId
          ? (packageByAppointmentRecordId.get(v.appointmentRecordId) ?? null)
          : null;

        return {
          id: v.id,
          date: fmtVisitDate(v.visitedAt),
          time: fmtVisitTime(v.visitedAt),
          type: v.visitType as "first" | "repeat",
          location: v.location ?? "",
          duration: v.duration ?? "",
          anamnesisText: v.anamnesisText ?? null,
          filesCount: files.length > 0 ? files.length : undefined,
          dynamics: dynamics.length > 0 ? dynamics : undefined,
          sections: sections.length > 0 ? sections : undefined,
          files: files.length > 0 ? files : undefined,
          package: pkg,
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
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const inserted = await runWebappTransaction((tx) =>
        tx
          .insert(clinicalDiagnosisCatalog)
          .values({
            organizationId,
            label: params.label,
            note: params.note ?? null,
            createdBy: params.createdBy,
          })
          .returning(),
      );
      const row = inserted[0];
      if (!row) throw new Error("clinical_diagnosis_catalog insert failed");
      return { id: row.id, label: row.label, note: row.note ?? null };
    },

    async createVisit(input: CreateVisitInput): Promise<string> {
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      return runWebappTransaction(async (tx) => {
        const insertedVisit = await tx
          .insert(clinicalVisit)
          .values({
            organizationId,
            patientUserId: input.patientUserId,
            visitType: input.visitType,
            visitedAt: input.visitedAt,
            location: input.location ?? null,
            service: input.service ?? null,
            duration: input.duration ?? null,
            anamnesisText: input.anamnesisText ?? null,
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
                organizationId,
                patientUserId: input.patientUserId,
                text: c.text,
                description: c.description ?? null,
                priority: c.priority,
                status: "active",
                sourceVisitId: visitId,
              })
              .returning({ id: clinicalComplaint.id });
            const complaintId = insertedComplaint[0]?.id;
            if (!complaintId) throw new Error("clinical_complaint insert failed");
            await tx.insert(clinicalComplaintUpdate).values({
              organizationId,
              complaintId,
              visitId,
              note: null,
              severity: c.severity,
              resolved: false,
            });
          }
          for (const d of input.diagnoses ?? []) {
            await tx.insert(clinicalDiagnosis).values({
              organizationId,
              patientUserId: input.patientUserId,
              catalogId: d.catalogId ?? null,
              text: d.text,
              priority: d.priority,
              comment: d.comment ?? null,
              status: "active",
              sourceVisitId: visitId,
            });
          }
        } else {
          for (const u of input.complaintUpdates ?? []) {
            await tx.insert(clinicalComplaintUpdate).values({
              organizationId,
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
              organizationId,
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
      const updated = await runWebappTransaction((tx) =>
        tx
          .update(clinicalComplaint)
          .set(set)
          .where(
            and(
              eq(clinicalComplaint.id, input.complaintId),
              eq(clinicalComplaint.patientUserId, input.patientUserId),
            ),
          )
          .returning({ id: clinicalComplaint.id }),
      );
      return updated.length > 0;
    },

    async updateDiagnosisFields(input: UpdateDiagnosisFieldsInput): Promise<boolean> {
      const set: Partial<{ text: string; priority: boolean; comment: string | null }> = {};
      if (input.text !== undefined) set.text = input.text;
      if (input.priority !== undefined) set.priority = input.priority;
      if (input.comment !== undefined) set.comment = input.comment;
      if (Object.keys(set).length === 0) return false;
      const updated = await runWebappTransaction((tx) =>
        tx
          .update(clinicalDiagnosis)
          .set(set)
          .where(
            and(
              eq(clinicalDiagnosis.id, input.diagnosisId),
              eq(clinicalDiagnosis.patientUserId, input.patientUserId),
            ),
          )
          .returning({ id: clinicalDiagnosis.id }),
      );
      return updated.length > 0;
    },

    async updateVisitFields(input: UpdateVisitFieldsInput): Promise<boolean> {
      const set: Partial<{
        location: string | null;
        duration: string | null;
        anamnesisText: string | null;
        exam: string | null;
        manipulations: string | null;
        trialResults: string | null;
        recommendations: string | null;
      }> = {};
      if (input.location !== undefined) set.location = input.location;
      if (input.duration !== undefined) set.duration = input.duration;
      if (input.anamnesisText !== undefined) set.anamnesisText = input.anamnesisText;
      if (input.exam !== undefined) set.exam = input.exam;
      if (input.manipulations !== undefined) set.manipulations = input.manipulations;
      if (input.trialResults !== undefined) set.trialResults = input.trialResults;
      if (input.recommendations !== undefined) set.recommendations = input.recommendations;
      if (Object.keys(set).length === 0) return false;
      const updated = await runWebappTransaction((tx) =>
        tx
          .update(clinicalVisit)
          .set(set)
          .where(
            and(
              eq(clinicalVisit.id, input.visitId),
              eq(clinicalVisit.patientUserId, input.patientUserId),
            ),
          )
          .returning({ id: clinicalVisit.id }),
      );
      return updated.length > 0;
    },

    // -- Клинический статус диагноза ------------------------------------------

    async setDiagnosisClinicalStatus(input: SetDiagnosisClinicalStatusInput): Promise<boolean> {
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      return runWebappTransaction(async (tx) => {
        // Fetch current status (also validates patientUserId scope).
        const existing = await tx
          .select({ id: clinicalDiagnosis.id, clinicalStatus: clinicalDiagnosis.clinicalStatus })
          .from(clinicalDiagnosis)
          .where(
            and(
              eq(clinicalDiagnosis.id, input.diagnosisId),
              eq(clinicalDiagnosis.patientUserId, input.patientUserId),
            ),
          )
          .limit(1);
        if (!existing[0]) return false;

        const oldStatus = existing[0].clinicalStatus ?? "предварительный";

        await tx
          .update(clinicalDiagnosis)
          .set({ clinicalStatus: input.newStatus })
          .where(eq(clinicalDiagnosis.id, input.diagnosisId));

        await tx.insert(clinicalDiagnosisStatusHistory).values({
          organizationId,
          diagnosisId: input.diagnosisId,
          oldStatus,
          newStatus: input.newStatus,
          changedBy: input.changedBy,
          note: input.note ?? null,
        });

        return true;
      });
    },

    async getDiagnosisStatusHistory(diagnosisId: string): Promise<DiagnosisStatusHistoryEntry[]> {
      const db = getDrizzle();
      // Join with platform_users to get name — but platform_users may not have a simple
      // "name" field; fall back to null (the UI shows «неизвестно» in that case).
      const rows = await db
        .select({
          id: clinicalDiagnosisStatusHistory.id,
          oldStatus: clinicalDiagnosisStatusHistory.oldStatus,
          newStatus: clinicalDiagnosisStatusHistory.newStatus,
          changedAt: clinicalDiagnosisStatusHistory.changedAt,
          note: clinicalDiagnosisStatusHistory.note,
        })
        .from(clinicalDiagnosisStatusHistory)
        .where(eq(clinicalDiagnosisStatusHistory.diagnosisId, diagnosisId))
        .orderBy(asc(clinicalDiagnosisStatusHistory.changedAt));

      return rows.map((r) => ({
        id: r.id,
        oldStatus: r.oldStatus ?? null,
        newStatus: r.newStatus,
        changedAt: r.changedAt,
        changedByName: null, // name resolution deferred (no denormalized name column)
        note: r.note ?? null,
      }));
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
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const rows = await runWebappTransaction((tx) =>
        tx
          .insert(clinicalAnamnesisTrauma)
          .values({
            organizationId,
            patientUserId: input.patientUserId,
            year: input.year,
            what: input.what,
            type: input.type,
            immobilization: input.immobilization,
            createdBy: input.createdBy,
          })
          .returning(),
      );
      const row = rows[0];
      if (!row) throw new Error("clinical_anamnesis_trauma insert failed");
      return {
        id: row.id,
        year: row.year,
        what: row.what,
        type: row.type,
        immobilization: row.immobilization,
      };
    },

    async appendAnamnesisIllness(
      input: AppendAnamnesisIllnessInput,
    ): Promise<AnamnesisIllnessEntry> {
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const rows = await runWebappTransaction((tx) =>
        tx
          .insert(clinicalAnamnesisIllness)
          .values({
            organizationId,
            patientUserId: input.patientUserId,
            period: input.period,
            what: input.what,
            comment: input.comment,
            createdBy: input.createdBy,
          })
          .returning(),
      );
      const row = rows[0];
      if (!row) throw new Error("clinical_anamnesis_illness insert failed");
      return { id: row.id, period: row.period, what: row.what, comment: row.comment };
    },

    async appendAnamnesisLifestyle(
      input: AppendAnamnesisLifestyleInput,
    ): Promise<AnamnesisLifestyleEntry> {
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const rows = await runWebappTransaction((tx) =>
        tx
          .insert(clinicalAnamnesisLifestyle)
          .values({
            organizationId,
            patientUserId: input.patientUserId,
            recordDate: input.recordDate,
            text: input.text,
            createdBy: input.createdBy,
          })
          .returning(),
      );
      const row = rows[0];
      if (!row) throw new Error("clinical_anamnesis_lifestyle insert failed");
      return { id: row.id, date: fmtDisplayDate(row.recordDate), text: row.text };
    },

    async listLinkedAppointmentRecordIds(patientUserId: string): Promise<string[]> {
      const db = getDrizzle();
      const rows = await db
        .select({ appointmentRecordId: clinicalVisit.appointmentRecordId })
        .from(clinicalVisit)
        .where(
          and(
            eq(clinicalVisit.patientUserId, patientUserId),
            // Only non-null links
          ),
        );
      return rows
        .map((r) => r.appointmentRecordId)
        .filter((id): id is string => id != null);
    },
  };
}
