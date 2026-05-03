import type { TreatmentProgramPort } from "@/modules/treatment-program/ports";
import type {
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  CreateTreatmentProgramTemplateStageGroupInput,
  TreatmentProgramStage,
  TreatmentProgramStageItem,
  TreatmentProgramTemplate,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateFilter,
  TreatmentProgramTemplateStageGroup,
  TreatmentProgramTemplateStatus,
  TreatmentProgramTemplateUsageSnapshot,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateInput,
  UpdateTreatmentProgramTemplateStageGroupInput,
} from "@/modules/treatment-program/types";
import { EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT } from "@/modules/treatment-program/types";

const templateUsageSnapshots = new Map<string, TreatmentProgramTemplateUsageSnapshot>();

export function seedInMemoryTreatmentProgramTemplateUsageSnapshot(
  templateId: string,
  snapshot: TreatmentProgramTemplateUsageSnapshot,
): void {
  templateUsageSnapshots.set(templateId, snapshot);
}

export function clearInMemoryTreatmentProgramTemplateUsageSnapshots(): void {
  templateUsageSnapshots.clear();
}

function isoNow(): string {
  return new Date().toISOString();
}

function sameIdSet(ordered: string[], expected: Set<string>): boolean {
  if (ordered.length !== expected.size) return false;
  const seen = new Set<string>();
  for (const id of ordered) {
    if (!expected.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

export function createInMemoryTreatmentProgramPort(seed?: {
  templates?: TreatmentProgramTemplate[];
  stages?: TreatmentProgramStage[];
  items?: TreatmentProgramStageItem[];
  groups?: TreatmentProgramTemplateStageGroup[];
}): TreatmentProgramPort {
  const templates = new Map<string, TreatmentProgramTemplate>();
  const stages = new Map<string, TreatmentProgramStage>();
  const items = new Map<string, TreatmentProgramStageItem>();
  const tplGroups = new Map<string, TreatmentProgramTemplateStageGroup>();

  for (const t of seed?.templates ?? []) templates.set(t.id, { ...t });
  for (const s of seed?.stages ?? []) stages.set(s.id, { ...s });
  for (const i of seed?.items ?? []) items.set(i.id, { ...i });
  for (const g of seed?.groups ?? []) tplGroups.set(g.id, { ...g });

  function nextTemplateSort(): number {
    return templates.size;
  }

  function nextStageOrder(templateId: string): number {
    let m = -1;
    for (const s of stages.values()) {
      if (s.templateId === templateId) m = Math.max(m, s.sortOrder);
    }
    return m + 1;
  }

  function nextItemOrder(stageId: string): number {
    let m = -1;
    for (const it of items.values()) {
      if (it.stageId === stageId) m = Math.max(m, it.sortOrder);
    }
    return m + 1;
  }

  function nextTplGroupOrder(stageId: string): number {
    let m = -1;
    for (const g of tplGroups.values()) {
      if (g.stageId === stageId) m = Math.max(m, g.sortOrder);
    }
    return m + 1;
  }

  function buildDetail(id: string): TreatmentProgramTemplateDetail | null {
    const tpl = templates.get(id);
    if (!tpl) return null;
    const stageList = [...stages.values()]
      .filter((s) => s.templateId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const outStages = stageList.map((st) => {
      const groupList = [...tplGroups.values()]
        .filter((g) => g.stageId === st.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      const itemList = [...items.values()]
        .filter((it) => it.stageId === st.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return {
        ...st,
        groups: groupList.map((g) => ({ ...g })),
        items: itemList.map((i) => ({ ...i })),
      };
    });
    return { ...tpl, stages: outStages };
  }

  return {
    async createTemplate(input: CreateTreatmentProgramTemplateInput, createdBy: string | null) {
      const id = crypto.randomUUID();
      const now = isoNow();
      const row: TreatmentProgramTemplate = {
        id,
        title: input.title,
        description: input.description ?? null,
        status: (input.status ?? "draft") as TreatmentProgramTemplateStatus,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      templates.set(id, row);
      return { ...row };
    },

    async updateTemplate(id: string, input: UpdateTreatmentProgramTemplateInput) {
      const cur = templates.get(id);
      if (!cur) return null;
      const next: TreatmentProgramTemplate = {
        ...cur,
        ...input,
        updatedAt: isoNow(),
      };
      templates.set(id, next);
      return { ...next };
    },

    async getTemplateById(id: string) {
      return buildDetail(id);
    },

    async listTemplates(filter: TreatmentProgramTemplateFilter) {
      const list = [...templates.values()];
      let out = filter.includeArchived ? list : list.filter((t) => t.status !== "archived");
      if (filter.status !== undefined) {
        out = out.filter((t) => t.status === filter.status);
      }
      return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    async deleteTemplate(id: string) {
      const cur = templates.get(id);
      if (!cur || cur.status === "archived") return false;
      templates.set(id, { ...cur, status: "archived", updatedAt: isoNow() });
      return true;
    },

    async getTreatmentProgramTemplateUsageSummary(templateId: string): Promise<TreatmentProgramTemplateUsageSnapshot> {
      return templateUsageSnapshots.get(templateId) ?? { ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT };
    },

    async createStage(templateId: string, input: CreateTreatmentProgramStageInput) {
      const id = crypto.randomUUID();
      const row: TreatmentProgramStage = {
        id,
        templateId,
        title: input.title,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? nextStageOrder(templateId),
        goals: input.goals ?? null,
        objectives: input.objectives ?? null,
        expectedDurationDays: input.expectedDurationDays ?? null,
        expectedDurationText: input.expectedDurationText ?? null,
      };
      stages.set(id, row);
      return { ...row };
    },

    async updateStage(stageId: string, input: UpdateTreatmentProgramStageInput) {
      const cur = stages.get(stageId);
      if (!cur) return null;
      const next = { ...cur, ...input };
      stages.set(stageId, next);
      return { ...next };
    },

    async deleteStage(stageId: string) {
      if (!stages.has(stageId)) return false;
      stages.delete(stageId);
      for (const [iid, it] of items) {
        if (it.stageId === stageId) items.delete(iid);
      }
      for (const [gid, g] of tplGroups) {
        if (g.stageId === stageId) tplGroups.delete(gid);
      }
      return true;
    },

    async addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput) {
      if (input.groupId) {
        const gr = tplGroups.get(input.groupId);
        if (!gr || gr.stageId !== stageId) {
          throw new Error("Группа не найдена или не принадлежит этапу");
        }
      }
      const id = crypto.randomUUID();
      const row: TreatmentProgramStageItem = {
        id,
        stageId,
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder: input.sortOrder ?? nextItemOrder(stageId),
        comment: input.comment ?? null,
        settings: input.settings ?? null,
        groupId: input.groupId ?? null,
      };
      items.set(id, row);
      return { ...row };
    },

    async getStageItemById(itemId: string) {
      const row = items.get(itemId);
      return row ? { ...row } : null;
    },

    async updateStageItem(itemId: string, input: UpdateTreatmentProgramStageItemInput) {
      const cur = items.get(itemId);
      if (!cur) return null;
      if (input.groupId !== undefined && input.groupId !== null) {
        const gr = tplGroups.get(input.groupId);
        if (!gr || gr.stageId !== cur.stageId) {
          throw new Error("Группа не найдена или не принадлежит этапу");
        }
      }
      const next = { ...cur, ...input };
      items.set(itemId, next);
      return { ...next };
    },

    async deleteStageItem(itemId: string) {
      if (!items.has(itemId)) return false;
      items.delete(itemId);
      return true;
    },

    async createTemplateStageGroup(stageId: string, input: CreateTreatmentProgramTemplateStageGroupInput) {
      const st = stages.get(stageId);
      if (!st) throw new Error("Этап не найден");
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название группы обязательно");
      const id = crypto.randomUUID();
      const row: TreatmentProgramTemplateStageGroup = {
        id,
        stageId,
        title,
        description: input.description?.trim() ?? null,
        scheduleText: input.scheduleText?.trim() ?? null,
        sortOrder: input.sortOrder ?? nextTplGroupOrder(stageId),
      };
      tplGroups.set(id, row);
      return { ...row };
    },

    async updateTemplateStageGroup(groupId: string, input: UpdateTreatmentProgramTemplateStageGroupInput) {
      const cur = tplGroups.get(groupId);
      if (!cur) return null;
      let title = cur.title;
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название группы обязательно");
        title = t;
      }
      const next: TreatmentProgramTemplateStageGroup = {
        ...cur,
        title,
        ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
        ...(input.scheduleText !== undefined ? { scheduleText: input.scheduleText?.trim() ?? null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      };
      tplGroups.set(groupId, next);
      return { ...next };
    },

    async deleteTemplateStageGroup(groupId: string) {
      if (!tplGroups.has(groupId)) return false;
      for (const [iid, it] of items) {
        if (it.groupId === groupId) items.set(iid, { ...it, groupId: null });
      }
      tplGroups.delete(groupId);
      return true;
    },

    async reorderTemplateStageGroups(stageId: string, orderedGroupIds: string[]) {
      if (!stages.has(stageId)) return false;
      const groupList = [...tplGroups.values()].filter((g) => g.stageId === stageId);
      const idSet = new Set(groupList.map((g) => g.id));
      if (!sameIdSet(orderedGroupIds, idSet)) return false;
      for (let i = 0; i < orderedGroupIds.length; i++) {
        const gid = orderedGroupIds[i]!;
        const row = tplGroups.get(gid);
        if (!row) return false;
        tplGroups.set(gid, { ...row, sortOrder: i });
      }
      return true;
    },
  };
}
