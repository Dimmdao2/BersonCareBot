import { describe, expect, it, vi } from "vitest";
import {
  buildPatientDailyWarmupNav,
  listDailyWarmupPagesForHome,
} from "./todayConfig";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";

function blockItem(id: string, slug: string, sortOrder: number): PatientHomeBlockItem {
  return {
    id,
    blockCode: "daily_warmup",
    targetType: "content_page",
    targetRef: slug,
    titleOverride: null,
    subtitleOverride: null,
    imageUrlOverride: null,
    badgeLabel: null,
    sortOrder,
    isVisible: true,
    showTitle: true,
  };
}

function warmupBlock(items: PatientHomeBlockItem[]): PatientHomeBlock {
  return {
    code: "daily_warmup",
    title: "Разминка дня",
    description: "",
    isVisible: true,
    sortOrder: 10,
    iconImageUrl: null,
    items,
  };
}

describe("listDailyWarmupPagesForHome", () => {
  it("returns pages in sortOrder and skips unpublished", async () => {
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: vi.fn(async () => [
          warmupBlock([
            blockItem("i-2", "warmup-b", 20),
            blockItem("i-1", "warmup-a", 10),
            blockItem("i-3", "missing", 30),
          ]),
        ]),
      },
      contentPages: {
        getBySlug: vi.fn(async (slug: string) => {
          if (slug === "warmup-a") {
            return {
              id: "p-a",
              slug: "warmup-a",
              title: "A",
              summary: "",
              imageUrl: null,
              section: "warmups",
            };
          }
          if (slug === "warmup-b") {
            return {
              id: "p-b",
              slug: "warmup-b",
              title: "B",
              summary: "",
              imageUrl: null,
              section: "warmups",
            };
          }
          return null;
        }),
      },
      contentSections: {
        getBySlug: vi.fn(async () => ({
          slug: "warmups",
          kind: "system" as const,
          systemParentCode: "warmups" as const,
        })),
      },
      systemSettings: { getSetting: vi.fn() },
    };

    const pages = await listDailyWarmupPagesForHome(deps);
    expect(pages.map((p) => p.slug)).toEqual(["warmup-a", "warmup-b"]);
  });

  it("returns empty when block hidden", async () => {
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: vi.fn(async () => [{ ...warmupBlock([]), isVisible: false }]),
      },
      contentPages: { getBySlug: vi.fn() },
      contentSections: { getBySlug: vi.fn() },
      systemSettings: { getSetting: vi.fn() },
    };
    await expect(listDailyWarmupPagesForHome(deps)).resolves.toEqual([]);
  });
});

describe("buildPatientDailyWarmupNav", () => {
  const pages = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];

  it("returns null for single page", () => {
    expect(buildPatientDailyWarmupNav("a", [{ slug: "a" }])).toBeNull();
  });

  it("builds cyclic prev/next hrefs with from=daily_warmup", () => {
    const nav = buildPatientDailyWarmupNav("b", pages);
    expect(nav).toEqual({
      index: 1,
      total: 3,
      prevHref: "/app/patient/content/a?from=daily_warmup",
      nextHref: "/app/patient/content/c?from=daily_warmup",
    });
  });

  it("wraps from first to last", () => {
    const nav = buildPatientDailyWarmupNav("a", pages);
    expect(nav?.prevHref).toContain("/content/c?");
    expect(nav?.nextHref).toContain("/content/b?");
  });
});
