import { and, count, desc, eq, gte, lt, max, or, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { programActionLog as logTable } from "../../../db/schema/programActionLog";
import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";
import type { ProgramActionLogInsert, ProgramActionLogListRow, ProgramActionType } from "@/modules/treatment-program/types";
import { PROGRAM_ACTION_TYPES } from "@/modules/treatment-program/types";
import { programActionDoneActivityKey } from "@/modules/treatment-program/programActionActivityKey";

export function createPgProgramActionLogPort(): ProgramActionLogPort {
  return {
    async insertAction(input: ProgramActionLogInsert) {
      const db = getDrizzle();
      const [row] = await db
        .insert(logTable)
        .values({
          instanceId: input.instanceId,
          instanceStageItemId: input.instanceStageItemId,
          patientUserId: input.patientUserId,
          sessionId: input.sessionId ?? null,
          actionType: input.actionType,
          payload: input.payload ?? null,
          note: input.note ?? null,
        })
        .returning({ id: logTable.id, createdAt: logTable.createdAt });
      if (!row) throw new Error("insert program_action_log failed");
      return { id: row.id, createdAt: row.createdAt };
    },

    async deleteSimpleDoneInWindow(params) {
      const db = getDrizzle();
      await db
        .delete(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.instanceStageItemId, params.instanceStageItemId),
            eq(logTable.actionType, "done"),
            gte(logTable.createdAt, params.windowStartIso),
            lt(logTable.createdAt, params.windowEndIso),
            or(isNull(logTable.payload), sql`(${logTable.payload}->>'source') is null`),
          ),
        );
    },

    async deleteAllDoneInWindow(params) {
      const db = getDrizzle();
      await db
        .delete(logTable)
        .where(
          and(
            eq(logTable.instanceId, params.instanceId),
            eq(logTable.patientUserId, params.patientUserId),
            eq(logTable.instanceStageItemId, params.instanceStageItemId),
            eq(logTable.actionType, "done"),
            gte(logTable.createdAt, params.windowStartIso),
            lt(logTable.createdAt, params.windowEndIso),
          ),
        );
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
            eq(logTable.actionType, "done"),
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
            eq(logTable.actionType, "done"),
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
            eq(logTable.actionType, "done"),
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
            eq(logTable.actionType, "done"),
          ),
        )
        .groupBy(logTable.instanceStageItemId);
      const out: Record<string, string> = {};
      for (const r of rows) {
        if (r.lastAt != null) out[r.itemId] = String(r.lastAt);
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
            eq(logTable.actionType, "done"),
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
  };
}
