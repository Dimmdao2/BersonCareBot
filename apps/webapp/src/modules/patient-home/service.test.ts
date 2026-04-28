import { describe, expect, it } from "vitest";
import { createPatientHomeBlocksService } from "./service";
import type {
  PatientHomeBlock,
  PatientHomeBlockCode,
  PatientHomeBlockItemAddInput,
  PatientHomeBlockItemPatch,
  PatientHomeBlocksPort,
} from "./ports";

function createInMemoryPatientHomeBlocksPort(): PatientHomeBlocksPort {
  const blocks = new Map<PatientHomeBlockCode, PatientHomeBlock>();
  return {
    async listBlocksWithItems() {
      return [...blocks.values()];
    },
    async setBlockVisibility() {},
    async reorderBlocks() {},
    async addItem(input: PatientHomeBlockItemAddInput) {
      return `mem-${input.blockCode}-${input.targetRef}`;
    },
    async updateItem(_id: string, _patch: PatientHomeBlockItemPatch) {},
    async deleteItem() {},
    async reorderItems() {},
  };
}

function makeService() {
  return createPatientHomeBlocksService({
    port: createInMemoryPatientHomeBlocksPort(),
    contentPages: {
      async listAll() {
        return [{ slug: "p-1", title: "Page 1", summary: "S", imageUrl: null }];
      },
    },
    contentSections: {
      async listAll() {
        return [{ slug: "s-1", title: "Section 1", description: "D", iconImageUrl: null, coverImageUrl: null }];
      },
    },
    courses: {
      async listCoursesForDoctor() {
        return [{ id: "c-1", title: "Course 1", description: null }];
      },
    },
  });
}

describe("patient-home service", () => {
  it("allows visibility toggle for any block", async () => {
    const service = makeService();
    await expect(service.setBlockVisibility("booking", false)).resolves.toBeUndefined();
    await expect(service.setBlockVisibility("courses", true)).resolves.toBeUndefined();
  });

  it("enforces add-item block and target-type rules", async () => {
    const service = makeService();
    await expect(
      service.addItem({ blockCode: "daily_warmup", targetType: "content_page", targetRef: "p-1" }),
    ).resolves.toBeTypeOf("string");
    await expect(
      service.addItem({ blockCode: "booking", targetType: "static_action", targetRef: "booking" }),
    ).rejects.toThrow("items_not_supported_for_block");
    await expect(
      service.addItem({ blockCode: "situations", targetType: "content_page", targetRef: "p-1" }),
    ).rejects.toThrow("invalid_target_type_for_block");
  });

  it("requires complete known list for reorder blocks", async () => {
    const service = makeService();
    await expect(service.reorderBlocks(["daily_warmup", "booking"])).rejects.toThrow("invalid_block_count");
  });
});
