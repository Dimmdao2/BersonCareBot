import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";
import type { ProgramActionLogInsert } from "@/modules/treatment-program/types";

type Row = ProgramActionLogInsert & { id: string; createdAt: string };

function isoNow(): string {
  return new Date().toISOString();
}

function isSimpleDonePayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (payload == null) return true;
  return payload.source == null;
}

export function createInMemoryProgramActionLogPort(): ProgramActionLogPort {
  const rows: Row[] = [];

  return {
    async insertAction(input: ProgramActionLogInsert) {
      const id = crypto.randomUUID();
      const createdAt = isoNow();
      rows.push({
        ...input,
        sessionId: input.sessionId ?? null,
        payload: input.payload ?? null,
        note: input.note ?? null,
        id,
        createdAt,
      });
      return { id, createdAt };
    },

    async deleteSimpleDoneInWindow(params) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]!;
        if (
          r.instanceId === params.instanceId &&
          r.patientUserId === params.patientUserId &&
          r.instanceStageItemId === params.instanceStageItemId &&
          r.actionType === "done" &&
          r.createdAt >= params.windowStartIso &&
          r.createdAt < params.windowEndIso &&
          isSimpleDonePayload(r.payload ?? null)
        ) {
          rows.splice(i, 1);
        }
      }
    },

    async deleteAllDoneInWindow(params) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]!;
        if (
          r.instanceId === params.instanceId &&
          r.patientUserId === params.patientUserId &&
          r.instanceStageItemId === params.instanceStageItemId &&
          r.actionType === "done" &&
          r.createdAt >= params.windowStartIso &&
          r.createdAt < params.windowEndIso
        ) {
          rows.splice(i, 1);
        }
      }
    },

    async listDoneItemIdsInWindow(params) {
      const set = new Set<string>();
      for (const r of rows) {
        if (
          r.instanceId === params.instanceId &&
          r.patientUserId === params.patientUserId &&
          r.actionType === "done" &&
          r.createdAt >= params.windowStartIso &&
          r.createdAt < params.windowEndIso
        ) {
          set.add(r.instanceStageItemId);
        }
      }
      return [...set];
    },
  };
}
