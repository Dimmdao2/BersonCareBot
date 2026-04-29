import { describe, expect, it } from "vitest";
import { createPatientHomeService, patientHomeBlockAllowsTargetType } from "@/modules/patient-home/service";
import { createInMemoryPatientHomeBlocksPort } from "@/infra/repos/inMemoryPatientHomeBlocks";
import { createInMemoryContentSectionsPort } from "@/infra/repos/pgContentSections";
import { inMemoryContentPagesPort } from "@/infra/repos/pgContentPages";
import { createInMemoryCoursesPort } from "@/infra/repos/inMemoryCourses";

describe("patient-home service", () => {
  it("patientHomeBlockAllowsTargetType matches block contracts", () => {
    expect(patientHomeBlockAllowsTargetType("situations", "content_section")).toBe(true);
    expect(patientHomeBlockAllowsTargetType("situations", "content_page")).toBe(false);
    expect(patientHomeBlockAllowsTargetType("daily_warmup", "content_page")).toBe(true);
    expect(patientHomeBlockAllowsTargetType("courses", "course")).toBe(true);
  });

  it("addCmsBlockItem rejects duplicate targets", async () => {
    const blocks = createInMemoryPatientHomeBlocksPort();
    const sections = createInMemoryContentSectionsPort();
    await sections.upsert({
      slug: "office",
      title: "Офис",
      description: "",
      sortOrder: 0,
      isVisible: true,
      requiresAuth: false,
    });
    const courses = createInMemoryCoursesPort();
    const svc = createPatientHomeService({
      blocks,
      contentSections: sections,
      contentPages: inMemoryContentPagesPort,
      courses,
    });
    await svc.addCmsBlockItem("situations", "content_section", "office");
    await expect(svc.addCmsBlockItem("situations", "content_section", "office")).rejects.toThrow("duplicate_block_item");
  });
});
