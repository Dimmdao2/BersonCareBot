import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/system-settings/appDisplayTimezone", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/system-settings/appDisplayTimezone")>();
  return {
    ...actual,
    getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
  };
});
import { createInMemoryPatientDailyWarmupPresentationPort } from "@/infra/repos/inMemoryPatientDailyWarmupPresentation";
import { buildDailyWarmupPresentationSyncDeps } from "@/modules/patient-home/buildDailyWarmupPresentationSyncDeps";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import type { SystemSetting } from "@/modules/system-settings/types";
import {
  getPatientHomeTodayConfig,
  parsePatientHomeDailyPracticeTarget,
  resolveDailyWarmupPickIndex,
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
    expect(out.dailyWarmupItem?.page?.slug).toBe("ok");
  });

  it("guest tier returns first warmup without calling getLatestCompleted", async () => {
    const getLatestCompletedContentPageId = vi.fn(async () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
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
    const out = await getPatientHomeTodayConfig(deps, { tier: "guest" });
    expect(out.dailyWarmupItem?.page?.slug).toBe("warm-a");
    expect(getLatestCompletedContentPageId).not.toHaveBeenCalled();
  });

  it("no_tier returns first warmup without calling getLatestCompleted", async () => {
    const getLatestCompletedContentPageId = vi.fn(async () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
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
    const out = await getPatientHomeTodayConfig(deps, { tier: "no_tier" });
    expect(out.dailyWarmupItem?.page?.slug).toBe("warm-a");
    expect(getLatestCompletedContentPageId).not.toHaveBeenCalled();
  });

  it("patient tier shows next after last completed on home; push targets page after home pick", async () => {
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
    const buildSync = (lastCompleted: string | null, port = createInMemoryPatientDailyWarmupPresentationPort()) => {
      const getLatest = vi.fn(async () => lastCompleted);
      const syncDeps = buildDailyWarmupPresentationSyncDeps({
        ...deps,
        patientDailyWarmupPresentation: port,
        patientPractice: { getLatestDailyWarmupCompletedContentPageId: getLatest },
        patientCalendarTimezone: { getIanaForUser: async () => "Europe/Moscow" },
      });
      const pickCtx = { tier: "patient" as const, userId: "user-1", getLatestCompletedContentPageId: getLatest };
      return { syncDeps, pickCtx, port, getLatest };
    };

    const noneCtx = buildSync(null);
    const none = await getPatientHomeTodayConfig(deps, noneCtx.pickCtx, noneCtx.syncDeps);
    expect(none.dailyWarmupItem?.page?.slug).toBe("warm-a");

    const firstCtx = buildSync("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const afterFirst = await getPatientHomeTodayConfig(deps, firstCtx.pickCtx, firstCtx.syncDeps);
    expect(afterFirst.dailyWarmupItem?.page?.slug).toBe("warm-b");

    const presentedPort = createInMemoryPatientDailyWarmupPresentationPort();
    await presentedPort.upsertPresentationState("user-1", {
      contentPageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      lastRotationAt: new Date().toISOString(),
      skipNextScheduledRotation: false,
    });
    const presentedCtx = buildSync("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", presentedPort);
    const afterPresented = await getPatientHomeTodayConfig(deps, presentedCtx.pickCtx, presentedCtx.syncDeps);
    expect(afterPresented.dailyWarmupItem?.page?.slug).toBe("warm-b");

    const pushPick = await resolveDailyWarmupPickIndex(
      [
        { contentPageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        { contentPageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      ],
      presentedCtx.pickCtx,
      "push_reminder",
      presentedCtx.syncDeps,
    );
    expect(pushPick).toBe(0);
  });

  it("patient tier falls back to first when last completed is not in list", async () => {
    const getBySlug = vi.fn(async (slug: string) =>
      slug === "warm-a" ?
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          slug: "warm-a",
          title: "warm-a",
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
          ]),
        ],
      },
      contentPages: { getBySlug },
      contentSections: warmSection,
      systemSettings: { getSetting: async () => null },
    };
    const out = await getPatientHomeTodayConfig(deps, {
      tier: "patient",
      userId: "user-1",
      getLatestCompletedContentPageId: async () => "removed-page-id",
    });
    expect(out.dailyWarmupItem?.page?.slug).toBe("warm-a");
    expect(out.dailyWarmupCount).toBe(1);
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
  });
});
