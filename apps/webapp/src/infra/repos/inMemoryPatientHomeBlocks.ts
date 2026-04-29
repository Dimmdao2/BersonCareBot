import type {
  PatientHomeBlockItemRecord,
  PatientHomeBlockRecord,
  PatientHomeBlocksPort,
} from "@/modules/patient-home/ports";
import {
  PATIENT_HOME_CMS_BLOCK_CODES,
  type PatientHomeCmsBlockCode,
} from "@/modules/patient-home/blocks";

function seedBlocks(): PatientHomeBlockRecord[] {
  return PATIENT_HOME_CMS_BLOCK_CODES.map((code, i) => ({
    id: `mem-phb-${code}`,
    code,
    isVisible: true,
    sortOrder: i,
  }));
}

export function createInMemoryPatientHomeBlocksPort(): PatientHomeBlocksPort {
  const blocks = new Map<string, PatientHomeBlockRecord>(seedBlocks().map((b) => [b.id, b]));
  const codeToId = new Map<PatientHomeCmsBlockCode, string>(
    [...blocks.values()].map((b) => [b.code, b.id] as const),
  );
  const items = new Map<string, PatientHomeBlockItemRecord>();

  const listJoined = (): Array<{ block: PatientHomeBlockRecord; items: PatientHomeBlockItemRecord[] }> => {
    return PATIENT_HOME_CMS_BLOCK_CODES.map((code) => {
      const bid = codeToId.get(code)!;
      const b = blocks.get(bid)!;
      const its = [...items.values()]
        .filter((it) => it.blockId === bid)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return { block: b, items: its };
    });
  };

  return {
    async listCmsBlocksWithItems() {
      return listJoined();
    },
    async setBlockVisibleByCode(code, isVisible) {
      const id = codeToId.get(code);
      if (!id) return;
      const cur = blocks.get(id);
      if (cur) blocks.set(id, { ...cur, isVisible });
    },
    async setItemVisible(itemId, isVisible) {
      const cur = items.get(itemId);
      if (cur) items.set(itemId, { ...cur, isVisible });
    },
    async deleteItem(itemId) {
      items.delete(itemId);
    },
    async reorderItemsInBlock(blockCode, orderedItemIds) {
      const bid = codeToId.get(blockCode);
      if (!bid) return;
      const allowed = new Set(
        [...items.values()].filter((it) => it.blockId === bid).map((it) => it.id),
      );
      for (let i = 0; i < orderedItemIds.length; i += 1) {
        const id = orderedItemIds[i]!;
        if (!allowed.has(id)) throw new Error("reorder_items_invalid_id");
        const cur = items.get(id);
        if (cur) items.set(id, { ...cur, sortOrder: i });
      }
    },
    async insertItem(blockCode, input) {
      const bid = codeToId.get(blockCode);
      if (!bid) throw new Error("patient_home_block_missing");
      const its = [...items.values()].filter((it) => it.blockId === bid);
      const nextOrder = its.length === 0 ? 0 : Math.max(...its.map((x) => x.sortOrder)) + 1;
      const id = `mem-phbi-${blockCode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const row: PatientHomeBlockItemRecord = {
        id,
        blockId: bid,
        sortOrder: nextOrder,
        isVisible: true,
        targetType: input.targetType,
        targetRef: input.targetRef.trim(),
      };
      items.set(id, row);
      return id;
    },
    async findItemWithBlockCode(itemId) {
      const it = items.get(itemId);
      if (!it) return null;
      const blk = [...blocks.values()].find((b) => b.id === it.blockId);
      if (!blk) return null;
      return { ...it, blockCode: blk.code };
    },
  };
}

/** Vitest / пустой режим без таблиц `patient_home_*`. */
export const inMemoryPatientHomeBlocksPort: PatientHomeBlocksPort = createInMemoryPatientHomeBlocksPort();
