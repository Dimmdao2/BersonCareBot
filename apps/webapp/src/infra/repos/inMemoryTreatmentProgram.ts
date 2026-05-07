import type { TreatmentProgramPort, TreatmentProgramTemplateStageValidationContext } from "@/modules/treatment-program/ports";
import type {
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  CreateTreatmentProgramTemplateStageGroupInput,
  LfkComplexExpandPreview,
  ExpandLfkComplexIntoStageItemsPortInput,
  ExpandLfkComplexIntoStageItemsResult,
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
import {
  EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
  TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE,
  treatmentProgramTemplateStageCountForList,
} from "@/modules/treatment-program/types";
import { TreatmentProgramTemplateAlreadyArchivedError, TreatmentProgramExpandNotFoundError } from "@/modules/treatment-program/errors";

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
  /** Ключ — id шаблона комплекса ЛФК (каталог); только для тестов expand. */
  lfkComplexExpandPreview?: Record<string, LfkComplexExpandPreview>;
}): TreatmentProgramPort {
  const templates = new Map<string, TreatmentProgramTemplate>();
  const stages = new Map<string, TreatmentProgramStage>();
  const items = new Map<string, TreatmentProgramStageItem>();
  const tplGroups = new Map<string, TreatmentProgramTemplateStageGroup>();

  for (const t of seed?.templates ?? []) {
    templates.set(t.id, {
      ...t,
      stageCount: t.stageCount ?? 0,
      itemCount: t.itemCount ?? 0,
      listPreviewMedia: t.listPreviewMedia ?? null,
    });
  }
  for (const s of seed?.stages ?? []) stages.set(s.id, { ...s });
  for (const i of seed?.items ?? []) items.set(i.id, { ...i });
  for (const g of seed?.groups ?? []) tplGroups.set(g.id, { ...g, systemKind: g.systemKind ?? null });

  const lfkComplexExpandPreview = seed?.lfkComplexExpandPreview ?? {};

  function sameUuidOrder(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
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
    const itemCount = outStages.reduce((n, st) => n + st.items.length, 0);
    return {
      ...tpl,
      stageCount: treatmentProgramTemplateStageCountForList(outStages),
      itemCount,
      stages: outStages,
    };
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
        stageCount: 0,
        itemCount: 0,
        listPreviewMedia: null,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      templates.set(id, row);
      const stId = crypto.randomUUID();
      stages.set(stId, {
        id: stId,
        templateId: id,
        title: TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE,
        description: null,
        sortOrder: 0,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
      });
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
      const d = buildDetail(id);
      if (!d) return null;
      const withCounts: TreatmentProgramTemplate = {
        ...next,
        stageCount: treatmentProgramTemplateStageCountForList(d.stages),
        itemCount: d.stages.reduce((n, st) => n + st.items.length, 0),
      };
      templates.set(id, withCounts);
      return { ...withCounts };
    },

    async getTemplateById(id: string) {
      return buildDetail(id);
    },

    async getTemplateStageValidationContext(
      stageId: string,
    ): Promise<TreatmentProgramTemplateStageValidationContext | null> {
      const st = stages.get(stageId);
      if (!st) return null;
      const groupList = [...tplGroups.values()]
        .filter((g) => g.stageId === stageId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return {
        sortOrder: st.sortOrder,
        groups: groupList.map((g) => ({
          id: g.id,
          systemKind: g.systemKind === "recommendations" || g.systemKind === "tests" ? g.systemKind : null,
        })),
      };
    },

    async listTemplates(filter: TreatmentProgramTemplateFilter) {
      const list = [...templates.values()];
      let out = filter.includeArchived ? list : list.filter((t) => t.status !== "archived");
      if (filter.status !== undefined) {
        out = out.filter((t) => t.status === filter.status);
      }
      return out
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map((t) => {
          const d = buildDetail(t.id);
          if (!d) return t;
          return {
            ...t,
            stageCount: treatmentProgramTemplateStageCountForList(d.stages),
            itemCount: d.stages.reduce((n, s) => n + s.items.length, 0),
            listPreviewMedia: t.listPreviewMedia ?? null,
          };
        });
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
      const sortOrder = nextStageOrder(templateId);
      const row: TreatmentProgramStage = {
        id,
        templateId,
        title: input.title,
        description: input.description ?? null,
        sortOrder,
        goals: input.goals ?? null,
        objectives: input.objectives ?? null,
        expectedDurationDays: input.expectedDurationDays ?? null,
        expectedDurationText: input.expectedDurationText ?? null,
      };
      stages.set(id, row);
      if (sortOrder > 0) {
        const gidR = crypto.randomUUID();
        const gidT = crypto.randomUUID();
        tplGroups.set(gidR, {
          id: gidR,
          stageId: id,
          title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
          description: null,
          scheduleText: null,
          sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
          systemKind: "recommendations",
        });
        tplGroups.set(gidT, {
          id: gidT,
          stageId: id,
          title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
          description: null,
          scheduleText: null,
          sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
          systemKind: "tests",
        });
      }
      return { ...row };
    },

    async updateStage(stageId: string, input: UpdateTreatmentProgramStageInput) {
      const cur = stages.get(stageId);
      if (!cur) return null;
      if (input.sortOrder !== undefined) {
        if (cur.sortOrder === 0 && input.sortOrder !== 0) {
          throw new Error("Этап «Общие рекомендации» (порядок 0) нельзя перевести на другой порядок");
        }
        if (cur.sortOrder !== 0 && input.sortOrder === 0) {
          throw new Error("Порядок 0 зарезервирован для этапа «Общие рекомендации»");
        }
        if (input.sortOrder !== cur.sortOrder) {
          const clash = [...stages.values()].find(
            (s) => s.templateId === cur.templateId && s.sortOrder === input.sortOrder && s.id !== stageId,
          );
          if (clash) throw new Error("Этап с таким порядком уже существует");
        }
      }
      const next = { ...cur, ...input };
      stages.set(stageId, next);
      return { ...next };
    },

    async deleteStage(stageId: string) {
      const cur = stages.get(stageId);
      if (!cur) return false;
      if (cur.sortOrder === 0) {
        throw new Error("Нельзя удалить этап «Общие рекомендации»");
      }
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
      const st = stages.get(stageId);
      if (!st) throw new Error("Этап не найден");
      if (st.sortOrder === 0 && input.itemType !== "recommendation") {
        throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
      }
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
      if (st.sortOrder === 0) {
        throw new Error("На этапе «Общие рекомендации» нельзя создавать группы");
      }
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
        systemKind: null,
      };
      tplGroups.set(id, row);
      return { ...row };
    },

    async updateTemplateStageGroup(groupId: string, input: UpdateTreatmentProgramTemplateStageGroupInput) {
      const cur = tplGroups.get(groupId);
      if (!cur) return null;
      if (cur.systemKind === "recommendations" || cur.systemKind === "tests") {
        if (
          input.title !== undefined ||
          input.sortOrder !== undefined ||
          input.description !== undefined ||
          input.scheduleText !== undefined
        ) {
          throw new Error("Системную группу нельзя редактировать");
        }
        return { ...cur };
      }
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
      const cur = tplGroups.get(groupId);
      if (!cur) return false;
      if (cur.systemKind === "recommendations" || cur.systemKind === "tests") {
        throw new Error("Системную группу нельзя удалить");
      }
      for (const [iid, it] of items) {
        if (it.groupId === groupId) items.set(iid, { ...it, groupId: null });
      }
      tplGroups.delete(groupId);
      return true;
    },

    async getLfkComplexExpandPreview(complexTemplateId: string): Promise<LfkComplexExpandPreview | null> {
      const row = lfkComplexExpandPreview[complexTemplateId];
      if (!row) return null;
      return {
        exerciseIds: [...row.exerciseIds],
        complexDescription: row.complexDescription,
      };
    },

    async expandLfkComplexIntoStageItems(
      input: ExpandLfkComplexIntoStageItemsPortInput,
    ): Promise<ExpandLfkComplexIntoStageItemsResult> {
      const stageRow = stages.get(input.stageId);
      if (!stageRow) throw new TreatmentProgramExpandNotFoundError("Этап не найден");
      if (stageRow.sortOrder === 0) {
        throw new Error("На этапе «Общие рекомендации» нельзя разворачивать комплекс ЛФК");
      }
      if (stageRow.templateId !== input.templateId) {
        throw new TreatmentProgramExpandNotFoundError("Этап не принадлежит шаблону");
      }

      const tplRow = templates.get(input.templateId);
      if (!tplRow) throw new TreatmentProgramExpandNotFoundError("Шаблон программы не найден");
      if (tplRow.status === "archived") throw new TreatmentProgramTemplateAlreadyArchivedError();

      const preview = lfkComplexExpandPreview[input.complexTemplateId];
      if (!preview) throw new TreatmentProgramExpandNotFoundError("Комплекс ЛФК не найден или в архиве");

      const idsFromDb = [...preview.exerciseIds];
      if (idsFromDb.length === 0) throw new Error("В комплексе нет упражнений");
      if (!sameUuidOrder(idsFromDb, input.expectedExerciseIds)) {
        throw new Error("Комплекс ЛФК был изменён; обновите страницу и повторите попытку");
      }

      const complexDescription = preview.complexDescription;

      let targetGroupId: string | null = null;
      let createdGroup: TreatmentProgramTemplateStageGroup | undefined;

      if (input.mode === "ungrouped") {
        targetGroupId = null;
      } else if (input.mode === "new_group") {
        const title = input.newGroupTitle?.trim() ?? "";
        if (!title) throw new Error("Название группы обязательно");
        let groupDescription: string | null = null;
        if (input.copyComplexDescriptionToGroup && complexDescription) {
          groupDescription = complexDescription;
        }
        const id = crypto.randomUUID();
        const sortOrder = nextTplGroupOrder(input.stageId);
        const row: TreatmentProgramTemplateStageGroup = {
          id,
          stageId: input.stageId,
          title,
          description: groupDescription,
          scheduleText: null,
          sortOrder,
          systemKind: null,
        };
        tplGroups.set(id, row);
        createdGroup = { ...row };
        targetGroupId = id;
      } else {
        const gRow = tplGroups.get(input.existingGroupId!);
        if (!gRow || gRow.stageId !== input.stageId) {
          throw new TreatmentProgramExpandNotFoundError("Группа не найдена или не принадлежит этапу");
        }
        if (gRow.systemKind === "recommendations" || gRow.systemKind === "tests") {
          throw new Error("Нельзя добавить упражнения в системную группу");
        }
        targetGroupId = gRow.id;
        if (input.copyComplexDescriptionToGroup && complexDescription) {
          tplGroups.set(gRow.id, { ...gRow, description: complexDescription });
        }
      }

      let m = -1;
      for (const it of items.values()) {
        if (it.stageId === input.stageId) m = Math.max(m, it.sortOrder);
      }
      const base = m + 1;

      const insertedItems: TreatmentProgramStageItem[] = [];
      for (let i = 0; i < idsFromDb.length; i++) {
        const exerciseId = idsFromDb[i]!;
        const id = crypto.randomUUID();
        const row: TreatmentProgramStageItem = {
          id,
          stageId: input.stageId,
          itemType: "exercise",
          itemRefId: exerciseId,
          sortOrder: base + i,
          comment: null,
          settings: null,
          groupId: targetGroupId,
        };
        items.set(id, row);
        insertedItems.push({ ...row });
      }

      return { items: insertedItems, createdGroup };
    },

    async reorderTemplateStageGroups(stageId: string, orderedGroupIds: string[]) {
      if (!stages.has(stageId)) return false;
      const groupList = [...tplGroups.values()].filter((g) => g.stageId === stageId);
      const userList = groupList.filter((g) => !g.systemKind);
      const idSet = new Set(userList.map((g) => g.id));
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
