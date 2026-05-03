import { and, desc, eq, inArray, max } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { treatmentProgramEvents as eventTable } from "../../../db/schema/treatmentProgramEvents";
import type { TreatmentProgramEventsPort } from "@/modules/treatment-program/ports";
import type {
  AppendTreatmentProgramEventInput,
  TreatmentProgramEventRow,
  TreatmentProgramEventTargetType,
  TreatmentProgramEventType,
} from "@/modules/treatment-program/types";
import { TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES } from "@/modules/treatment-program/types";

/** Coerce Drizzle/Postgres `max(created_at)` aggregate (A5 POST-AUDIT A5-PG-MAX-TYPE-01). */
export function coerceMaxPlanMutationCreatedAtToIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
}

function mapRow(row: typeof eventTable.$inferSelect): TreatmentProgramEventRow {
  return {
    id: row.id,
    instanceId: row.instanceId,
    actorId: row.actorId ?? null,
    eventType: row.eventType as TreatmentProgramEventType,
    targetType: row.targetType as TreatmentProgramEventTargetType,
    targetId: row.targetId,
    payload: (row.payload as Record<string, unknown>) ?? {},
    reason: row.reason ?? null,
    createdAt: row.createdAt,
  };
}

export function createPgTreatmentProgramEventsPort(): TreatmentProgramEventsPort {
  return {
    async appendEvent(input: AppendTreatmentProgramEventInput): Promise<TreatmentProgramEventRow> {
      const db = getDrizzle();
      const [row] = await db
        .insert(eventTable)
        .values({
          instanceId: input.instanceId,
          actorId: input.actorId,
          eventType: input.eventType,
          targetType: input.targetType,
          targetId: input.targetId,
          payload: input.payload ?? {},
          reason: input.reason ?? null,
        })
        .returning();
      if (!row) throw new Error("insert treatment_program_event failed");
      return mapRow(row);
    },

    async listEventsForInstance(instanceId: string, limit = 200): Promise<TreatmentProgramEventRow[]> {
      const db = getDrizzle();
      const cap = Math.min(Math.max(limit, 1), 500);
      const rows = await db
        .select()
        .from(eventTable)
        .where(eq(eventTable.instanceId, instanceId))
        .orderBy(desc(eventTable.createdAt))
        .limit(cap);
      /** AUDIT_PHASE_7 FIX: в UI — хронологический порядок «старые → новые» внутри окна из последних `cap` событий. */
      return rows.map(mapRow).reverse();
    },

    async getMaxPlanMutationEventCreatedAt(instanceId: string): Promise<string | null> {
      const db = getDrizzle();
      const [row] = await db
        .select({ m: max(eventTable.createdAt) })
        .from(eventTable)
        .where(
          and(eq(eventTable.instanceId, instanceId), inArray(eventTable.eventType, [...TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES])),
        );
      const v = row?.m;
      return coerceMaxPlanMutationCreatedAtToIso(v);
    },
  };
}
