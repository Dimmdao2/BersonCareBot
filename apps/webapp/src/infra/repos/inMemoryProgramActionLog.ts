import { DateTime } from "luxon";
import type { ProgramActionLogPort } from "@/modules/treatment-program/ports";
import type { ProgramActionLogInsert, ProgramActionLogListRow, ProgramActionType } from "@/modules/treatment-program/types";
import { PROGRAM_ACTION_TYPES } from "@/modules/treatment-program/types";
import { programActionDoneActivityKey } from "@/modules/treatment-program/programActionActivityKey";

type Row = ProgramActionLogInsert & { id: string; createdAt: string };

function isoNow(): string {
  return new Date().toISOString();
}

/** Строки, которые нельзя снимать через «простое» снятие чек-листа за день. */
function isSimpleDonePayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (payload == null) return true;
  const src = payload.source;
  if (src == null) return true;
  if (src === "test_submitted" || src === "lfk_exercise_done") return false;
  return true;
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

    async countDoneByItemInWindow(params) {
      const out: Record<string, number> = {};
      for (const r of rows) {
        if (
          r.instanceId === params.instanceId &&
          r.patientUserId === params.patientUserId &&
          r.actionType === "done" &&
          r.createdAt >= params.windowStartIso &&
          r.createdAt < params.windowEndIso
        ) {
          out[r.instanceStageItemId] = (out[r.instanceStageItemId] ?? 0) + 1;
        }
      }
      return out;
    },

    async countDoneByActivityKeyInWindow(params) {
      const out: Record<string, number> = {};
      for (const r of rows) {
        if (
          r.instanceId === params.instanceId &&
          r.patientUserId === params.patientUserId &&
          r.actionType === "done" &&
          r.createdAt >= params.windowStartIso &&
          r.createdAt < params.windowEndIso
        ) {
          const key = programActionDoneActivityKey(
            r.instanceStageItemId,
            r.payload as Record<string, unknown> | null,
          );
          out[key] = (out[key] ?? 0) + 1;
        }
      }
      return out;
    },

    async lastDoneAtIsoByItemForInstance(params) {
      const out: Record<string, string> = {};
      for (const r of rows) {
        if (
          r.instanceId !== params.instanceId ||
          r.patientUserId !== params.patientUserId ||
          r.actionType !== "done"
        ) {
          continue;
        }
        const prev = out[r.instanceStageItemId];
        if (!prev || r.createdAt > prev) out[r.instanceStageItemId] = r.createdAt;
      }
      return out;
    },

    async lastDoneAtIsoByActivityKeyForInstance(params) {
      const out: Record<string, string> = {};
      for (const r of rows) {
        if (
          r.instanceId !== params.instanceId ||
          r.patientUserId !== params.patientUserId ||
          r.actionType !== "done"
        ) {
          continue;
        }
        const key = programActionDoneActivityKey(
          r.instanceStageItemId,
          r.payload as Record<string, unknown> | null,
        );
        const prev = out[key];
        if (!prev || r.createdAt > prev) out[key] = r.createdAt;
      }
      return out;
    },

    async countCompletionEventsByItemForInstance(params) {
      const byItem: Record<string, Set<string>> = {};
      for (const r of rows) {
        if (
          r.instanceId !== params.instanceId ||
          r.patientUserId !== params.patientUserId ||
          r.actionType !== "done"
        ) {
          continue;
        }
        const dedupeKey = r.sessionId ?? r.id;
        const itemId = r.instanceStageItemId;
        if (!byItem[itemId]) byItem[itemId] = new Set();
        byItem[itemId]!.add(dedupeKey);
      }
      const out: Record<string, number> = {};
      for (const [itemId, set] of Object.entries(byItem)) {
        out[itemId] = set.size;
      }
      return out;
    },

    async countDistinctLocalCalendarDaysWithDoneInWindow(params) {
      const iana = params.displayIana;
      const days = new Set<string>();
      for (const r of rows) {
        if (
          r.instanceId !== params.instanceId ||
          r.patientUserId !== params.patientUserId ||
          r.actionType !== "done" ||
          r.createdAt < params.windowStartUtcIso ||
          r.createdAt >= params.windowEndUtcExclusiveIso
        ) {
          continue;
        }
        const d = DateTime.fromISO(r.createdAt, { zone: "utc" }).setZone(iana);
        if (!d.isValid) continue;
        const isoDate = d.toISODate();
        if (isoDate) days.add(isoDate);
      }
      return days.size;
    },

    async listDistinctLocalDoneDateKeysInWindowForPatient(params) {
      const iana = params.displayIana;
      const days = new Set<string>();
      for (const r of rows) {
        if (
          r.patientUserId !== params.patientUserId ||
          r.actionType !== "done" ||
          r.createdAt < params.windowStartUtcIso ||
          r.createdAt >= params.windowEndUtcExclusiveIso
        ) {
          continue;
        }
        const d = DateTime.fromISO(r.createdAt, { zone: "utc" }).setZone(iana);
        if (!d.isValid) continue;
        const isoDate = d.toISODate();
        if (isoDate) days.add(isoDate);
      }
      return [...days];
    },

    async listForInstance(params) {
      const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
      const filtered = rows.filter((r) => r.instanceId === params.instanceId);
      filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      const out: ProgramActionLogListRow[] = [];
      for (const r of filtered.slice(0, limit)) {
        if (!PROGRAM_ACTION_TYPES.includes(r.actionType as ProgramActionType)) continue;
        out.push({
          id: r.id,
          instanceId: r.instanceId,
          instanceStageItemId: r.instanceStageItemId,
          patientUserId: r.patientUserId,
          sessionId: r.sessionId ?? null,
          actionType: r.actionType as ProgramActionType,
          payload: r.payload ?? null,
          note: r.note ?? null,
          createdAt: r.createdAt,
        });
      }
      return out;
    },
  };
}
