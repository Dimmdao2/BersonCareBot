import { and, desc, eq, inArray, max } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { treatmentProgramEvents as eventTable } from '../../../db/schema/treatmentProgramEvents';
import { treatmentProgramInstances as instTable } from '../../../db/schema/treatmentProgramInstances';
import type { TreatmentProgramEventsPort } from '@/modules/treatment-program/ports';
import type {
  AppendTreatmentProgramEventInput,
  TreatmentProgramEventRow,
  TreatmentProgramEventTargetType,
  TreatmentProgramEventType,
} from '@/modules/treatment-program/types';
import { TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES } from '@/modules/treatment-program/types';

/** Coerce Drizzle/Postgres `max(created_at)` aggregate (A5 POST-AUDIT A5-PG-MAX-TYPE-01). */
export function coerceMaxPlanMutationCreatedAtToIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return toIsoStringSafe(v);
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

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string | null {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (principalOrganizationId &&
      fallbackOrganizationId &&
      principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId ?? fallbackOrganizationId;
}

export function createPgTreatmentProgramEventsPort(): TreatmentProgramEventsPort {
  return {
    async appendEvent(input: AppendTreatmentProgramEventInput): Promise<TreatmentProgramEventRow> {
      return runDrizzleMutationTransaction(async (tx) => {
        const principal = getCurrentDbPrincipal();
        const currentPatientUserId =
          principal?.kind === 'patient' ? principal.platformUserId : null;
        if (currentPatientUserId && input.actorId && input.actorId !== currentPatientUserId) {
          throw new Error('patient_event_actor_mismatch');
        }
        const inst = await tx.query.treatmentProgramInstances.findFirst({
          where: eq(instTable.id, input.instanceId),
        });
        const [row] = await tx
          .insert(eventTable)
          .values({
            organizationId: currentWriteOrganizationId(inst?.organizationId),
            instanceId: input.instanceId,
            ...(currentPatientUserId ? {} : { actorId: input.actorId }),
            eventType: input.eventType,
            targetType: input.targetType,
            targetId: input.targetId,
            payload: input.payload ?? {},
            reason: input.reason ?? null,
          })
          .returning();
        if (!row) throw new Error('insert treatment_program_event failed');
        return mapRow(row);
      });
    },

    async listEventsForInstance(
      instanceId: string,
      limit = 200,
    ): Promise<TreatmentProgramEventRow[]> {
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
          and(
            eq(eventTable.instanceId, instanceId),
            inArray(eventTable.eventType, [...TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES]),
          ),
        );
      const v = row?.m;
      return coerceMaxPlanMutationCreatedAtToIso(v);
    },
  };
}
