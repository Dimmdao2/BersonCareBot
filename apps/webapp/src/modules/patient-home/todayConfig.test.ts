import { describe, expect, it, vi } from "vitest";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import type { SystemSetting } from "@/modules/system-settings/types";
import {
  getPatientHomeTodayConfig,
  parsePatientHomeDailyPracticeTarget,
} from "@/modules/patient-home/todayConfig";

function block(code: PatientHomeBlock["code"], items: PatientHomeBlockItem[], isVisible = true): PatientHomeBlock {
  return {
    code,
    title: code,
    description: "",
    isVisible,
    sortOrder: 10,
    items,
  };
}

describe("parsePatientHomeDailyPracticeTarget", () => {
  it("defaults to 3 when missing", () => {
    expect(parsePatientHomeDailyPracticeTarget(null)).toBe(3);
    expect(parsePatientHomeDailyPracticeTarget({})).toBe(3);
  });

  it("reads wrapped value and clamps", () => {
    expect(parsePatientHomeDailyPracticeTarget({ value: 5 })).toBe(5);
    expect(parsePatientHomeDailyPracticeTarget({ value: 0 })).toBe(1);
    expect(parsePatientHomeDailyPracticeTarget({ value: 99 })).toBe(10);
    expect(parsePatientHomeDailyPracticeTarget({ value: "7" })).toBe(7);
  });
});

describe("getPatientHomeTodayConfig", () => {
  it("returns null warmup when block has no content_page items", async () => {
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: async () => [block("daily_warmup", [], true)],
      },
      contentPages: { getBySlug: vi.fn() },
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.dailyWarmupItem).toBeNull();
    expect(out.practiceTarget).toBe(3);
    expect(deps.contentPages.getBySlug).not.toHaveBeenCalled();
  });

  it("resolves first visible warmup item to published page", async () => {
    const getBySlug = vi.fn().mockResolvedValue({
      slug: "warm-1",
      title: "Warm",
      summary: "S",
      imageUrl: null,
    });
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: async () => [
          block("daily_warmup", [
            {
              id: "i1",
              blockCode: "daily_warmup",
              targetType: "content_page",
              targetRef: "warm-1",
              titleOverride: null,
              subtitleOverride: null,
              imageUrlOverride: null,
              badgeLabel: null,
              isVisible: true,
              sortOrder: 0,
            },
          ]),
        ],
      },
      contentPages: { getBySlug: getBySlug },
      systemSettings: {
        getSetting: async (): Promise<SystemSetting | null> => ({
          key: "patient_home_daily_practice_target",
          scope: "admin",
          valueJson: { value: 4 },
          updatedAt: "",
          updatedBy: null,
        }),
      },
    };
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.practiceTarget).toBe(4);
    expect(out.dailyWarmupItem?.page?.slug).toBe("warm-1");
    expect(getBySlug).toHaveBeenCalledWith("warm-1");
  });

  it("skips warmup item when getBySlug returns null", async () => {
    const getBySlug = vi.fn().mockResolvedValue(null);
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: async () => [
          block("daily_warmup", [
            {
              id: "i1",
              blockCode: "daily_warmup",
              targetType: "content_page",
              targetRef: "missing",
              titleOverride: null,
              subtitleOverride: null,
              imageUrlOverride: null,
              badgeLabel: null,
              isVisible: true,
              sortOrder: 0,
            },
            {
              id: "i2",
              blockCode: "daily_warmup",
              targetType: "content_page",
              targetRef: "ok",
              titleOverride: null,
              subtitleOverride: null,
              imageUrlOverride: null,
              badgeLabel: null,
              isVisible: true,
              sortOrder: 1,
            },
          ]),
        ],
      },
      contentPages: { getBySlug: getBySlug },
      systemSettings: { getSetting: async () => null },
    };
    getBySlug.mockImplementation(async (slug: string) =>
      slug === "ok" ? { slug: "ok", title: "OK", summary: "", imageUrl: null } : null,
    );
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.dailyWarmupItem?.page?.slug).toBe("ok");
  });

  it("rotates visible warmup items by weekday index", async () => {
    const getBySlug = vi.fn(async (slug: string) =>
      slug === "warm-a" || slug === "warm-b" ?
        { slug, title: slug, summary: "", imageUrl: null }
      : null,
    );
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: async () => [
          block("daily_warmup", [
            {
              id: "i1",
              blockCode: "daily_warmup",
              targetType: "content_page",
              targetRef: "warm-a",
              titleOverride: null,
              subtitleOverride: null,
              imageUrlOverride: null,
              badgeLabel: null,
              isVisible: true,
              sortOrder: 0,
            },
            {
              id: "i2",
              blockCode: "daily_warmup",
              targetType: "content_page",
              targetRef: "warm-b",
              titleOverride: null,
              subtitleOverride: null,
              imageUrlOverride: null,
              badgeLabel: null,
              isVisible: true,
              sortOrder: 1,
            },
          ]),
        ],
      },
      contentPages: { getBySlug },
      systemSettings: { getSetting: async () => null },
    };
    const monday = await getPatientHomeTodayConfig(deps, 0);
    expect(monday.dailyWarmupItem?.page?.slug).toBe("warm-a");
    const tuesday = await getPatientHomeTodayConfig(deps, 1);
    expect(tuesday.dailyWarmupItem?.page?.slug).toBe("warm-b");
  });

  it("returns null warmup when daily_warmup block hidden", async () => {
    const deps = {
      patientHomeBlocks: {
        listBlocksWithItems: async () => [
          block(
            "daily_warmup",
            [
              {
                id: "i1",
                blockCode: "daily_warmup",
                targetType: "content_page",
                targetRef: "x",
                titleOverride: null,
                subtitleOverride: null,
                imageUrlOverride: null,
                badgeLabel: null,
                isVisible: true,
                sortOrder: 0,
              },
            ],
            false,
          ),
        ],
      },
      contentPages: { getBySlug: vi.fn() },
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.dailyWarmupItem).toBeNull();
  });
});
