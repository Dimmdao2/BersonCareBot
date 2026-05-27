import { describe, expect, it, vi } from "vitest";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { resolveDailyWarmupStartPathForPatient } from "./resolvePatientReminderGoTargets";

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

const warmupItems: PatientHomeBlockItem[] = [
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
];

function buildDeps(
  getLatestCompletedContentPageId: (userId: string) => Promise<string | null>,
  getPresentedContentPageId: (userId: string) => Promise<string | null> = async () => null,
) {
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
  return {
    patientHomeBlocks: {
      listBlocksWithItems: async () => [block("daily_warmup", warmupItems)],
    },
    contentPages: { getBySlug },
    contentSections: warmSection,
    systemSettings: { getSetting: async () => null },
    patientPractice: { getLatestDailyWarmupCompletedContentPageId: getLatestCompletedContentPageId },
    patientDailyWarmupPresentation: { getPresentedContentPageId, setPresentedContentPageId: async () => {} },
  };
}

describe("resolveDailyWarmupStartPathForPatient", () => {
  it("home uses last completed; reminder go uses next warmup for push", async () => {
    const getLatest = vi.fn(async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const deps = buildDeps(getLatest);
    const session = { user: { userId: "user-1", role: "client" as const, phone: "+79990001122" } };

    const todayCfg = await getPatientHomeTodayConfig(
      {
        patientHomeBlocks: deps.patientHomeBlocks,
        contentPages: deps.contentPages,
        contentSections: deps.contentSections,
        systemSettings: deps.systemSettings,
      },
      {
        tier: "patient",
        userId: session.user.userId,
        getLatestCompletedContentPageId: getLatest,
        getPresentedContentPageId: async () => null,
      },
    );

    const homePath = await resolveDailyWarmupStartPathForPatient(deps as never, session as never, true, "home");
    const reminderPath = await resolveDailyWarmupStartPathForPatient(
      deps as never,
      session as never,
      true,
      "push_reminder",
    );
    expect(todayCfg.dailyWarmupItem?.page?.slug).toBe("warm-a");
    expect(homePath).toBe("/app/patient/content/warm-a?from=daily_warmup");
    expect(reminderPath).toBe("/app/patient/content/warm-b?from=daily_warmup");
  });
});
