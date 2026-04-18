import type {
  TreatmentProgramEventsPort,
  TreatmentProgramInstancePort,
  TreatmentProgramTestAttemptsPort,
} from "@/modules/treatment-program/ports";
import type {
  AddTreatmentProgramInstanceStageInput,
  AddTreatmentProgramInstanceStageItemInput,
  CreateTreatmentProgramInstanceTreeInput,
  ReplaceTreatmentProgramInstanceStageItemInput,
  TreatmentProgramEventRow,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramInstanceStageStatus,
  TreatmentProgramInstanceStatus,
  TreatmentProgramInstanceSummary,
  TreatmentProgramItemType,
  TreatmentProgramTestAttemptRow,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
  NormalizedTestDecision,
} from "@/modules/treatment-program/types";
import { effectiveInstanceStageItemComment } from "@/modules/treatment-program/types";

function sameIdSet(ordered: string[], expected: Set<string>): boolean {
  if (ordered.length !== expected.size) return false;
  const seen = new Set<string>();
  for (const id of ordered) {
    if (!expected.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

function isoNow(): string {
  return new Date().toISOString();
}

type InstRow = TreatmentProgramInstanceSummary;
type StageRow = TreatmentProgramInstanceStageRow;
type ItemRow = TreatmentProgramInstanceStageItemRow;

export type InMemoryTreatmentProgramPersistence = {
  instancePort: TreatmentProgramInstancePort;
  testAttemptsPort: TreatmentProgramTestAttemptsPort;
  eventsPort: TreatmentProgramEventsPort;
};

export function createInMemoryTreatmentProgramPersistence(): InMemoryTreatmentProgramPersistence {
  const instances = new Map<string, InstRow>();
  const stages = new Map<string, StageRow>();
  const items = new Map<string, ItemRow>();
  const attempts = new Map<string, TreatmentProgramTestAttemptRow>();
  const results = new Map<string, TreatmentProgramTestResultRow>();
  const programEvents: TreatmentProgramEventRow[] = [];

  function touchInstance(instanceId: string): void {
    const inst = instances.get(instanceId);
    if (!inst) return;
    instances.set(instanceId, { ...inst, updatedAt: isoNow() });
  }

  function mapItemView(row: ItemRow): ItemRow & { effectiveComment: string | null } {
    return {
      ...row,
      effectiveComment: effectiveInstanceStageItemComment(row),
    };
  }

  function buildDetail(instanceId: string): TreatmentProgramInstanceDetail | null {
    const inst = instances.get(instanceId);
    if (!inst) return null;
    const stageList = [...stages.values()]
      .filter((s) => s.instanceId === instanceId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const outStages = stageList.map((st) => {
      const itemList = [...items.values()]
        .filter((it) => it.stageId === st.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return {
        ...st,
        items: itemList.map((row) => mapItemView({ ...row })),
      };
    });
    return { ...inst, stages: outStages };
  }

  function unlockNextLockedStage(instanceId: string, afterSortOrder: number): void {
    const candidates = [...stages.values()]
      .filter(
        (s) =>
          s.instanceId === instanceId && s.status === "locked" && s.sortOrder > afterSortOrder,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const next = candidates[0];
    if (!next) return;
    stages.set(next.id, { ...next, status: "available" });
  }

  const instancePort: TreatmentProgramInstancePort = {
    async createInstanceTree(input: CreateTreatmentProgramInstanceTreeInput): Promise<TreatmentProgramInstanceDetail> {
      const id = crypto.randomUUID();
      const now = isoNow();
      const inst: InstRow = {
        id,
        patientUserId: input.patientUserId,
        templateId: input.templateId,
        assignedBy: input.assignedBy,
        title: input.title,
        status: "active" as TreatmentProgramInstanceStatus,
        createdAt: now,
        updatedAt: now,
      };
      instances.set(id, inst);

      for (const st of input.stages) {
        const sid = crypto.randomUUID();
        const stageRow: StageRow = {
          id: sid,
          instanceId: id,
          sourceStageId: st.sourceStageId,
          title: st.title,
          description: st.description,
          sortOrder: st.sortOrder,
          localComment: null,
          skipReason: null,
          status: st.status,
        };
        stages.set(sid, stageRow);
        for (const it of st.items) {
          const iid = crypto.randomUUID();
          const itemRow: ItemRow = {
            id: iid,
            stageId: sid,
            itemType: it.itemType as TreatmentProgramItemType,
            itemRefId: it.itemRefId,
            sortOrder: it.sortOrder,
            comment: it.comment,
            localComment: null,
            settings: it.settings,
            snapshot: it.snapshot,
            completedAt: null,
          };
          items.set(iid, itemRow);
        }
      }

      return buildDetail(id)!;
    },

    async getInstanceById(instanceId: string) {
      return buildDetail(instanceId);
    },

    async getInstanceForPatient(patientUserId: string, instanceId: string) {
      const inst = instances.get(instanceId);
      if (!inst || inst.patientUserId !== patientUserId) return null;
      return buildDetail(instanceId);
    },

    async listInstancesForPatient(patientUserId: string) {
      return [...instances.values()]
        .filter((i) => i.patientUserId === patientUserId)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    async updateStageItemLocalComment(instanceId: string, stageItemId: string, localComment: string | null) {
      const inst = instances.get(instanceId);
      if (!inst) return null;
      const row = items.get(stageItemId);
      if (!row) return null;
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const nextLocal = localComment === null ? null : localComment.trim() || null;
      const next: ItemRow = { ...row, localComment: nextLocal };
      items.set(stageItemId, next);
      touchInstance(instanceId);
      return next;
    },

    async updateInstanceMeta(instanceId: string, patch: { title?: string; status?: "active" | "completed" }) {
      const cur = instances.get(instanceId);
      if (!cur) return null;
      const next: InstRow = {
        ...cur,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: isoNow(),
      };
      instances.set(instanceId, next);
      return next;
    },

    async updateInstanceStage(
      instanceId: string,
      stageId: string,
      patch: { status: TreatmentProgramInstanceStageStatus; skipReason?: string | null },
    ) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const skipReason =
        patch.skipReason === undefined
          ? st.skipReason
          : patch.skipReason === null
            ? null
            : patch.skipReason.trim() || null;
      const next: StageRow = {
        ...st,
        status: patch.status,
        skipReason: patch.status === "skipped" ? skipReason : null,
      };
      stages.set(stageId, next);
      if (patch.status === "completed" || patch.status === "skipped") {
        unlockNextLockedStage(instanceId, st.sortOrder);
      }
      return next;
    },

    async setStageItemCompletedAt(instanceId: string, itemId: string, completedAt: string | null) {
      const inst = instances.get(instanceId);
      if (!inst) return null;
      const row = items.get(itemId);
      if (!row) return null;
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const next: ItemRow = { ...row, completedAt };
      items.set(itemId, next);
      touchInstance(instanceId);
      return next;
    },

    async addInstanceStage(instanceId: string, input: AddTreatmentProgramInstanceStageInput) {
      const inst = instances.get(instanceId);
      if (!inst) return null;
      const sid = crypto.randomUUID();
      const stageRow: StageRow = {
        id: sid,
        instanceId,
        sourceStageId: input.sourceStageId ?? null,
        title: input.title,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        localComment: null,
        skipReason: null,
        status: input.status,
      };
      stages.set(sid, stageRow);
      touchInstance(instanceId);
      return stageRow;
    },

    async removeInstanceStage(instanceId: string, stageId: string) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return false;
      for (const [iid, it] of items) {
        if (it.stageId === stageId) items.delete(iid);
      }
      stages.delete(stageId);
      touchInstance(instanceId);
      return true;
    },

    async addInstanceStageItem(
      instanceId: string,
      stageId: string,
      input: AddTreatmentProgramInstanceStageItemInput,
    ) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const iid = crypto.randomUUID();
      const itemRow: ItemRow = {
        id: iid,
        stageId,
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder: input.sortOrder,
        comment: input.comment,
        localComment: null,
        settings: input.settings,
        snapshot: input.snapshot,
        completedAt: null,
      };
      items.set(iid, itemRow);
      touchInstance(instanceId);
      return itemRow;
    },

    async removeInstanceStageItem(instanceId: string, itemId: string) {
      const row = items.get(itemId);
      if (!row) return false;
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return false;
      items.delete(itemId);
      touchInstance(instanceId);
      return true;
    },

    async replaceInstanceStageItem(
      instanceId: string,
      itemId: string,
      input: ReplaceTreatmentProgramInstanceStageItemInput,
    ) {
      const row = items.get(itemId);
      if (!row) return null;
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const next: ItemRow = {
        ...row,
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder: input.sortOrder ?? row.sortOrder,
        comment: input.comment === undefined ? row.comment : input.comment,
        settings: input.settings === undefined ? row.settings : input.settings,
        snapshot: input.snapshot,
        completedAt: null,
      };
      items.set(itemId, next);
      touchInstance(instanceId);
      return next;
    },

    async reorderInstanceStages(instanceId: string, orderedStageIds: string[]) {
      const inst = instances.get(instanceId);
      if (!inst) return false;
      const stageList = [...stages.values()].filter((s) => s.instanceId === instanceId);
      const idSet = new Set(stageList.map((s) => s.id));
      if (!sameIdSet(orderedStageIds, idSet)) return false;
      for (let i = 0; i < orderedStageIds.length; i++) {
        const sid = orderedStageIds[i]!;
        const s = stages.get(sid);
        if (!s) return false;
        stages.set(sid, { ...s, sortOrder: i });
      }
      touchInstance(instanceId);
      return true;
    },

    async reorderInstanceStageItems(instanceId: string, stageId: string, orderedItemIds: string[]) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return false;
      const itemList = [...items.values()].filter((it) => it.stageId === stageId);
      const idSet = new Set(itemList.map((i) => i.id));
      if (!sameIdSet(orderedItemIds, idSet)) return false;
      for (let i = 0; i < orderedItemIds.length; i++) {
        const iid = orderedItemIds[i]!;
        const row = items.get(iid);
        if (!row) return false;
        items.set(iid, { ...row, sortOrder: i });
      }
      touchInstance(instanceId);
      return true;
    },
  };

  function findOpenAttemptImpl(stageItemId: string, patientUserId: string) {
    for (const a of attempts.values()) {
      if (
        a.instanceStageItemId === stageItemId &&
        a.patientUserId === patientUserId &&
        a.completedAt === null
      ) {
        return { ...a };
      }
    }
    return null;
  }

  const testAttemptsPort: TreatmentProgramTestAttemptsPort = {
    async findOpenAttempt(stageItemId: string, patientUserId: string) {
      return findOpenAttemptImpl(stageItemId, patientUserId);
    },

    async createAttempt(input: { stageItemId: string; patientUserId: string }) {
      const open = findOpenAttemptImpl(input.stageItemId, input.patientUserId);
      if (open) return open;
      const id = crypto.randomUUID();
      const row: TreatmentProgramTestAttemptRow = {
        id,
        instanceStageItemId: input.stageItemId,
        patientUserId: input.patientUserId,
        startedAt: isoNow(),
        completedAt: null,
      };
      attempts.set(id, row);
      return { ...row };
    },

    async completeAttempt(attemptId: string) {
      const a = attempts.get(attemptId);
      if (!a) return;
      attempts.set(attemptId, { ...a, completedAt: isoNow() });
    },

    async upsertResult(input: {
      attemptId: string;
      testId: string;
      rawValue: Record<string, unknown>;
      normalizedDecision: NormalizedTestDecision;
      decidedBy: string | null;
    }) {
      const existingId = [...results.entries()].find(
        ([, r]) => r.attemptId === input.attemptId && r.testId === input.testId,
      )?.[0];
      const now = isoNow();
      if (existingId) {
        const prev = results.get(existingId)!;
        const next: TreatmentProgramTestResultRow = {
          ...prev,
          rawValue: input.rawValue,
          normalizedDecision: input.normalizedDecision,
          decidedBy: input.decidedBy,
        };
        results.set(existingId, next);
        return { ...next };
      }
      const id = crypto.randomUUID();
      const row: TreatmentProgramTestResultRow = {
        id,
        attemptId: input.attemptId,
        testId: input.testId,
        rawValue: input.rawValue,
        normalizedDecision: input.normalizedDecision,
        decidedBy: input.decidedBy,
        createdAt: now,
      };
      results.set(id, row);
      return { ...row };
    },

    async listResultsForAttempt(attemptId: string) {
      return [...results.values()].filter((r) => r.attemptId === attemptId).map((r) => ({ ...r }));
    },

    async listResultDetailsForInstance(instanceId: string): Promise<TreatmentProgramTestResultDetailRow[]> {
      const out: TreatmentProgramTestResultDetailRow[] = [];
      for (const r of results.values()) {
        const att = attempts.get(r.attemptId);
        if (!att) continue;
        const item = items.get(att.instanceStageItemId);
        if (!item) continue;
        const st = stages.get(item.stageId);
        if (!st || st.instanceId !== instanceId) continue;
        out.push({
          ...r,
          instanceStageItemId: att.instanceStageItemId,
          stageId: st.id,
          stageTitle: st.title,
          stageSortOrder: st.sortOrder,
          testTitle: null,
        });
      }
      return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    async overrideResultDecision(resultId: string, input: { normalizedDecision: NormalizedTestDecision; decidedBy: string }) {
      const row = results.get(resultId);
      if (!row) return null;
      const next = { ...row, normalizedDecision: input.normalizedDecision, decidedBy: input.decidedBy };
      results.set(resultId, next);
      return { ...next };
    },

    async hasAnyAttemptForStageItem(stageItemId: string) {
      return [...attempts.values()].some((a) => a.instanceStageItemId === stageItemId);
    },
  };

  const eventsPort: TreatmentProgramEventsPort = {
    async appendEvent(input) {
      const row: TreatmentProgramEventRow = {
        id: crypto.randomUUID(),
        instanceId: input.instanceId,
        actorId: input.actorId,
        eventType: input.eventType,
        targetType: input.targetType,
        targetId: input.targetId,
        payload: input.payload ?? {},
        reason: input.reason ?? null,
        createdAt: isoNow(),
      };
      programEvents.push(row);
      return row;
    },
    async listEventsForInstance(instanceId: string, limit = 200) {
      const cap = Math.min(Math.max(limit, 1), 500);
      const newestFirst = programEvents
        .filter((e) => e.instanceId === instanceId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return newestFirst.slice(0, cap).reverse();
    },
  };

  return { instancePort, testAttemptsPort, eventsPort };
}

export function createInMemoryTreatmentProgramInstancePort(): TreatmentProgramInstancePort {
  return createInMemoryTreatmentProgramPersistence().instancePort;
}
