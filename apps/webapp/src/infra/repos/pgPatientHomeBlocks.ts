import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { patientHomeBlockItems, patientHomeBlocks } from "../../../db/schema/patientHome";
import type {
  PatientHomeBlockItemRecord,
  PatientHomeBlockRecord,
  PatientHomeBlocksPort,
} from "@/modules/patient-home/ports";
import {
  PATIENT_HOME_CMS_BLOCK_CODES,
  type PatientHomeBlockItemTargetType,
  type PatientHomeCmsBlockCode,
} from "@/modules/patient-home/blocks";

function assertCmsBlockCode(code: string): code is PatientHomeCmsBlockCode {
  return (PATIENT_HOME_CMS_BLOCK_CODES as readonly string[]).includes(code);
}

function mapBlock(row: typeof patientHomeBlocks.$inferSelect): PatientHomeBlockRecord {
  if (!assertCmsBlockCode(row.code)) {
    throw new Error(`Unexpected patient_home_blocks.code: ${row.code}`);
  }
  return {
    id: row.id,
    code: row.code,
    isVisible: row.isVisible,
    sortOrder: row.sortOrder,
  };
}

function mapItem(row: typeof patientHomeBlockItems.$inferSelect): PatientHomeBlockItemRecord {
  const tt = row.targetType as PatientHomeBlockItemTargetType;
  return {
    id: row.id,
    blockId: row.blockId,
    sortOrder: row.sortOrder,
    isVisible: row.isVisible,
    targetType: tt,
    targetRef: row.targetRef,
  };
}

export function createPgPatientHomeBlocksPort(): PatientHomeBlocksPort {
  return {
    async listCmsBlocksWithItems() {
      const db = getDrizzle();
      const blocks = await db
        .select()
        .from(patientHomeBlocks)
        .where(inArray(patientHomeBlocks.code, [...PATIENT_HOME_CMS_BLOCK_CODES]))
        .orderBy(asc(patientHomeBlocks.sortOrder), asc(patientHomeBlocks.code));

      const items = await db
        .select()
        .from(patientHomeBlockItems)
        .where(
          inArray(
            patientHomeBlockItems.blockId,
            blocks.map((b) => b.id),
          ),
        )
        .orderBy(asc(patientHomeBlockItems.blockId), asc(patientHomeBlockItems.sortOrder), asc(patientHomeBlockItems.createdAt));

      const byBlock = new Map<string, PatientHomeBlockItemRecord[]>();
      for (const it of items) {
        const list = byBlock.get(it.blockId) ?? [];
        list.push(mapItem(it));
        byBlock.set(it.blockId, list);
      }

      return blocks.map((b) => ({
        block: mapBlock(b),
        items: byBlock.get(b.id) ?? [],
      }));
    },

    async setBlockVisibleByCode(code, isVisible) {
      const db = getDrizzle();
      await db
        .update(patientHomeBlocks)
        .set({ isVisible, updatedAt: sql`now()` })
        .where(eq(patientHomeBlocks.code, code));
    },

    async setItemVisible(itemId, isVisible) {
      const db = getDrizzle();
      await db
        .update(patientHomeBlockItems)
        .set({ isVisible, updatedAt: sql`now()` })
        .where(eq(patientHomeBlockItems.id, itemId));
    },

    async deleteItem(itemId) {
      const db = getDrizzle();
      await db.delete(patientHomeBlockItems).where(eq(patientHomeBlockItems.id, itemId));
    },

    async reorderItemsInBlock(blockCode, orderedItemIds) {
      const db = getDrizzle();
      const blk = await db.select().from(patientHomeBlocks).where(eq(patientHomeBlocks.code, blockCode)).limit(1);
      const block = blk[0];
      if (!block) return;

      const existing = await db
        .select({ id: patientHomeBlockItems.id })
        .from(patientHomeBlockItems)
        .where(eq(patientHomeBlockItems.blockId, block.id));

      const allowed = new Set(existing.map((r) => r.id));
      for (let i = 0; i < orderedItemIds.length; i += 1) {
        const id = orderedItemIds[i]!;
        if (!allowed.has(id)) {
          throw new Error("reorder_items_invalid_id");
        }
        await db
          .update(patientHomeBlockItems)
          .set({ sortOrder: i, updatedAt: sql`now()` })
          .where(and(eq(patientHomeBlockItems.id, id), eq(patientHomeBlockItems.blockId, block.id)));
      }
    },

    async insertItem(blockCode, input) {
      const db = getDrizzle();
      const blk = await db.select().from(patientHomeBlocks).where(eq(patientHomeBlocks.code, blockCode)).limit(1);
      const block = blk[0];
      if (!block) throw new Error("patient_home_block_missing");

      const [{ m }] = await db
        .select({ m: sql<number>`coalesce(max(${patientHomeBlockItems.sortOrder}), -1)` })
        .from(patientHomeBlockItems)
        .where(eq(patientHomeBlockItems.blockId, block.id));

      const nextOrder = Number(m) + 1;

      const rows = await db
        .insert(patientHomeBlockItems)
        .values({
          blockId: block.id,
          sortOrder: nextOrder,
          isVisible: true,
          targetType: input.targetType,
          targetRef: input.targetRef.trim(),
        })
        .returning({ id: patientHomeBlockItems.id });

      const id = rows[0]?.id;
      if (!id) throw new Error("patient_home_item_insert_failed");
      return id;
    },

    async findItemWithBlockCode(itemId) {
      const db = getDrizzle();
      const rows = await db
        .select({
          item: patientHomeBlockItems,
          code: patientHomeBlocks.code,
        })
        .from(patientHomeBlockItems)
        .innerJoin(patientHomeBlocks, eq(patientHomeBlockItems.blockId, patientHomeBlocks.id))
        .where(eq(patientHomeBlockItems.id, itemId))
        .limit(1);

      const r = rows[0];
      if (!r || !assertCmsBlockCode(r.code)) return null;
      return { ...mapItem(r.item), blockCode: r.code };
    },
  };
}
