import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  treatmentProgramTemplates as tplTable,
  treatmentProgramTemplateStages as stageTable,
  treatmentProgramTemplateStageItems as itemTable,
} from "../../../db/schema/treatmentProgramTemplates";
import type { TreatmentProgramPort } from "@/modules/treatment-program/ports";
import type {
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  TreatmentProgramItemType,
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

function mapTemplate(row: typeof tplTable.$inferSelect): TreatmentProgramTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TreatmentProgramTemplateStatus,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapStage(row: typeof stageTable.$inferSelect): TreatmentProgramStage {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
  };
}

function mapItem(row: typeof itemTable.$inferSelect): TreatmentProgramStageItem {
  return {
    id: row.id,
    stageId: row.stageId,
    itemType: row.itemType as TreatmentProgramItemType,
    itemRefId: row.itemRefId,
    sortOrder: row.sortOrder,
    comment: row.comment ?? null,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
  };
}

export function createPgTreatmentProgramPort(): TreatmentProgramPort {
  return {
    async createTemplate(input: CreateTreatmentProgramTemplateInput, createdBy: string | null) {
      const db = getDrizzle();
      const [row] = await db
        .insert(tplTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "draft",
          createdBy,
        })
        .returning();
      if (!row) throw new Error("insert failed");
      return mapTemplate(row);
    },

    async updateTemplate(id: string, input: UpdateTreatmentProgramTemplateInput) {
      const db = getDrizzle();
      const patch: Partial<typeof tplTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.status !== undefined) patch.status = input.status;
      const [row] = await db.update(tplTable).set(patch).where(eq(tplTable.id, id)).returning();
      return row ? mapTemplate(row) : null;
    },

    async getTemplateById(id: string): Promise<TreatmentProgramTemplateDetail | null> {
      const db = getDrizzle();
      const tplRow = await db.query.treatmentProgramTemplates.findFirst({
        where: eq(tplTable.id, id),
      });
      if (!tplRow) return null;
      const stagesRows = await db
        .select()
        .from(stageTable)
        .where(eq(stageTable.templateId, id))
        .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
      const stageIds = stagesRows.map((s) => s.id);
      const itemsRows =
        stageIds.length === 0
          ? []
          : await db
              .select()
              .from(itemTable)
              .where(inArray(itemTable.stageId, stageIds))
              .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
      const itemsByStage = new Map<string, typeof itemsRows>();
      for (const it of itemsRows) {
        const list = itemsByStage.get(it.stageId) ?? [];
        list.push(it);
        itemsByStage.set(it.stageId, list);
      }
      const stages = stagesRows.map((s) => ({
        ...mapStage(s),
        items: (itemsByStage.get(s.id) ?? []).map(mapItem),
      }));
      return {
        ...mapTemplate(tplRow),
        stages,
      };
    },

    async listTemplates(filter: TreatmentProgramTemplateFilter): Promise<TreatmentProgramTemplate[]> {
      const db = getDrizzle();
      const conds = [];
      if (!filter.includeArchived) {
        conds.push(ne(tplTable.status, "archived"));
      }
      if (filter.status !== undefined) {
        conds.push(eq(tplTable.status, filter.status));
      }
      const rows = await db
        .select()
        .from(tplTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(tplTable.updatedAt), desc(tplTable.id));
      return rows.map(mapTemplate);
    },

    async deleteTemplate(id: string) {
      const db = getDrizzle();
      const res = await db.delete(tplTable).where(eq(tplTable.id, id)).returning({ id: tplTable.id });
      return res.length > 0;
    },

    async createStage(templateId: string, input: CreateTreatmentProgramStageInput) {
      const db = getDrizzle();
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${stageTable.sortOrder}), -1)` })
        .from(stageTable)
        .where(eq(stageTable.templateId, templateId));
      const sortOrder = input.sortOrder ?? max + 1;
      const [row] = await db
        .insert(stageTable)
        .values({
          templateId,
          title: input.title,
          description: input.description ?? null,
          sortOrder,
        })
        .returning();
      if (!row) throw new Error("insert failed");
      return mapStage(row);
    },

    async updateStage(stageId: string, input: UpdateTreatmentProgramStageInput) {
      const db = getDrizzle();
      const patch: Partial<typeof stageTable.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      const [row] = await db.update(stageTable).set(patch).where(eq(stageTable.id, stageId)).returning();
      return row ? mapStage(row) : null;
    },

    async deleteStage(stageId: string) {
      const db = getDrizzle();
      const res = await db.delete(stageTable).where(eq(stageTable.id, stageId)).returning({ id: stageTable.id });
      return res.length > 0;
    },

    async addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput) {
      const db = getDrizzle();
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
        .from(itemTable)
        .where(eq(itemTable.stageId, stageId));
      const sortOrder = input.sortOrder ?? max + 1;
      const [row] = await db
        .insert(itemTable)
        .values({
          stageId,
          itemType: input.itemType,
          itemRefId: input.itemRefId,
          sortOrder,
          comment: input.comment ?? null,
          settings: input.settings ?? undefined,
        })
        .returning();
      if (!row) throw new Error("insert failed");
      return mapItem(row);
    },

    async getStageItemById(itemId: string) {
      const db = getDrizzle();
      const row = await db.query.treatmentProgramTemplateStageItems.findFirst({
        where: eq(itemTable.id, itemId),
      });
      return row ? mapItem(row) : null;
    },

    async updateStageItem(itemId: string, input: UpdateTreatmentProgramStageItemInput) {
      const db = getDrizzle();
      const patch: Partial<typeof itemTable.$inferInsert> = {};
      if (input.itemType !== undefined) patch.itemType = input.itemType;
      if (input.itemRefId !== undefined) patch.itemRefId = input.itemRefId;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.comment !== undefined) patch.comment = input.comment;
      if (input.settings !== undefined) patch.settings = input.settings ?? undefined;
      const [row] = await db.update(itemTable).set(patch).where(eq(itemTable.id, itemId)).returning();
      return row ? mapItem(row) : null;
    },

    async deleteStageItem(itemId: string) {
      const db = getDrizzle();
      const res = await db.delete(itemTable).where(eq(itemTable.id, itemId)).returning({ id: itemTable.id });
      return res.length > 0;
    },
  };
}
