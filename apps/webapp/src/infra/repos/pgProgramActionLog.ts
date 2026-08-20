import { and, count, desc, eq, gte, lt, max, or, isNull, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  getDrizzleOrMutationTx,
  runDrizzleMutationTransaction,
} from '@/infra/db/drizzleMutationTx';
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

async function deleteCurrentPatientActionsInWindow(params: {
  instanceId: string;
  instanceStageItemId: string;
  windowStartIso: string;
  windowEndIso: string;
  includeSpecial: boolean;
}): Promise<void> {
  const args = [
    params.instanceId,
    params.instanceStageItemId,
    params.windowStartIso,
    params.windowEndIso,
    params.includeSpecial,
  ] as const;
  await runWebappNamedRoot(
    getWebappSqlDb(),
    'app.delete_current_patient_program_actions_in_window(uuid,uuid,timestamp with time zone,timestamp with time zone,boolean)',
    args,
    sql`SELECT app.delete_current_patient_program_actions_in_window(
      ${params.instanceId}::uuid,
      ${params.instanceStageItemId}::uuid,
      ${params.windowStartIso}::timestamptz,
      ${params.windowEndIso}::timestamptz,
      ${params.includeSpecial}::boolean
    ) AS affected`,
  );
}

export function createPgProgramActionLogPort(): ProgramActionLogPort {
  return {
    async completeCurrentPatientSimpleItem(params) {
      const metrics = JSON.stringify(params.metrics);
      const result = await runWebappNamedRoot<{
        completion: { id: string; createdAt: string };
      }>(
        getWebappSqlDb(),
        'app.complete_current_patient_program_item(uuid,uuid,integer,text)',
        [
          params.instanceId,
          params.instanceStageItemId,
          params.repeatCooldownMinutes,
          metrics,
        ],
        sql`SELECT app.complete_current_patient_program_item(
          ${params.instanceId}::uuid,
          ${params.instanceStageItemId}::uuid,
          ${params.repeatCooldownMinutes}::integer,
          ${metrics}::text
        ) AS completion`,
      );
      const completion = result.rows[0]?.completion;
      if (!completion?.id || !completion.createdAt) throw new Error('Не удалось сохранить');
      return { id: completion.id, createdAt: completion.createdAt };
    },

    async insertAction(input: ProgramActionLogInsert) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const payload = JSON.stringify(input.payload ?? {});
        const args = [
          input.instanceId,
          input.instanceStageItemId,
          input.actionType,
          input.sessionId ?? null,
          payload,
          input.note ?? null,
        ] as const;
        const result = await runWebappNamedRoot<{
          action: { id: string; created_at: string };
        }>(
          getWebappSqlDb(),
          'app.record_current_patient_program_action(uuid,uuid,text,uuid,text,text)',
          args,
          sql`SELECT app.record_current_patient_program_action(
            ${input.instanceId}::uuid,
            ${input.instanceStageItemId}::uuid,
            ${input.actionType}::text,
            ${input.sessionId ?? null}::uuid,
            ${payload}::text,
            ${input.note ?? null}::text
          ) AS action`,
        );
        const row = result.rows[0]?.action;
        if (!row) throw new Error('insert program_action_log failed');
        return { id: row.id, createdAt: row.created_at };
      }
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

    async lockSimpleCompletionTargetAndGetLatest(params) {
      const db = getDrizzleOrMutationTx();
      const [target] = await db
        .select({ id: itemTable.id })
        .from(itemTable)
        .innerJoin(stageTable, eq(stageTable.id, itemTable.stageId))
        .innerJoin(instTable, eq(instTable.id, stageTable.instanceId))
        .where(
          and(
            eq(itemTable.id, params.instanceStageItemId),
            eq(stageTable.instanceId, params.instanceId),
            eq(instTable.patientUserId, params.patientUserId),
          ),
        )
        .limit(1)
        .for('update');
      if (!target) throw new Error('Элемент не найден');
      const [row] = await db
        .select({ id: logTable.id, createdAt: logTable.createdAt, payload: logTable.payload })
        .from(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.instanceStageItemId, params.instanceStageItemId),
            eq(logTable.actionType, 'done'),
            sql`coalesce(${logTable.payload}->>'source', '') = 'simple_item_complete'`,
          ),
        )
        .orderBy(desc(logTable.createdAt), desc(logTable.id))
        .limit(1);
      return row ? { id: row.id, createdAt: row.createdAt, payload: row.payload ?? null } : null;
    },

    async getLatestSimpleDonePayload(params) {
      const db = getDrizzle();
      const [row] = await db
        .select({ id: logTable.id, createdAt: logTable.createdAt, payload: logTable.payload })
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
      return row ? { id: row.id, createdAt: row.createdAt, payload: row.payload ?? null } : null;
    },

    async updateSimpleDonePayload(params) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const metrics = JSON.stringify(params.metrics);
        const args = [
          params.completionId,
          params.instanceId,
          params.instanceStageItemId,
          metrics,
        ] as const;
        const result = await runWebappNamedRoot<{
          completion: { id: string; created_at: string; payload: Record<string, unknown> | null };
        }>(
          getWebappSqlDb(),
          'app.enrich_current_patient_program_completion(uuid,uuid,uuid,text)',
          args,
          sql`SELECT app.enrich_current_patient_program_completion(
            ${params.completionId}::uuid,
            ${params.instanceId}::uuid,
            ${params.instanceStageItemId}::uuid,
            ${metrics}::text
          ) AS completion`,
        );
        const row = result.rows[0]?.completion;
        return row ? { id: row.id, createdAt: row.created_at, payload: row.payload } : null;
      }
      return runDrizzleMutationTransaction(async (tx) => {
        const [row] = await tx
          .update(logTable)
          .set({
            payload: sql`coalesce(${logTable.payload}, '{}'::jsonb) || ${JSON.stringify(params.metrics)}::jsonb`,
          })
          .where(
            and(
              eq(logTable.id, params.completionId),
              eq(logTable.instanceId, params.instanceId),
              eq(logTable.patientUserId, params.patientUserId),
              eq(logTable.instanceStageItemId, params.instanceStageItemId),
              eq(logTable.actionType, 'done'),
              sql`coalesce(${logTable.payload}->>'source', '') = 'simple_item_complete'`,
            ),
          )
          .returning({ id: logTable.id, createdAt: logTable.createdAt, payload: logTable.payload });
        return row
          ? { id: row.id, createdAt: row.createdAt, payload: row.payload ?? null }
          : null;
      });
    },

    async deleteSimpleDoneInWindow(params) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await deleteCurrentPatientActionsInWindow({ ...params, includeSpecial: false });
        return;
      }
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
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await deleteCurrentPatientActionsInWindow({ ...params, includeSpecial: true });
        return;
      }
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
