import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientHomeBlockItems, patientHomeBlocks } from "../../../db/schema";
import type {
  PatientHomeBlock,
  PatientHomeBlockItem,
  PatientHomeBlockItemAddInput,
  PatientHomeBlockItemPatch,
  PatientHomeBlockItemTargetType,
  PatientHomeBlocksPort,
} from "@/modules/patient-home/ports";

function mapItem(row: typeof patientHomeBlockItems.$inferSelect): PatientHomeBlockItem {
  return {
    id: row.id,
    blockCode: row.blockCode as PatientHomeBlock["code"],
    targetType: row.targetType as PatientHomeBlockItemTargetType,
    targetRef: row.targetRef,
    titleOverride: row.titleOverride,
    subtitleOverride: row.subtitleOverride,
    imageUrlOverride: row.imageUrlOverride,
    badgeLabel: row.badgeLabel,
    isVisible: row.isVisible,
    sortOrder: row.sortOrder,
  };
}

export function createPgPatientHomeBlocksPort(): PatientHomeBlocksPort {
  return {
    async listBlocksWithItems() {
      const db = getDrizzle();
      const [blocks, items] = await Promise.all([
        db.select().from(patientHomeBlocks).orderBy(asc(patientHomeBlocks.sortOrder), asc(patientHomeBlocks.code)),
        db.select().from(patientHomeBlockItems).orderBy(asc(patientHomeBlockItems.sortOrder), asc(patientHomeBlockItems.id)),
      ]);
      const itemsByBlock = new Map<string, PatientHomeBlockItem[]>();
      for (const row of items) {
        const arr = itemsByBlock.get(row.blockCode) ?? [];
        arr.push(mapItem(row));
        itemsByBlock.set(row.blockCode, arr);
      }
      return blocks.map((row) => ({
        code: row.code as PatientHomeBlock["code"],
        title: row.title,
        description: row.description,
        isVisible: row.isVisible,
        sortOrder: row.sortOrder,
        iconImageUrl: row.iconImageUrl ?? null,
        items: itemsByBlock.get(row.code) ?? [],
      }));
    },

    async setBlockVisibility(code, visible) {
      const db = getDrizzle();
      await db
        .update(patientHomeBlocks)
        .set({ isVisible: visible, updatedAt: sql`now()` })
        .where(eq(patientHomeBlocks.code, code));
    },

    async setBlockIcon(code, iconImageUrl) {
      const db = getDrizzle();
      await db
        .update(patientHomeBlocks)
        .set({ iconImageUrl, updatedAt: sql`now()` })
        .where(eq(patientHomeBlocks.code, code));
    },

    async reorderBlocks(orderedCodes) {
      const db = getDrizzle();
      await db.transaction(async (tx) => {
        for (let i = 0; i < orderedCodes.length; i += 1) {
          await tx
            .update(patientHomeBlocks)
            .set({ sortOrder: i + 1, updatedAt: sql`now()` })
            .where(eq(patientHomeBlocks.code, orderedCodes[i]!));
        }
      });
    },

    async addItem(input: PatientHomeBlockItemAddInput) {
      const db = getDrizzle();
      const sortOrder =
        input.sortOrder ??
        ((
          await db
            .select({ maxSort: sql<number>`coalesce(max(${patientHomeBlockItems.sortOrder}), 0)` })
            .from(patientHomeBlockItems)
            .where(eq(patientHomeBlockItems.blockCode, input.blockCode))
        )[0]?.maxSort ?? 0) +
          1;
      const rows = await db
        .insert(patientHomeBlockItems)
        .values({
          blockCode: input.blockCode,
          targetType: input.targetType,
          targetRef: input.targetRef,
          titleOverride: input.titleOverride ?? null,
          subtitleOverride: input.subtitleOverride ?? null,
          imageUrlOverride: input.imageUrlOverride ?? null,
          badgeLabel: input.badgeLabel ?? null,
          isVisible: input.isVisible ?? true,
          sortOrder,
        })
        .returning({ id: patientHomeBlockItems.id });
      return rows[0]?.id ?? "";
    },

    async getItemById(id) {
      const db = getDrizzle();
      const rows = await db.select().from(patientHomeBlockItems).where(eq(patientHomeBlockItems.id, id)).limit(1);
      const row = rows[0];
      return row ? mapItem(row) : null;
    },

    async updateItem(id, patch: PatientHomeBlockItemPatch) {
      const db = getDrizzle();
      const setPayload: Partial<typeof patientHomeBlockItems.$inferInsert> = {
        updatedAt: sql`now()` as unknown as string,
      };
      if (patch.titleOverride !== undefined) setPayload.titleOverride = patch.titleOverride;
      if (patch.subtitleOverride !== undefined) setPayload.subtitleOverride = patch.subtitleOverride;
      if (patch.imageUrlOverride !== undefined) setPayload.imageUrlOverride = patch.imageUrlOverride;
      if (patch.badgeLabel !== undefined) setPayload.badgeLabel = patch.badgeLabel;
      if (patch.isVisible !== undefined) setPayload.isVisible = patch.isVisible;
      if (patch.sortOrder !== undefined) setPayload.sortOrder = patch.sortOrder;
      if (patch.targetRef !== undefined) setPayload.targetRef = patch.targetRef;
      if (patch.targetType !== undefined) setPayload.targetType = patch.targetType;
      const updated = await db
        .update(patientHomeBlockItems)
        .set(setPayload)
        .where(eq(patientHomeBlockItems.id, id))
        .returning({ id: patientHomeBlockItems.id });
      if (updated.length === 0) {
        throw new Error("unknown_item");
      }
    },

    async deleteItem(id) {
      const db = getDrizzle();
      const deleted = await db
        .delete(patientHomeBlockItems)
        .where(eq(patientHomeBlockItems.id, id))
        .returning({ id: patientHomeBlockItems.id });
      if (deleted.length === 0) {
        throw new Error("unknown_item");
      }
    },

    async reorderItems(blockCode, orderedItemIds) {
      const db = getDrizzle();
      await db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: patientHomeBlockItems.id })
          .from(patientHomeBlockItems)
          .where(and(eq(patientHomeBlockItems.blockCode, blockCode), inArray(patientHomeBlockItems.id, orderedItemIds)));
        if (rows.length !== orderedItemIds.length) {
          throw new Error("reorder_items_block_mismatch");
        }
        for (let i = 0; i < orderedItemIds.length; i += 1) {
          await tx
            .update(patientHomeBlockItems)
            .set({ sortOrder: i + 1, updatedAt: sql`now()` })
            .where(and(eq(patientHomeBlockItems.id, orderedItemIds[i]!), eq(patientHomeBlockItems.blockCode, blockCode)));
        }
      });
    },
  };
}
