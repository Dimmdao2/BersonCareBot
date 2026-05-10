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
    iconImageUrl: null,
    items,
  };
}

const warmSection = {
  getBySlug: vi.fn(async (slug: string) =>
    slug === "warmups" ?
      { slug: "warmups", kind: "system" as const, systemParentCode: "warmups" as const }
    : null,
  ),
};

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
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.dailyWarmupItem).toBeNull();
    expect(out.practiceTarget).toBe(3);
    expect(out.allDailyWarmupsInCooldown).toBe(false);
    expect(out.allDailyWarmupsCooldownMinutesRemaining).toBeNull();
    expect(deps.contentPages.getBySlug).not.toHaveBeenCalled();
  });

  it("resolves first visible warmup item to published page", async () => {
    const getBySlug = vi.fn().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "warm-1",
      title: "Warm",
      summary: "S",
      imageUrl: null,
      section: "warmups",
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
      contentSections: warmSection,
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
    expect(out.allDailyWarmupsInCooldown).toBe(false);
    expect(out.dailyWarmupItem?.page?.slug).toBe("warm-1");
    expect(out.dailyWarmupItem?.page?.contentPageId).toBe("11111111-1111-4111-8111-111111111111");
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
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    getBySlug.mockImplementation(async (slug: string) =>
      slug === "ok" ?
        {
          id: "22222222-2222-4222-8222-222222222222",
          slug: "ok",
          title: "OK",
          summary: "",
          imageUrl: null,
          section: "warmups",
        }
      : null,
    );
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.allDailyWarmupsInCooldown).toBe(false);
    expect(out.dailyWarmupItem?.page?.slug).toBe("ok");
  });

  it("rotates visible warmup items by weekday index", async () => {
    const getBySlug = vi.fn(async (slug: string) =>
      slug === "warm-a" || slug === "warm-b" ?
        {
          id: slug === "warm-a" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          slug,
          title: slug,
          summary: "",
          imageUrl: null,
          section: "warmups",
        }
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
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    const monday = await getPatientHomeTodayConfig(deps, 0);
    expect(monday.allDailyWarmupsInCooldown).toBe(false);
    expect(monday.dailyWarmupItem?.page?.slug).toBe("warm-a");
    const tuesday = await getPatientHomeTodayConfig(deps, 1);
    expect(tuesday.allDailyWarmupsInCooldown).toBe(false);
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
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps);
    expect(out.dailyWarmupItem).toBeNull();
    expect(out.allDailyWarmupsInCooldown).toBe(false);
    expect(out.allDailyWarmupsCooldownMinutesRemaining).toBeNull();
  });

  it("warmupPick skips items in hero cooldown and returns next available", async () => {
    const getBySlug = vi.fn(async (slug: string) => {
      if (slug === "warm-a") {
        return {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          slug: "warm-a",
          title: "A",
          summary: "",
          imageUrl: null,
          section: "warmups",
        };
      }
      if (slug === "warm-b") {
        return {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          slug: "warm-b",
          title: "B",
          summary: "",
          imageUrl: null,
          section: "warmups",
        };
      }
      return null;
    });
    const getDailyWarmupHeroCooldownMeta = vi.fn(async (_userId: string, contentPageId: string) => {
      if (contentPageId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
        return { active: true, minutesRemaining: 12 };
      }
      return { active: false };
    });
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
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps, 0, {
      userId: "user-1",
      getDailyWarmupHeroCooldownMeta,
      cooldownMinutes: 60,
    });
    expect(out.dailyWarmupItem?.page?.slug).toBe("warm-b");
    expect(out.allDailyWarmupsInCooldown).toBe(false);
  });

  it("warmupPick when every candidate is in cooldown returns null and aggregate minutes", async () => {
    const getBySlug = vi.fn(async (slug: string) => ({
      id: slug === "warm-a" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      slug,
      title: slug,
      summary: "",
      imageUrl: null,
      section: "warmups",
    }));
    const getDailyWarmupHeroCooldownMeta = vi.fn(async (_userId: string, contentPageId: string) => {
      if (contentPageId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
        return { active: true, minutesRemaining: 10 };
      }
      return { active: true, minutesRemaining: 5 };
    });
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
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps, 0, {
      userId: "user-1",
      getDailyWarmupHeroCooldownMeta,
      cooldownMinutes: 60,
    });
    expect(out.dailyWarmupItem).toBeNull();
    expect(out.allDailyWarmupsInCooldown).toBe(true);
    expect(out.allDailyWarmupsCooldownMinutesRemaining).toBe(5);
  });
});
