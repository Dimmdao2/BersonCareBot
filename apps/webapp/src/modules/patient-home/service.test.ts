import { describe, expect, it } from "vitest";
import { createInMemoryPatientHomeBlocksPort } from "@/infra/repos/inMemoryPatientHomeBlocks";
import type { ContentSectionKind, SystemParentCode } from "@/modules/content-sections/types";
import { createPatientHomeBlocksService } from "./service";

type PageFixture = {
  slug: string;
  title?: string;
  summary?: string;
  section: string;
  isPublished?: boolean;
  archivedAt?: string | null;
  deletedAt?: string | null;
  missing?: boolean;
};

type SectionFixture = {
  slug: string;
  title?: string;
  description?: string;
  kind: ContentSectionKind;
  systemParentCode: SystemParentCode | null;
  missing?: boolean;
};

function makeService(opts?: {
  pages?: PageFixture[];
  sections?: SectionFixture[];
  courses?: Record<string, "published" | "draft">;
}) {
  const pages: PageFixture[] = opts?.pages ?? [
    {
      slug: "p-1",
      section: "warmups",
      title: "p-1",
      summary: "",
      isPublished: true,
      archivedAt: null,
      deletedAt: null,
    },
  ];
  const sections: SectionFixture[] = opts?.sections ?? [
    { slug: "warmups", kind: "system", systemParentCode: "warmups" },
    { slug: "s-1", kind: "system", systemParentCode: "situations" },
  ];
  const courses = opts?.courses ?? { "c-1": "published" };

  const port = createInMemoryPatientHomeBlocksPort();
  const service = createPatientHomeBlocksService({
    port,
    contentPages: {
      async listAll() {
        return pages
          .filter((p) => !p.missing)
          .map((p) => ({
            slug: p.slug,
            title: p.title ?? p.slug,
            summary: p.summary ?? "",
            imageUrl: null as string | null,
            section: p.section,
            isPublished: p.isPublished ?? true,
            archivedAt: p.archivedAt ?? null,
            deletedAt: p.deletedAt ?? null,
          }));
      },
      async getBySlug(slug: string) {
        const p = pages.find((x) => x.slug === slug && !x.missing);
        return p
          ? {
              slug: p.slug,
              section: p.section,
              isPublished: p.isPublished ?? true,
              archivedAt: p.archivedAt ?? null,
              deletedAt: p.deletedAt ?? null,
            }
          : null;
      },
    },
    contentSections: {
      async listAll() {
        return sections
          .filter((s) => !s.missing)
          .map((s) => ({
            slug: s.slug,
            title: s.title ?? s.slug,
            description: s.description ?? "",
            iconImageUrl: null as string | null,
            coverImageUrl: null as string | null,
            kind: s.kind,
            systemParentCode: s.systemParentCode,
          }));
      },
      async getBySlug(slug: string) {
        const s = sections.find((x) => x.slug === slug && !x.missing);
        return s ? { slug: s.slug, kind: s.kind, systemParentCode: s.systemParentCode } : null;
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

  it("addItem rejects page outside block taxonomy", async () => {
    const { service } = makeService({
      pages: [{ slug: "p-art", section: "articles", isPublished: true }],
      sections: [
        { slug: "articles", kind: "article", systemParentCode: null },
        { slug: "warmups", kind: "system", systemParentCode: "warmups" },
      ],
    });
    await expect(
      service.addItem({ blockCode: "daily_warmup", targetType: "content_page", targetRef: "p-art", isVisible: true }),
    ).rejects.toThrow("target_content_page_not_allowed_for_block");
  });

  it("addItem rejects section outside block taxonomy", async () => {
    const { service } = makeService({
      sections: [
        { slug: "warmups", kind: "system", systemParentCode: "warmups" },
        { slug: "s-1", kind: "system", systemParentCode: "situations" },
        { slug: "wrong", kind: "system", systemParentCode: "warmups" },
      ],
    });
    await expect(
      service.addItem({ blockCode: "situations", targetType: "content_section", targetRef: "wrong", isVisible: true }),
    ).rejects.toThrow("target_content_section_not_allowed_for_block");
  });

  it("listCandidatesForBlock filters SOS targets by cluster", async () => {
    const { service } = makeService({
      pages: [
        { slug: "p-sos", section: "sos-root", isPublished: true },
        { slug: "p-art", section: "articles", isPublished: true },
      ],
      sections: [
        { slug: "sos-root", kind: "system", systemParentCode: "sos" },
        { slug: "articles", kind: "article", systemParentCode: null },
        { slug: "sit-sec", kind: "system", systemParentCode: "situations" },
      ],
    });
    const c = await service.listCandidatesForBlock("sos");
    const keys = new Set(c.map((x) => `${x.targetType}:${x.targetRef}`));
    expect(keys.has("content_page:p-sos")).toBe(true);
    expect(keys.has("content_page:p-art")).toBe(false);
    expect(keys.has("content_section:sos-root")).toBe(true);
    expect(keys.has("content_section:sit-sec")).toBe(false);
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
    await expect(service.setBlockIcon("useful_post", "https://x")).rejects.toThrow("block_icon_not_supported");
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

  it("patch-only updateItem rejects unknown item id", async () => {
    const { service } = makeService();
    await expect(
      service.updateItem("00000000-0000-0000-0000-000000000099", { isVisible: false }),
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
