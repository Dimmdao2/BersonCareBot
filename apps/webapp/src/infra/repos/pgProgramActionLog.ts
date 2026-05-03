import { and, eq, gte, lt, or, isNull, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { programActionLog as logTable } from "../../../db/schema/programActionLog";
import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";
import type { ProgramActionLogInsert } from "@/modules/treatment-program/types";

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
  };
}
