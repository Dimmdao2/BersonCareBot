import type {
  TreatmentProgramEventsPort,
  TreatmentProgramInstancePort,
  TreatmentProgramTestAttemptsPort,
} from "@/modules/treatment-program/ports";
import type {
  AddTreatmentProgramInstanceStageInput,
  AddTreatmentProgramInstanceStageItemInput,
  AppendTreatmentProgramEventInput,
  CreateTreatmentProgramInstanceStageGroupInput,
  CreateTreatmentProgramInstanceTreeInput,
  ReplaceTreatmentProgramInstanceStageItemInput,
  TreatmentProgramInstanceStageGroup,
  UpdateTreatmentProgramInstanceStageGroupInput,
  UpdateTreatmentProgramInstanceStageMetadataInput,
  TreatmentProgramEventRow,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramInstanceStageStatus,
  TreatmentProgramInstanceStageItemStatus,
  TreatmentProgramInstanceStatus,
  TreatmentProgramInstanceSummary,
  TreatmentProgramItemType,
  TreatmentProgramTestAttemptRow,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
  NormalizedTestDecision,
  PendingProgramTestEvaluationRow,
} from "@/modules/treatment-program/types";
import { effectiveInstanceStageItemComment, TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES } from "@/modules/treatment-program/types";
import { withDefaultSystemGroupsIfNeededForTreeStage } from "@/modules/treatment-program/instance-tree-system-groups";

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
  const instGroups = new Map<string, TreatmentProgramInstanceStageGroup>();
  const attempts = new Map<string, TreatmentProgramTestAttemptRow>();
  const results = new Map<string, TreatmentProgramTestResultRow>();
  const programEvents: TreatmentProgramEventRow[] = [];

  function appendProgramEvent(input: AppendTreatmentProgramEventInput): TreatmentProgramEventRow {
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
  }

  function touchInstance(instanceId: string): void {
    const inst = instances.get(instanceId);
    if (!inst) return;
    instances.set(instanceId, { ...inst, updatedAt: isoNow() });
  }

  function nextGroupOrder(stageId: string): number {
    let m = -1;
    for (const g of instGroups.values()) {
      if (g.stageId === stageId) m = Math.max(m, g.sortOrder);
    }
    return m + 1;
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
      const groupList = [...instGroups.values()]
        .filter((g) => g.stageId === st.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      const itemList = [...items.values()]
        .filter((it) => it.stageId === st.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return {
        ...st,
        groups: groupList.map((g) => ({ ...g })),
        items: itemList.map((row) => mapItemView({ ...row })),
      };
    });
    return { ...inst, stages: outStages };
  }

  function unlockNextLockedStage(instanceId: string, afterSortOrder: number): void {
    const threshold = afterSortOrder === 0 ? 0 : afterSortOrder;
    const candidates = [...stages.values()]
      .filter(
        (s) =>
          s.instanceId === instanceId &&
          s.status === "locked" &&
          s.sortOrder > threshold,
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
        patientPlanLastOpenedAt: null,
      };
      instances.set(id, inst);

      for (const st of input.stages) {
        const stResolved = withDefaultSystemGroupsIfNeededForTreeStage(st);
        const sid = crypto.randomUUID();
        const stageRow: StageRow = {
          id: sid,
          instanceId: id,
          sourceStageId: stResolved.sourceStageId,
          title: stResolved.title,
          description: stResolved.description,
          sortOrder: stResolved.sortOrder,
          localComment: null,
          skipReason: null,
          status: stResolved.status,
          startedAt: stResolved.status === "in_progress" ? now : null,
          goals: stResolved.goals,
          objectives: stResolved.objectives,
          expectedDurationDays: stResolved.expectedDurationDays,
          expectedDurationText: stResolved.expectedDurationText,
        };
        stages.set(sid, stageRow);
        const INTERNAL_REC = "__tp_instance_sys_recommendations__";
        const INTERNAL_TESTS = "__tp_instance_sys_tests__";
        const rawGroups = [...(stResolved.groups ?? [])];
        const systemRec = rawGroups.find((g) => g.systemKind === "recommendations");
        const systemTests = rawGroups.find((g) => g.systemKind === "tests");
        const templateGroups = rawGroups
          .filter((g) => !g.systemKind)
          .sort(
            (a, b) =>
              a.sortOrder - b.sortOrder ||
              String(a.sourceGroupId ?? "").localeCompare(String(b.sourceGroupId ?? "")),
          );
        const sortedGroups = [...(systemRec ? [systemRec] : []), ...(systemTests ? [systemTests] : []), ...templateGroups];
        const tplToInst = new Map<string, string>();
        for (const g of sortedGroups) {
          const gid = crypto.randomUUID();
          const gr: TreatmentProgramInstanceStageGroup = {
            id: gid,
            stageId: sid,
            sourceGroupId: g.sourceGroupId,
            title: g.title,
            description: g.description,
            scheduleText: g.scheduleText,
            sortOrder: g.sortOrder,
            systemKind: g.systemKind ?? null,
          };
          instGroups.set(gid, gr);
          if (g.sourceGroupId) {
            tplToInst.set(g.sourceGroupId, gid);
          }
          if (g.systemKind === "recommendations") {
            tplToInst.set(INTERNAL_REC, gid);
          }
          if (g.systemKind === "tests") {
            tplToInst.set(INTERNAL_TESTS, gid);
          }
        }
        const sortedItems = [...stResolved.items].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.itemRefId.localeCompare(b.itemRefId),
        );
        for (const it of sortedItems) {
          const iid = crypto.randomUUID();
          let groupId: string | null = null;
          if (it.templateGroupId != null) {
            groupId = tplToInst.get(it.templateGroupId) ?? null;
          } else if (it.itemType === "recommendation") {
            groupId = tplToInst.get(INTERNAL_REC) ?? null;
          } else if (it.itemType === "test_set") {
            groupId = tplToInst.get(INTERNAL_TESTS) ?? null;
          } else {
            throw new Error(
              "Назначение: элемент без группы в шаблоне должен быть только рекомендацией или набором тестов",
            );
          }
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
            isActionable: it.isActionable ?? null,
            status: it.status ?? "active",
            groupId,
            createdAt: now,
            lastViewedAt: now,
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
      const nextSkip = patch.status === "skipped" ? skipReason : null;
      const nextStartedAt =
        patch.status === "in_progress" && !st.startedAt ? isoNow() : st.startedAt;
      const next: StageRow = {
        ...st,
        status: patch.status,
        skipReason: nextSkip,
        startedAt: nextStartedAt,
      };
      stages.set(stageId, next);
      if (patch.status === "completed" || patch.status === "skipped") {
        unlockNextLockedStage(instanceId, st.sortOrder);
      }
      return next;
    },

    async updateInstanceStageMetadata(
      instanceId: string,
      stageId: string,
      patch: UpdateTreatmentProgramInstanceStageMetadataInput,
    ) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return null;
      if (patch.title !== undefined) {
        const t = patch.title.trim();
        if (!t) return null;
      }
      const next: StageRow = {
        ...st,
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.goals !== undefined ? { goals: patch.goals } : {}),
        ...(patch.objectives !== undefined ? { objectives: patch.objectives } : {}),
        ...(patch.expectedDurationDays !== undefined
          ? { expectedDurationDays: patch.expectedDurationDays }
          : {}),
        ...(patch.expectedDurationText !== undefined
          ? { expectedDurationText: patch.expectedDurationText }
          : {}),
      };
      stages.set(stageId, next);
      touchInstance(instanceId);
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
        startedAt: input.status === "in_progress" ? isoNow() : null,
        goals: input.goals ?? null,
        objectives: input.objectives ?? null,
        expectedDurationDays: input.expectedDurationDays ?? null,
        expectedDurationText: input.expectedDurationText ?? null,
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
      for (const [gid, g] of instGroups) {
        if (g.stageId === stageId) instGroups.delete(gid);
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
      if (input.groupId) {
        const gr = instGroups.get(input.groupId);
        if (!gr || gr.stageId !== stageId) return null;
      }
      const iid = crypto.randomUUID();
      const t = isoNow();
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
        isActionable: input.isActionable ?? null,
        status: input.status ?? "active",
        groupId: input.groupId ?? null,
        createdAt: t,
        lastViewedAt: null,
      };
      items.set(iid, itemRow);
      touchInstance(instanceId);
      return itemRow;
    },

    async patchInstanceStageItem(
      instanceId: string,
      itemId: string,
      patch: {
        status?: TreatmentProgramInstanceStageItemStatus;
        isActionable?: boolean | null;
        groupId?: string | null;
      },
    ) {
      const inst = instances.get(instanceId);
      if (!inst) return null;
      const row = items.get(itemId);
      if (!row) return null;
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return null;
      if (patch.groupId !== undefined && patch.groupId !== null) {
        const gr = instGroups.get(patch.groupId);
        if (!gr || gr.stageId !== row.stageId) return null;
      }
      const next: ItemRow = {
        ...row,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.isActionable !== undefined ? { isActionable: patch.isActionable } : {}),
        ...(patch.groupId !== undefined ? { groupId: patch.groupId } : {}),
      };
      items.set(itemId, next);
      touchInstance(instanceId);
      return next;
    },

    async patchInstanceStageItemWithEvent(
      instanceId: string,
      itemId: string,
      patch: {
        status?: TreatmentProgramInstanceStageItemStatus;
        isActionable?: boolean | null;
        groupId?: string | null;
      },
      eventInput: AppendTreatmentProgramEventInput,
    ) {
      if (eventInput.instanceId !== instanceId) {
        throw new Error("patchInstanceStageItemWithEvent: event instanceId mismatch");
      }
      if (patch.status === undefined && patch.isActionable === undefined && patch.groupId === undefined) {
        return null;
      }
      const inst = instances.get(instanceId);
      if (!inst) return null;
      const row = items.get(itemId);
      if (!row) return null;
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return null;
      if (patch.groupId !== undefined && patch.groupId !== null) {
        const gr = instGroups.get(patch.groupId);
        if (!gr || gr.stageId !== row.stageId) return null;
      }
      const next: ItemRow = {
        ...row,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.isActionable !== undefined ? { isActionable: patch.isActionable } : {}),
        ...(patch.groupId !== undefined ? { groupId: patch.groupId } : {}),
      };
      items.set(itemId, next);
      touchInstance(instanceId);
      appendProgramEvent(eventInput);
      return next;
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
      const t = isoNow();
      const next: ItemRow = {
        ...row,
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder: input.sortOrder ?? row.sortOrder,
        comment: input.comment === undefined ? row.comment : input.comment,
        settings: input.settings === undefined ? row.settings : input.settings,
        snapshot: input.snapshot,
        completedAt: null,
        status: "active",
        isActionable: null,
        groupId: null,
        createdAt: t,
        lastViewedAt: null,
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

    async createInstanceStageGroup(
      instanceId: string,
      stageId: string,
      input: CreateTreatmentProgramInstanceStageGroupInput,
    ) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const title = input.title?.trim() ?? "";
      if (!title) return null;
      const gid = crypto.randomUUID();
      const gr: TreatmentProgramInstanceStageGroup = {
        id: gid,
        stageId,
        sourceGroupId: null,
        title,
        description: input.description?.trim() ?? null,
        scheduleText: input.scheduleText?.trim() ?? null,
        sortOrder: input.sortOrder ?? nextGroupOrder(stageId),
        systemKind: null,
      };
      instGroups.set(gid, gr);
      touchInstance(instanceId);
      return { ...gr };
    },

    async updateInstanceStageGroup(
      instanceId: string,
      groupId: string,
      input: UpdateTreatmentProgramInstanceStageGroupInput,
    ) {
      const cur = instGroups.get(groupId);
      if (!cur) return null;
      const st = stages.get(cur.stageId);
      if (!st || st.instanceId !== instanceId) return null;
      const isSystem = cur.systemKind === "recommendations" || cur.systemKind === "tests";
      let title = cur.title;
      if (input.title !== undefined && !isSystem) {
        const t = input.title.trim();
        if (!t) return null;
        title = t;
      }
      const next: TreatmentProgramInstanceStageGroup = {
        ...cur,
        title,
        ...(input.description !== undefined && !isSystem ? { description: input.description?.trim() ?? null } : {}),
        ...(input.scheduleText !== undefined && !isSystem ? { scheduleText: input.scheduleText?.trim() ?? null } : {}),
        ...(input.sortOrder !== undefined && !isSystem ? { sortOrder: input.sortOrder } : {}),
      };
      instGroups.set(groupId, next);
      touchInstance(instanceId);
      return { ...next };
    },

    async deleteInstanceStageGroup(instanceId: string, groupId: string) {
      const cur = instGroups.get(groupId);
      if (!cur) return false;
      if (cur.systemKind === "recommendations" || cur.systemKind === "tests") return false;
      const st = stages.get(cur.stageId);
      if (!st || st.instanceId !== instanceId) return false;
      for (const [iid, it] of items) {
        if (it.groupId === groupId) items.set(iid, { ...it, groupId: null });
      }
      instGroups.delete(groupId);
      touchInstance(instanceId);
      return true;
    },

    async reorderInstanceStageGroups(
      instanceId: string,
      stageId: string,
      orderedGroupIds: string[],
    ) {
      const st = stages.get(stageId);
      if (!st || st.instanceId !== instanceId) return false;
      const groupList = [...instGroups.values()].filter((g) => g.stageId === stageId);
      const userIds = groupList
        .filter((g) => g.systemKind !== "recommendations" && g.systemKind !== "tests")
        .map((g) => g.id);
      const idSet = new Set(userIds);
      if (!sameIdSet(orderedGroupIds, idSet)) return false;
      for (let i = 0; i < orderedGroupIds.length; i++) {
        const gid = orderedGroupIds[i]!;
        const row = instGroups.get(gid);
        if (!row) return false;
        instGroups.set(gid, { ...row, sortOrder: i });
      }
      touchInstance(instanceId);
      return true;
    },

    async touchPatientPlanLastOpenedAt(patientUserId: string, instanceId: string): Promise<void> {
      const inst = instances.get(instanceId);
      if (!inst || inst.patientUserId !== patientUserId) return;
      const t = isoNow();
      instances.set(instanceId, { ...inst, patientPlanLastOpenedAt: t, updatedAt: t });
    },

    async markStageItemViewedIfNever(
      patientUserId: string,
      instanceId: string,
      stageItemId: string,
    ): Promise<{ updated: boolean }> {
      const inst = instances.get(instanceId);
      if (!inst || inst.patientUserId !== patientUserId) return { updated: false };
      const row = items.get(stageItemId);
      if (!row || row.lastViewedAt != null) return { updated: false };
      const st = stages.get(row.stageId);
      if (!st || st.instanceId !== instanceId) return { updated: false };
      const t = isoNow();
      items.set(stageItemId, { ...row, lastViewedAt: t });
      return { updated: true };
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

    async listPendingEvaluationResultsForPatient(patientUserId: string): Promise<PendingProgramTestEvaluationRow[]> {
      const out: PendingProgramTestEvaluationRow[] = [];
      for (const r of results.values()) {
        if (r.decidedBy) continue;
        const att = attempts.get(r.attemptId);
        if (!att || att.patientUserId !== patientUserId) continue;
        const item = items.get(att.instanceStageItemId);
        if (!item) continue;
        const st = stages.get(item.stageId);
        if (!st) continue;
        const inst = instances.get(st.instanceId);
        if (!inst || inst.patientUserId !== patientUserId || inst.status !== "active") continue;
        out.push({
          resultId: r.id,
          testId: r.testId,
          testTitle: null,
          createdAt: r.createdAt,
          instanceId: inst.id,
          instanceTitle: inst.title,
          stageTitle: st.title,
          stageItemId: item.id,
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
      return appendProgramEvent(input);
    },
    async listEventsForInstance(instanceId: string, limit = 200) {
      const cap = Math.min(Math.max(limit, 1), 500);
      const newestFirst = programEvents
        .filter((e) => e.instanceId === instanceId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return newestFirst.slice(0, cap).reverse();
    },

    async getMaxPlanMutationEventCreatedAt(instanceId: string): Promise<string | null> {
      const allowed = new Set<string>(TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES);
      let maxAt: string | null = null;
      for (const e of programEvents) {
        if (e.instanceId !== instanceId) continue;
        if (!allowed.has(e.eventType)) continue;
        if (!maxAt || e.createdAt > maxAt) maxAt = e.createdAt;
      }
      return maxAt;
    },
  };

  return { instancePort, testAttemptsPort, eventsPort };
}

export function createInMemoryTreatmentProgramInstancePort(): TreatmentProgramInstancePort {
  return createInMemoryTreatmentProgramPersistence().instancePort;
}
