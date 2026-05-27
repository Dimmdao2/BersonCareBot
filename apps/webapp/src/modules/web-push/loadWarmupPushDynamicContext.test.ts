import { describe, expect, it, vi } from "vitest";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { loadWarmupPushDynamicContext } from "./loadWarmupPushDynamicContext";

function block(code: PatientHomeBlock["code"], items: PatientHomeBlockItem[]): PatientHomeBlock {
  return {
    code,
    title: code,
    description: "",
    isVisible: true,
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

describe("loadWarmupPushDynamicContext", () => {
  it("uses the same daily warmup title as home pick", async () => {
    const getLatest = vi.fn(async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const getBySlug = vi.fn(async (slug: string) =>
      slug === "warm-a" || slug === "warm-b" ?
        {
          id: slug === "warm-a" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          slug,
          title: slug === "warm-a" ? "Warm A" : "Warm B",
          summary: "",
          imageUrl: null,
          section: "warmups",
        }
      : null,
    );

    const homeDeps = {
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

    const getPresented = vi.fn(async () => null);
    const todayCfg = await getPatientHomeTodayConfig(homeDeps, {
      tier: "patient",
      userId: "user-1",
      getLatestCompletedContentPageId: getLatest,
      getPresentedContentPageId: getPresented,
    });

    const pushCtx = await loadWarmupPushDynamicContext("user-1", {
      listRulesByUser: async () => [],
      listPracticeCompletionsInRange: async () => [],
      patientHomeBlocks: homeDeps.patientHomeBlocks,
      contentPages: homeDeps.contentPages,
      contentSections: homeDeps.contentSections,
      getPatientCalendarIana: async () => null,
      getLatestDailyWarmupCompletedContentPageId: getLatest,
      getPresentedDailyWarmupContentPageId: getPresented,
    });

    expect(todayCfg.dailyWarmupItem?.page?.title).toBe("Warm A");
    expect(pushCtx.dailyWarmupTitle).toBe("Warm B");
  });
});
