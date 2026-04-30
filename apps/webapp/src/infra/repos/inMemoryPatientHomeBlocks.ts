import { randomUUID } from "node:crypto";
import type {
  PatientHomeBlock,
  PatientHomeBlockCode,
  PatientHomeBlockItem,
  PatientHomeBlockItemAddInput,
  PatientHomeBlockItemPatch,
  PatientHomeBlocksPort,
} from "@/modules/patient-home/ports";
import { PATIENT_HOME_BLOCK_CODES } from "@/modules/patient-home/blocks";

const defaultTitles: Record<PatientHomeBlockCode, string> = {
  daily_warmup: "Разминка дня",
  useful_post: "Полезный пост",
  booking: "Запись на приём",
  situations: "Ситуации",
  progress: "Прогресс",
  next_reminder: "Следующее напоминание",
  mood_checkin: "Самочувствие",
  sos: "Если болит сейчас",
  plan: "Мой план",
  subscription_carousel: "Материалы по подписке",
  courses: "Курсы",
};

export function createInMemoryPatientHomeBlocksPort(): PatientHomeBlocksPort {
  const blocks = new Map<PatientHomeBlockCode, PatientHomeBlock>();
  const items = new Map<string, PatientHomeBlockItem>();

  for (let i = 0; i < PATIENT_HOME_BLOCK_CODES.length; i += 1) {
    const code = PATIENT_HOME_BLOCK_CODES[i]!;
    blocks.set(code, {
      code,
      title: defaultTitles[code],
      description: "",
      isVisible: true,
      sortOrder: i + 1,
      iconImageUrl: null,
      items: [],
    });
  }

  const syncItems = () => {
    for (const block of blocks.values()) {
      block.items = [...items.values()]
        .filter((item) => item.blockCode === block.code)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    }
  };

  return {
    async listBlocksWithItems() {
      syncItems();
      return [...blocks.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    },

    async setBlockVisibility(code, visible) {
      const block = blocks.get(code);
      if (!block) return;
      block.isVisible = visible;
    },

    async setBlockIcon(code, iconImageUrl) {
      const block = blocks.get(code);
      if (!block) {
        throw new Error(`unknown_patient_home_block_code:${code}`);
      }
      block.iconImageUrl = iconImageUrl;
    },

    async reorderBlocks(orderedCodes) {
      for (let i = 0; i < orderedCodes.length; i += 1) {
        const block = blocks.get(orderedCodes[i]!);
        if (block) block.sortOrder = i + 1;
      }
    },

    async addItem(input: PatientHomeBlockItemAddInput) {
      const id = randomUUID();
      const sortOrder =
        input.sortOrder ??
        Math.max(
          0,
          ...[...items.values()].filter((item) => item.blockCode === input.blockCode).map((item) => item.sortOrder),
        ) +
          1;
      items.set(id, {
        id,
        blockCode: input.blockCode,
        targetType: input.targetType,
        targetRef: input.targetRef,
        titleOverride: input.titleOverride ?? null,
        subtitleOverride: input.subtitleOverride ?? null,
        imageUrlOverride: input.imageUrlOverride ?? null,
        badgeLabel: input.badgeLabel ?? null,
        isVisible: input.isVisible ?? true,
        sortOrder,
      });
      return id;
    },

    async getItemById(id: string) {
      syncItems();
      return items.get(id) ?? null;
    },

    async updateItem(id: string, patch: PatientHomeBlockItemPatch) {
      const current = items.get(id);
      if (!current) throw new Error("unknown_item");
      items.set(id, { ...current, ...patch });
    },

    async deleteItem(id: string) {
      if (!items.has(id)) throw new Error("unknown_item");
      items.delete(id);
    },

    async reorderItems(blockCode: PatientHomeBlockCode, orderedItemIds: string[]) {
      for (let i = 0; i < orderedItemIds.length; i += 1) {
        const itemId = orderedItemIds[i]!;
        const current = items.get(itemId);
        if (!current || current.blockCode !== blockCode) {
          throw new Error("reorder_items_block_mismatch");
        }
        items.set(itemId, { ...current, sortOrder: i + 1 });
      }
    },
  };
}
