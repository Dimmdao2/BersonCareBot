import { describe, expect, it } from "vitest";
import { createInMemoryPatientHomeBlocksPort } from "@/infra/repos/inMemoryPatientHomeBlocks";
import { createPatientHomeBlocksService } from "./service";

function makeService(opts?: {
  pages?: Record<string, boolean>;
  sections?: Record<string, boolean>;
  courses?: Record<string, "published" | "draft">;
}) {
  const pages = opts?.pages ?? { "p-1": true };
  const sections = opts?.sections ?? { "s-1": true };
  const courses = opts?.courses ?? { "c-1": "published" };

  const port = createInMemoryPatientHomeBlocksPort();
  const service = createPatientHomeBlocksService({
    port,
    contentPages: {
      async listAll() {
        return Object.keys(pages).filter((k) => pages[k]).map((slug) => ({ slug, title: slug, summary: "", imageUrl: null }));
      },
      async getBySlug(slug: string) {
        return pages[slug] ? { slug } : null;
      },
    },
    contentSections: {
      async listAll() {
        return Object.keys(sections)
          .filter((k) => sections[k])
          .map((slug) => ({ slug, title: slug, description: "", iconImageUrl: null, coverImageUrl: null }));
      },
      async getBySlug(slug: string) {
        return sections[slug] ? { slug } : null;
      },
    },
    courses: {
      async listCoursesForDoctor() {
        return Object.entries(courses)
          .filter(([, st]) => st === "published")
          .map(([id]) => ({ id, title: id, description: null }));
      },
      async getCourseForDoctor(id: string) {
        const st = courses[id.trim()];
        if (!st) return null;
        return { id: id.trim(), status: st };
      },
    },
  });
  return { service, port };
}

describe("patient-home service", () => {
  it("allows visibility toggle for any block", async () => {
    const { service } = makeService();
    await expect(service.setBlockVisibility("booking", false)).resolves.toBeUndefined();
    await expect(service.setBlockVisibility("courses", true)).resolves.toBeUndefined();
  });

  it("enforces add-item block and target-type rules", async () => {
    const { service } = makeService();
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

  it("addItem rejects missing CMS page", async () => {
    const { service } = makeService();
    await expect(
      service.addItem({ blockCode: "daily_warmup", targetType: "content_page", targetRef: "nope", isVisible: true }),
    ).rejects.toThrow("target_content_page_not_found");
  });

  it("addItem rejects invalid course id format", async () => {
    const { service } = makeService();
    await expect(
      service.addItem({ blockCode: "courses", targetType: "course", targetRef: "not-uuid", isVisible: true }),
    ).rejects.toThrow("invalid_course_id");
  });

  it("requires complete known list for reorder blocks", async () => {
    const { service } = makeService();
    await expect(service.reorderBlocks(["daily_warmup", "booking"])).rejects.toThrow("invalid_block_count");
  });

  it("setBlockIcon updates supported blocks and clears with null", async () => {
    const { service, port } = makeService();
    await service.setBlockIcon("booking", "https://cdn.example/icon.png");
    let blocks = await port.listBlocksWithItems();
    expect(blocks.find((b) => b.code === "booking")?.iconImageUrl).toBe("https://cdn.example/icon.png");
    await service.setBlockIcon("booking", null);
    blocks = await port.listBlocksWithItems();
    expect(blocks.find((b) => b.code === "booking")?.iconImageUrl).toBeNull();
  });

  it("setBlockIcon rejects unsupported blocks", async () => {
    const { service } = makeService();
    await expect(service.setBlockIcon("daily_warmup", "https://x")).rejects.toThrow("block_icon_not_supported");
  });

  it("retarget updates target_ref when CMS target exists", async () => {
    const { service, port } = makeService();
    const id = await port.addItem({
      blockCode: "situations",
      targetType: "content_section",
      targetRef: "missing-sec",
      isVisible: true,
    });
    await expect(
      service.updateItem(id, { targetRef: "s-1", targetType: "content_section" }),
    ).resolves.toBeUndefined();
    const blocks = await service.listBlocksWithItems();
    const item = blocks.find((b) => b.code === "situations")?.items.find((i) => i.id === id);
    expect(item?.targetRef).toBe("s-1");
  });

  it("retarget rejects unknown item id", async () => {
    const { service } = makeService();
    await expect(
      service.updateItem("00000000-0000-0000-0000-000000000099", { targetRef: "s-1" }),
    ).rejects.toThrow("unknown_item");
  });

  it("retarget rejects invalid target type for block", async () => {
    const { service } = makeService();
    const id = await service.addItem({
      blockCode: "daily_warmup",
      targetType: "content_page",
      targetRef: "p-1",
      isVisible: true,
    });
    await expect(service.updateItem(id, { targetType: "content_section", targetRef: "s-1" })).rejects.toThrow(
      "invalid_target_type_for_block",
    );
  });

  it("retarget rejects missing CMS page", async () => {
    const { service } = makeService();
    const id = await service.addItem({
      blockCode: "daily_warmup",
      targetType: "content_page",
      targetRef: "p-1",
      isVisible: true,
    });
    await expect(service.updateItem(id, { targetRef: "nope" })).rejects.toThrow("target_content_page_not_found");
  });

  it("retarget rejects invalid course id format", async () => {
    const { service, port } = makeService();
    const id = await port.addItem({
      blockCode: "courses",
      targetType: "course",
      targetRef: "c-1",
      isVisible: true,
    });
    await expect(service.updateItem(id, { targetRef: "not-a-uuid" })).rejects.toThrow("invalid_course_id");
  });
});
