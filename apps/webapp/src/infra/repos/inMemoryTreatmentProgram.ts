import type { TreatmentProgramPort } from "@/modules/treatment-program/ports";
import type {
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  TreatmentProgramStage,
  TreatmentProgramStageItem,
  TreatmentProgramTemplate,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateFilter,
  TreatmentProgramTemplateStatus,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateInput,
} from "@/modules/treatment-program/types";

function isoNow(): string {
  return new Date().toISOString();
}

export function createInMemoryTreatmentProgramPort(seed?: {
  templates?: TreatmentProgramTemplate[];
  stages?: TreatmentProgramStage[];
  items?: TreatmentProgramStageItem[];
}): TreatmentProgramPort {
  const templates = new Map<string, TreatmentProgramTemplate>();
  const stages = new Map<string, TreatmentProgramStage>();
  const items = new Map<string, TreatmentProgramStageItem>();

  for (const t of seed?.templates ?? []) templates.set(t.id, { ...t });
  for (const s of seed?.stages ?? []) stages.set(s.id, { ...s });
  for (const i of seed?.items ?? []) items.set(i.id, { ...i });

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

  function buildDetail(id: string): TreatmentProgramTemplateDetail | null {
    const tpl = templates.get(id);
    if (!tpl) return null;
    const stageList = [...stages.values()]
      .filter((s) => s.templateId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const outStages = stageList.map((st) => {
      const itemList = [...items.values()]
        .filter((it) => it.stageId === st.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return { ...st, items: itemList.map((i) => ({ ...i })) };
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
      const existed = templates.has(id);
      if (!existed) return false;
      templates.delete(id);
      const stageIds = [...stages.values()].filter((s) => s.templateId === id).map((s) => s.id);
      for (const sid of stageIds) {
        stages.delete(sid);
        for (const [iid, it] of items) {
          if (it.stageId === sid) items.delete(iid);
        }
      }
      return true;
    },

    async createStage(templateId: string, input: CreateTreatmentProgramStageInput) {
      const id = crypto.randomUUID();
      const row: TreatmentProgramStage = {
        id,
        templateId,
        title: input.title,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? nextStageOrder(templateId),
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
      return true;
    },

    async addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput) {
      const id = crypto.randomUUID();
      const row: TreatmentProgramStageItem = {
        id,
        stageId,
        itemType: input.itemType,
        itemRefId: input.itemRefId,
        sortOrder: input.sortOrder ?? nextItemOrder(stageId),
        comment: input.comment ?? null,
        settings: input.settings ?? null,
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
      const next = { ...cur, ...input };
      items.set(itemId, next);
      return { ...next };
    },

    async deleteStageItem(itemId: string) {
      if (!items.has(itemId)) return false;
      items.delete(itemId);
      return true;
    },
  };
}
