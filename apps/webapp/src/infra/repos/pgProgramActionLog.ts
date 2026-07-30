import { and, count, desc, eq, gte, lt, max, or, isNull, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { programActionLog as logTable } from '../../../db/schema/programActionLog';
import {
  treatmentProgramInstanceStageItems as itemTable,
  treatmentProgramInstanceStages as stageTable,
  treatmentProgramInstances as instTable,
} from '../../../db/schema/treatmentProgramInstances';
import type { ProgramActionLogPort } from '@/modules/treatment-program/ports';
import type {
  ProgramActionLogInsert,
  ProgramActionLogListRow,
  ProgramActionType,
} from '@/modules/treatment-program/types';
import { PROGRAM_ACTION_TYPES } from '@/modules/treatment-program/types';
import { programActionDoneActivityKey } from '@/modules/treatment-program/programActionActivityKey';

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

export function createPgProgramActionLogPort(): ProgramActionLogPort {
  return {
    async insertAction(input: ProgramActionLogInsert) {
      return runDrizzleMutationTransaction(async (tx) => {
        const inst = await tx.query.treatmentProgramInstances.findFirst({
          where: eq(instTable.id, input.instanceId),
        });
        const [stageItem] = await tx
          .select({
            stageItemOrganizationId: itemTable.organizationId,
            stageOrganizationId: stageTable.organizationId,
            instanceId: stageTable.instanceId,
          })
          .from(itemTable)
          .innerJoin(stageTable, eq(stageTable.id, itemTable.stageId))
          .where(eq(itemTable.id, input.instanceStageItemId))
          .limit(1);
        if (!inst || !stageItem || stageItem.instanceId !== input.instanceId) {
          throw new Error('program_action_log_parent_mismatch');
        }
        const [row] = await tx
          .insert(logTable)
          .values({
            organizationId: currentWriteOrganizationId(
              inst.organizationId,
              stageItem.stageOrganizationId,
              stageItem.stageItemOrganizationId,
            ),
            instanceId: input.instanceId,
            instanceStageItemId: input.instanceStageItemId,
            patientUserId: input.patientUserId,
            sessionId: input.sessionId ?? null,
            actionType: input.actionType,
            payload: input.payload ?? null,
            note: input.note ?? null,
          })
          .returning({ id: logTable.id, createdAt: logTable.createdAt });
        if (!row) throw new Error('insert program_action_log failed');
        return { id: row.id, createdAt: row.createdAt };
      });
    },

    async getLatestSimpleDonePayload(params) {
      const db = getDrizzle();
      const [row] = await db
        .select({ createdAt: logTable.createdAt, payload: logTable.payload })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.instanceStageItemId, params.instanceStageItemId),
            eq(logTable.actionType, 'done'),
            or(
              isNull(logTable.payload),
              sql`coalesce(${logTable.payload}->>'source', '') not in ('test_submitted', 'lfk_exercise_done')`,
            ),
          ),
        )
        .orderBy(desc(logTable.createdAt))
        .limit(1);
      return row ? { createdAt: row.createdAt, payload: row.payload ?? null } : null;
    },

    async deleteSimpleDoneInWindow(params) {
      await runDrizzleMutationTransaction(async (tx) => {
        await tx
          .delete(logTable)
          .where(
            and(
              eq(logTable.instanceId, params.instanceId),
              eq(logTable.patientUserId, params.patientUserId),
              eq(logTable.instanceStageItemId, params.instanceStageItemId),
              eq(logTable.actionType, 'done'),
              gte(logTable.createdAt, params.windowStartIso),
              lt(logTable.createdAt, params.windowEndIso),
              or(
                isNull(logTable.payload),
                sql`coalesce(${logTable.payload}->>'source', '') not in ('test_submitted', 'lfk_exercise_done')`,
              ),
            ),
          );
      });
    },

    async deleteAllDoneInWindow(params) {
      await runDrizzleMutationTransaction(async (tx) => {
        await tx
          .delete(logTable)
          .where(
            and(
              eq(logTable.instanceId, params.instanceId),
              eq(logTable.patientUserId, params.patientUserId),
              eq(logTable.instanceStageItemId, params.instanceStageItemId),
              eq(logTable.actionType, 'done'),
              gte(logTable.createdAt, params.windowStartIso),
              lt(logTable.createdAt, params.windowEndIso),
            ),
          );
      });
    },

    async listDoneItemIdsInWindow(params) {
      const db = getDrizzle();
      const rows = await db
        .select({ itemId: logTable.instanceStageItemId })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartIso),
            lt(logTable.createdAt, params.windowEndIso),
          ),
        );
      return [...new Set(rows.map((r) => r.itemId))];
    },

    async countDoneByItemInWindow(params) {
      const db = getDrizzle();
      const rows = await db
        .select({
          itemId: logTable.instanceStageItemId,
          c: count(),
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartIso),
            lt(logTable.createdAt, params.windowEndIso),
          ),
        )
        .groupBy(logTable.instanceStageItemId);
      const out: Record<string, number> = {};
      for (const r of rows) {
        out[r.itemId] = Number(r.c);
      }
      return out;
    },

    async countDoneByActivityKeyInWindow(params) {
      const db = getDrizzle();
      const rows = await db
        .select({
          itemId: logTable.instanceStageItemId,
          payload: logTable.payload,
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartIso),
            lt(logTable.createdAt, params.windowEndIso),
          ),
        );
      const out: Record<string, number> = {};
      for (const r of rows) {
        const key = programActionDoneActivityKey(
          r.itemId,
          r.payload as Record<string, unknown> | null,
        );
        out[key] = (out[key] ?? 0) + 1;
      }
      return out;
    },

    async lastDoneAtIsoByItemForInstance(params) {
      const db = getDrizzle();
      const rows = await db
        .select({
          itemId: logTable.instanceStageItemId,
          lastAt: max(logTable.createdAt),
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
          ),
        )
        .groupBy(logTable.instanceStageItemId);
      const out: Record<string, string> = {};
      for (const r of rows) {
        if (r.lastAt != null) out[r.itemId] = String(r.lastAt);
      }
      return out;
    },

    async countCompletionEventsByItemForInstance(params) {
      const db = getDrizzle();
      const rows = await db
        .select({
          itemId: logTable.instanceStageItemId,
          c: sql<number>`count(distinct coalesce(${logTable.sessionId}, ${logTable.id}))`.mapWith(
            Number,
          ),
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
          ),
        )
        .groupBy(logTable.instanceStageItemId);
      const out: Record<string, number> = {};
      for (const r of rows) {
        out[r.itemId] = Number(r.c);
      }
      return out;
    },

    async lastDoneAtIsoByActivityKeyForInstance(params) {
      const db = getDrizzle();
      const rows = await db
        .select({
          itemId: logTable.instanceStageItemId,
          payload: logTable.payload,
          createdAt: logTable.createdAt,
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
          ),
        );
      const out: Record<string, string> = {};
      for (const r of rows) {
        const key = programActionDoneActivityKey(
          r.itemId,
          r.payload as Record<string, unknown> | null,
        );
        const at = String(r.createdAt);
        const prev = out[key];
        if (!prev || at > prev) out[key] = at;
      }
      return out;
    },

    async countDistinctLocalCalendarDaysWithDoneInWindow(params) {
      const iana = params.displayIana;
      if (!/^[-+/_0-9a-zA-Z]+$/.test(iana)) {
        throw new Error('invalid_timezone');
      }
      const zoneSql = sql.raw(`'${iana.replace(/'/g, "''")}'`);
      const db = getDrizzle();
      const [row] = await db
        .select({
          c: sql<number>`count(distinct ((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date))::int`.mapWith(
            Number,
          ),
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartUtcIso),
            lt(logTable.createdAt, params.windowEndUtcExclusiveIso),
          ),
        );
      return row?.c ?? 0;
    },

    async listDistinctLocalDoneDateKeysInWindowForPatient(params) {
      const iana = params.displayIana;
      if (!/^[-+/_0-9a-zA-Z]+$/.test(iana)) {
        throw new Error('invalid_timezone');
      }
      const zoneSql = sql.raw(`'${iana.replace(/'/g, "''")}'`);
      const db = getDrizzle();
      const rows = await db
        .select({
          dayKey: sql<string>`((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date)::text`,
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.patientUserId, params.patientUserId),
            params.organizationId ? eq(logTable.organizationId, params.organizationId) : undefined,
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartUtcIso),
            lt(logTable.createdAt, params.windowEndUtcExclusiveIso),
          ),
        )
        .groupBy(sql`((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date)::text`);
      return rows
        .map((r) => r.dayKey)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    },

    async listDoneItemsByLocalDateInWindow(params) {
      const iana = params.displayIana;
      if (!/^[-+/_0-9a-zA-Z]+$/.test(iana)) {
        throw new Error('invalid_timezone');
      }
      const zoneSql = sql.raw(`'${iana.replace(/'/g, "''")}'`);
      const db = getDrizzle();
      const rows = await db
        .select({
          localDate: sql<string>`((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date)::text`,
          itemId: logTable.instanceStageItemId,
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartUtcIso),
            lt(logTable.createdAt, params.windowEndUtcExclusiveIso),
          ),
        )
        .groupBy(
          sql`((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date)`,
          logTable.instanceStageItemId,
        );
      return rows.map((r) => ({ localDate: r.localDate, itemId: r.itemId }));
    },

    async listDoneItemsByLocalDateInWindowForPatient(params) {
      const iana = params.displayIana;
      if (!/^[-+/_0-9a-zA-Z]+$/.test(iana)) {
        throw new Error('invalid_timezone');
      }
      const zoneSql = sql.raw(`'${iana.replace(/'/g, "''")}'`);
      const db = getDrizzle();
      const rows = await db
        .select({
          localDate: sql<string>`((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date)::text`,
          itemId: logTable.instanceStageItemId,
          instanceId: logTable.instanceId,
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.patientUserId, params.patientUserId),
            params.organizationId ? eq(logTable.organizationId, params.organizationId) : undefined,
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartUtcIso),
            lt(logTable.createdAt, params.windowEndUtcExclusiveIso),
          ),
        )
        .groupBy(
          sql`((${logTable.createdAt} AT TIME ZONE ${zoneSql})::date)`,
          logTable.instanceStageItemId,
          logTable.instanceId,
        );
      return rows.map((r) => ({
        localDate: r.localDate,
        itemId: r.itemId,
        instanceId: r.instanceId,
      }));
    },

    async listForInstance(params) {
      const db = getDrizzle();
      const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
      const rows = await db
        .select({
          id: logTable.id,
          instanceId: logTable.instanceId,
          instanceStageItemId: logTable.instanceStageItemId,
          patientUserId: logTable.patientUserId,
          sessionId: logTable.sessionId,
          actionType: logTable.actionType,
          payload: logTable.payload,
          note: logTable.note,
          createdAt: logTable.createdAt,
        })
        .from(logTable)
        .where(eq(logTable.instanceId, params.instanceId))
        .orderBy(desc(logTable.createdAt))
        .limit(limit);

      const out: ProgramActionLogListRow[] = [];
      for (const r of rows) {
        const at = r.actionType;
        if (!PROGRAM_ACTION_TYPES.includes(at as ProgramActionType)) continue;
        out.push({
          id: r.id,
          instanceId: r.instanceId,
          instanceStageItemId: r.instanceStageItemId,
          patientUserId: r.patientUserId,
          sessionId: r.sessionId ?? null,
          actionType: at as ProgramActionType,
          payload: r.payload ?? null,
          note: r.note ?? null,
          createdAt: r.createdAt,
        });
      }
      return out;
    },

    async listDoneForStageItemInWindow(params) {
      const db = getDrizzle();
      const rows = await db
        .select({
          id: logTable.id,
          instanceId: logTable.instanceId,
          instanceStageItemId: logTable.instanceStageItemId,
          patientUserId: logTable.patientUserId,
          sessionId: logTable.sessionId,
          actionType: logTable.actionType,
          payload: logTable.payload,
          note: logTable.note,
          createdAt: logTable.createdAt,
        })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.instanceStageItemId, params.instanceStageItemId),
            eq(logTable.actionType, 'done'),
            gte(logTable.createdAt, params.windowStartUtcIso),
            lt(logTable.createdAt, params.windowEndUtcExclusiveIso),
          ),
        )
        .orderBy(desc(logTable.createdAt))
        .limit(50);

      const out: ProgramActionLogListRow[] = [];
      for (const r of rows) {
        const at = r.actionType;
        if (!PROGRAM_ACTION_TYPES.includes(at as ProgramActionType)) continue;
        out.push({
          id: r.id,
          instanceId: r.instanceId,
          instanceStageItemId: r.instanceStageItemId,
          patientUserId: r.patientUserId,
          sessionId: r.sessionId ?? null,
          actionType: at as ProgramActionType,
          payload: r.payload ?? null,
          note: r.note ?? null,
          createdAt: r.createdAt,
        });
      }
      return out;
    },
  };
}
