import { describe, expect, it, vi } from "vitest";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import { buildDailyWarmupPresentationSyncDeps } from "@/modules/patient-home/buildDailyWarmupPresentationSyncDeps";
import { createInMemoryPatientDailyWarmupPresentationPort } from "@/infra/repos/inMemoryPatientDailyWarmupPresentation";
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

type BuildDepsOptions = {
  requiresAuthBySlug?: Partial<Record<"warm-a" | "warm-b", boolean>>;
  grantedSlugs?: string[];
};

function buildDeps(
  getLatestCompletedContentPageId: (userId: string) => Promise<string | null>,
  options: BuildDepsOptions = {},
) {
  const granted = new Set(options.grantedSlugs ?? []);
  const getBySlug = vi.fn(async (slug: string) =>
    slug === "warm-a" || slug === "warm-b" ?
      {
        id: slug === "warm-a" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        slug,
        title: slug,
        summary: "",
        imageUrl: null,
        section: "warmups",
        requiresAuth: options.requiresAuthBySlug?.[slug] ?? false,
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
    entitlements: {
      hasActiveContentGrant: vi.fn(async (_userId: string, slug: string) => granted.has(slug)),
    },
    patientPractice: { getLatestDailyWarmupCompletedContentPageId: getLatestCompletedContentPageId },
    patientDailyWarmupPresentation: createInMemoryPatientDailyWarmupPresentationPort(),
    patientCalendarTimezone: { getIanaForUser: async () => "Europe/Moscow" },
  };
}

describe("resolveDailyWarmupStartPathForPatient", () => {
  it("home uses next after last completed; reminder go uses next warmup for push", async () => {
    const getLatest = vi.fn(async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const deps = buildDeps(getLatest);
    const session = { user: { userId: "user-1", role: "client" as const, phone: "+79990001122" } };
    const presentationSyncDeps = buildDailyWarmupPresentationSyncDeps(deps);

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
      },
      presentationSyncDeps,
    );

    const homePath = await resolveDailyWarmupStartPathForPatient(deps as never, session as never, true, "home");
    const reminderPath = await resolveDailyWarmupStartPathForPatient(
      deps as never,
      session as never,
      true,
      "push_reminder",
    );
    expect(todayCfg.dailyWarmupItem?.page?.slug).toBe("warm-b");
    expect(homePath).toBe("/app/patient/content/warm-b?from=daily_warmup");
    expect(reminderPath).toBe("/app/patient/content/warm-a?from=daily_warmup");
  });

  it("falls back to first accessible warmup for no-tier patient", async () => {
    const getLatest = vi.fn(async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const deps = buildDeps(getLatest, {
      requiresAuthBySlug: { "warm-a": true, "warm-b": false },
    });
    const session = { user: { userId: "user-1", role: "client" as const, phone: null } };

    const path = await resolveDailyWarmupStartPathForPatient(deps as never, session as never, false, "home");
    expect(path).toBe("/app/patient/content/warm-b?from=daily_warmup");
  });
});
