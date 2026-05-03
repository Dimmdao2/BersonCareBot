import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  treatmentProgramInstanceStageItems as itemTable,
  treatmentProgramInstanceStages as stageTable,
  treatmentProgramInstances as instTable,
} from "../../../db/schema/treatmentProgramInstances";
import { treatmentProgramEvents as eventTable } from "../../../db/schema/treatmentProgramEvents";
import type { TreatmentProgramInstancePort } from "@/modules/treatment-program/ports";
import type {
  AddTreatmentProgramInstanceStageInput,
  AddTreatmentProgramInstanceStageItemInput,
  AppendTreatmentProgramEventInput,
  CreateTreatmentProgramInstanceTreeInput,
  ReplaceTreatmentProgramInstanceStageItemInput,
  UpdateTreatmentProgramInstanceStageMetadataInput,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramInstanceStatus,
  TreatmentProgramInstanceSummary,
  TreatmentProgramInstanceStageStatus,
  TreatmentProgramInstanceStageItemStatus,
  TreatmentProgramItemType,
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

function mapInstance(row: typeof instTable.$inferSelect): TreatmentProgramInstanceSummary {
  return {
    id: row.id,
    patientUserId: row.patientUserId,
    templateId: row.templateId ?? null,
    assignedBy: row.assignedBy ?? null,
    title: row.title,
    status: row.status as TreatmentProgramInstanceStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapStage(row: typeof stageTable.$inferSelect): TreatmentProgramInstanceStageRow {
  return {
    id: row.id,
    instanceId: row.instanceId,
    sourceStageId: row.sourceStageId ?? null,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
    localComment: row.localComment ?? null,
    skipReason: row.skipReason ?? null,
    status: row.status as TreatmentProgramInstanceStageStatus,
    goals: row.goals ?? null,
    objectives: row.objectives ?? null,
    expectedDurationDays: row.expectedDurationDays ?? null,
    expectedDurationText: row.expectedDurationText ?? null,
  };
}

function mapItem(row: typeof itemTable.$inferSelect): TreatmentProgramInstanceStageItemRow {
  return {
    id: row.id,
    stageId: row.stageId,
    itemType: row.itemType as TreatmentProgramItemType,
    itemRefId: row.itemRefId,
    sortOrder: row.sortOrder,
    comment: row.comment ?? null,
    localComment: row.localComment ?? null,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
    snapshot: (row.snapshot as Record<string, unknown>) ?? {},
    completedAt: row.completedAt ?? null,
    isActionable: row.isActionable ?? null,
    status: (row.status ?? "active") as TreatmentProgramInstanceStageItemStatus,
  };
}

function toDetail(
  inst: typeof instTable.$inferSelect,
  stagesRows: (typeof stageTable.$inferSelect)[],
  itemsRows: (typeof itemTable.$inferSelect)[],
): TreatmentProgramInstanceDetail {
  const itemsByStage = new Map<string, (typeof itemTable.$inferSelect)[]>();
  for (const it of itemsRows) {
    const list = itemsByStage.get(it.stageId) ?? [];
    list.push(it);
    itemsByStage.set(it.stageId, list);
  }
  const stages = stagesRows.map((s) => {
    const items = (itemsByStage.get(s.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((row) => {
        const base = mapItem(row);
        return {
          ...base,
          effectiveComment: effectiveInstanceStageItemComment(base),
        };
      });
    return { ...mapStage(s), items };
  });
  return {
    ...mapInstance(inst),
    stages,
  };
}

async function touchInstanceUpdatedAt(db: ReturnType<typeof getDrizzle>, instanceId: string): Promise<void> {
  await db
    .update(instTable)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(instTable.id, instanceId));
}

export function createPgTreatmentProgramInstancePort(): TreatmentProgramInstancePort {
  return {
    async createInstanceTree(input: CreateTreatmentProgramInstanceTreeInput): Promise<TreatmentProgramInstanceDetail> {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [inst] = await tx
          .insert(instTable)
          .values({
            templateId: input.templateId,
            patientUserId: input.patientUserId,
            assignedBy: input.assignedBy,
            title: input.title,
            status: "active",
          })
          .returning();
        if (!inst) throw new Error("insert instance failed");

        for (const st of input.stages) {
          const [srow] = await tx
            .insert(stageTable)
            .values({
              instanceId: inst.id,
              sourceStageId: st.sourceStageId,
              title: st.title,
              description: st.description,
              sortOrder: st.sortOrder,
              localComment: null,
              skipReason: null,
              status: st.status,
              goals: st.goals,
              objectives: st.objectives,
              expectedDurationDays: st.expectedDurationDays,
              expectedDurationText: st.expectedDurationText,
            })
            .returning();
          if (!srow) throw new Error("insert stage failed");
          for (const it of st.items) {
            await tx.insert(itemTable).values({
              stageId: srow.id,
              itemType: it.itemType,
              itemRefId: it.itemRefId,
              sortOrder: it.sortOrder,
              comment: it.comment,
              localComment: null,
              settings: it.settings ?? undefined,
              snapshot: it.snapshot,
              completedAt: null,
              isActionable: it.isActionable ?? null,
              status: it.status ?? "active",
            });
          }
        }

        const stagesRows = await tx
          .select()
          .from(stageTable)
          .where(eq(stageTable.instanceId, inst.id))
          .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
        const allItems =
          stagesRows.length === 0
            ? []
            : await tx
                .select()
                .from(itemTable)
                .where(inArray(itemTable.stageId, stagesRows.map((s) => s.id)))
                .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));

        return toDetail(inst, stagesRows, allItems);
      });
    },

    async getInstanceById(id: string): Promise<TreatmentProgramInstanceDetail | null> {
      const db = getDrizzle();
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: eq(instTable.id, id),
      });
      if (!inst) return null;
      const stagesRows = await db
        .select()
        .from(stageTable)
        .where(eq(stageTable.instanceId, id))
        .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
      const sids = stagesRows.map((s) => s.id);
      const itemsRows =
        sids.length === 0
          ? []
          : await db
              .select()
              .from(itemTable)
              .where(inArray(itemTable.stageId, sids))
              .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
      return toDetail(inst, stagesRows, itemsRows);
    },

    async getInstanceForPatient(
      patientUserId: string,
      instanceId: string,
    ): Promise<TreatmentProgramInstanceDetail | null> {
      const db = getDrizzle();
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: and(eq(instTable.id, instanceId), eq(instTable.patientUserId, patientUserId)),
      });
      if (!inst) return null;
      const stagesRows = await db
        .select()
        .from(stageTable)
        .where(eq(stageTable.instanceId, instanceId))
        .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
      const sids = stagesRows.map((s) => s.id);
      const itemsRows =
        sids.length === 0
          ? []
          : await db
              .select()
              .from(itemTable)
              .where(inArray(itemTable.stageId, sids))
              .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
      return toDetail(inst, stagesRows, itemsRows);
    },

    async listInstancesForPatient(patientUserId: string): Promise<TreatmentProgramInstanceSummary[]> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(instTable)
        .where(eq(instTable.patientUserId, patientUserId))
        .orderBy(desc(instTable.updatedAt), desc(instTable.id));
      return rows.map(mapInstance);
    },

    async updateStageItemLocalComment(
      instanceId: string,
      stageItemId: string,
      localComment: string | null,
    ): Promise<TreatmentProgramInstanceStageItemRow | null> {
      const db = getDrizzle();
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: eq(instTable.id, instanceId),
      });
      if (!inst) return null;

      const itemRow = await db.query.treatmentProgramInstanceStageItems.findFirst({
        where: eq(itemTable.id, stageItemId),
      });
      if (!itemRow) return null;
      const stageRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, itemRow.stageId),
      });
      if (!stageRow || stageRow.instanceId !== instanceId) return null;

      const nextLocal = localComment === null ? null : localComment.trim() || null;

      const [updated] = await db
        .update(itemTable)
        .set({ localComment: nextLocal })
        .where(eq(itemTable.id, stageItemId))
        .returning();
      return updated ? mapItem(updated) : null;
    },

    async updateInstanceMeta(
      instanceId: string,
      patch: { title?: string; status?: "active" | "completed" },
    ): Promise<TreatmentProgramInstanceSummary | null> {
      const db = getDrizzle();
      const rowPatch: Partial<typeof instTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.title !== undefined) {
        const t = patch.title.trim();
        if (!t) return null;
        rowPatch.title = t;
      }
      if (patch.status !== undefined) rowPatch.status = patch.status;
      const [row] = await db.update(instTable).set(rowPatch).where(eq(instTable.id, instanceId)).returning();
      return row ? mapInstance(row) : null;
    },

    async updateInstanceStage(
      instanceId: string,
      stageId: string,
      patch: { status: TreatmentProgramInstanceStageStatus; skipReason?: string | null },
    ) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return null;

        const skipReason =
          patch.skipReason === undefined
            ? stRow.skipReason
            : patch.skipReason === null
              ? null
              : patch.skipReason.trim() || null;

        const nextSkip = patch.status === "skipped" ? skipReason : null;

        const [updated] = await tx
          .update(stageTable)
          .set({
            status: patch.status,
            skipReason: nextSkip,
          })
          .where(eq(stageTable.id, stageId))
          .returning();
        if (!updated) return null;

        if (patch.status === "completed" || patch.status === "skipped") {
          const nextLocked = await tx
            .select({ id: stageTable.id })
            .from(stageTable)
            .where(
              and(
                eq(stageTable.instanceId, instanceId),
                eq(stageTable.status, "locked"),
                gt(stageTable.sortOrder, stRow.sortOrder),
              ),
            )
            .orderBy(asc(stageTable.sortOrder), asc(stageTable.id))
            .limit(1);
          const nid = nextLocked[0]?.id;
          if (nid) {
            await tx.update(stageTable).set({ status: "available" }).where(eq(stageTable.id, nid));
          }
        }

        return mapStage(updated);
      });
    },

    async updateInstanceStageMetadata(
      instanceId: string,
      stageId: string,
      patch: UpdateTreatmentProgramInstanceStageMetadataInput,
    ) {
      const db = getDrizzle();
      const stRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, stageId),
      });
      if (!stRow || stRow.instanceId !== instanceId) return null;

      const rowPatch: Partial<typeof stageTable.$inferInsert> = {};
      if (patch.goals !== undefined) rowPatch.goals = patch.goals;
      if (patch.objectives !== undefined) rowPatch.objectives = patch.objectives;
      if (patch.expectedDurationDays !== undefined) {
        rowPatch.expectedDurationDays = patch.expectedDurationDays;
      }
      if (patch.expectedDurationText !== undefined) {
        rowPatch.expectedDurationText = patch.expectedDurationText;
      }

      const [updated] = await db
        .update(stageTable)
        .set(rowPatch)
        .where(eq(stageTable.id, stageId))
        .returning();
      if (!updated) return null;
      await touchInstanceUpdatedAt(db, instanceId);
      return mapStage(updated);
    },

    async setStageItemCompletedAt(instanceId: string, itemId: string, completedAt: string | null) {
      const db = getDrizzle();
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: eq(instTable.id, instanceId),
      });
      if (!inst) return null;

      const itemRow = await db.query.treatmentProgramInstanceStageItems.findFirst({
        where: eq(itemTable.id, itemId),
      });
      if (!itemRow) return null;
      const stageRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, itemRow.stageId),
      });
      if (!stageRow || stageRow.instanceId !== instanceId) return null;

      const [updated] = await db
        .update(itemTable)
        .set({ completedAt })
        .where(eq(itemTable.id, itemId))
        .returning();
      if (updated) await touchInstanceUpdatedAt(db, instanceId);
      return updated ? mapItem(updated) : null;
    },

    async addInstanceStage(instanceId: string, input: AddTreatmentProgramInstanceStageInput) {
      const db = getDrizzle();
      const inst = await db.query.treatmentProgramInstances.findFirst({
        where: eq(instTable.id, instanceId),
      });
      if (!inst) return null;
      const [srow] = await db
        .insert(stageTable)
        .values({
          instanceId,
          sourceStageId: input.sourceStageId ?? null,
          title: input.title,
          description: input.description ?? null,
          sortOrder: input.sortOrder,
          localComment: null,
          skipReason: null,
          status: input.status,
          goals: input.goals ?? null,
          objectives: input.objectives ?? null,
          expectedDurationDays: input.expectedDurationDays ?? null,
          expectedDurationText: input.expectedDurationText ?? null,
        })
        .returning();
      if (!srow) return null;
      await touchInstanceUpdatedAt(db, instanceId);
      return mapStage(srow);
    },

    async removeInstanceStage(instanceId: string, stageId: string) {
      const db = getDrizzle();
      const stRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, stageId),
      });
      if (!stRow || stRow.instanceId !== instanceId) return false;
      await db.delete(stageTable).where(eq(stageTable.id, stageId));
      await touchInstanceUpdatedAt(db, instanceId);
      return true;
    },

    async addInstanceStageItem(
      instanceId: string,
      stageId: string,
      input: AddTreatmentProgramInstanceStageItemInput,
    ) {
      const db = getDrizzle();
      const stRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, stageId),
      });
      if (!stRow || stRow.instanceId !== instanceId) return null;
      const [irow] = await db
        .insert(itemTable)
        .values({
          stageId,
          itemType: input.itemType,
          itemRefId: input.itemRefId,
          sortOrder: input.sortOrder,
          comment: input.comment,
          localComment: null,
          settings: input.settings ?? undefined,
          snapshot: input.snapshot,
          completedAt: null,
          isActionable: input.isActionable ?? null,
          status: input.status ?? "active",
        })
        .returning();
      if (!irow) return null;
      await touchInstanceUpdatedAt(db, instanceId);
      return mapItem(irow);
    },

    async patchInstanceStageItem(
      instanceId: string,
      itemId: string,
      patch: {
        status?: TreatmentProgramInstanceStageItemStatus;
        isActionable?: boolean | null;
      },
    ) {
      const db = getDrizzle();
      const itemRow = await db.query.treatmentProgramInstanceStageItems.findFirst({
        where: eq(itemTable.id, itemId),
      });
      if (!itemRow) return null;
      const stageRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, itemRow.stageId),
      });
      if (!stageRow || stageRow.instanceId !== instanceId) return null;

      const rowPatch: Partial<typeof itemTable.$inferInsert> = {};
      if (patch.status !== undefined) rowPatch.status = patch.status;
      if (patch.isActionable !== undefined) rowPatch.isActionable = patch.isActionable;

      if (Object.keys(rowPatch).length === 0) return mapItem(itemRow);

      const [updated] = await db
        .update(itemTable)
        .set(rowPatch)
        .where(eq(itemTable.id, itemId))
        .returning();
      if (updated) await touchInstanceUpdatedAt(db, instanceId);
      return updated ? mapItem(updated) : null;
    },

    async patchInstanceStageItemWithEvent(
      instanceId: string,
      itemId: string,
      patch: {
        status?: TreatmentProgramInstanceStageItemStatus;
        isActionable?: boolean | null;
      },
      eventInput: AppendTreatmentProgramEventInput,
    ) {
      if (eventInput.instanceId !== instanceId) {
        throw new Error("patchInstanceStageItemWithEvent: event instanceId mismatch");
      }
      const rowPatch: Partial<typeof itemTable.$inferInsert> = {};
      if (patch.status !== undefined) rowPatch.status = patch.status;
      if (patch.isActionable !== undefined) rowPatch.isActionable = patch.isActionable;
      if (Object.keys(rowPatch).length === 0) return null;

      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const itemRow = await tx.query.treatmentProgramInstanceStageItems.findFirst({
          where: eq(itemTable.id, itemId),
        });
        if (!itemRow) return null;
        const stageRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, itemRow.stageId),
        });
        if (!stageRow || stageRow.instanceId !== instanceId) return null;

        const [updated] = await tx
          .update(itemTable)
          .set(rowPatch)
          .where(eq(itemTable.id, itemId))
          .returning();
        if (!updated) return null;

        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));

        await tx.insert(eventTable).values({
          instanceId: eventInput.instanceId,
          actorId: eventInput.actorId,
          eventType: eventInput.eventType,
          targetType: eventInput.targetType,
          targetId: eventInput.targetId,
          payload: eventInput.payload ?? {},
          reason: eventInput.reason ?? null,
        });

        return mapItem(updated);
      });
    },

    async replaceInstanceStageItem(
      instanceId: string,
      itemId: string,
      input: ReplaceTreatmentProgramInstanceStageItemInput,
    ) {
      const db = getDrizzle();
      const itemRow = await db.query.treatmentProgramInstanceStageItems.findFirst({
        where: eq(itemTable.id, itemId),
      });
      if (!itemRow) return null;
      const stRow = await db.query.treatmentProgramInstanceStages.findFirst({
        where: eq(stageTable.id, itemRow.stageId),
      });
      if (!stRow || stRow.instanceId !== instanceId) return null;
      const [updated] = await db
        .update(itemTable)
        .set({
          itemType: input.itemType,
          itemRefId: input.itemRefId,
          sortOrder: input.sortOrder ?? itemRow.sortOrder,
          comment: input.comment === undefined ? itemRow.comment : input.comment,
          settings: input.settings === undefined ? itemRow.settings : input.settings,
          snapshot: input.snapshot,
          completedAt: null,
          status: "active",
          isActionable: null,
        })
        .where(eq(itemTable.id, itemId))
        .returning();
      if (!updated) return null;
      await touchInstanceUpdatedAt(db, instanceId);
      return mapItem(updated);
    },

    async reorderInstanceStages(instanceId: string, orderedStageIds: string[]) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const stagesRows = await tx
          .select({ id: stageTable.id })
          .from(stageTable)
          .where(eq(stageTable.instanceId, instanceId));
        const idSet = new Set(stagesRows.map((r) => r.id));
        if (!sameIdSet(orderedStageIds, idSet)) return false;
        for (let i = 0; i < orderedStageIds.length; i++) {
          await tx
            .update(stageTable)
            .set({ sortOrder: i })
            .where(eq(stageTable.id, orderedStageIds[i]!));
        }
        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));
        return true;
      });
    },

    async reorderInstanceStageItems(instanceId: string, stageId: string, orderedItemIds: string[]) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const stRow = await tx.query.treatmentProgramInstanceStages.findFirst({
          where: eq(stageTable.id, stageId),
        });
        if (!stRow || stRow.instanceId !== instanceId) return false;
        const itemRows = await tx
          .select({ id: itemTable.id })
          .from(itemTable)
          .where(eq(itemTable.stageId, stageId));
        const idSet = new Set(itemRows.map((r) => r.id));
        if (!sameIdSet(orderedItemIds, idSet)) return false;
        for (let i = 0; i < orderedItemIds.length; i++) {
          await tx
            .update(itemTable)
            .set({ sortOrder: i })
            .where(eq(itemTable.id, orderedItemIds[i]!));
        }
        await tx
          .update(instTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(instTable.id, instanceId));
        return true;
      });
    },
  };
}
