/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AppSession } from "@/shared/types/session";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { PatientHomeToday } from "./PatientHomeToday";
import { routePaths } from "@/app-layer/routes/paths";

const listRulesByUser = vi.fn();
const listForPatient = vi.fn();
const getInstanceForPatient = vi.fn();
const patientPlanUpdatedBadgeForInstance = vi.fn();
const patientCalendarGetIanaForUser = vi.fn();
const listChecklistDoneToday = vi.fn();
const listBlocksWithItems = vi.fn();
const contentSectionsGetBySlug = vi.fn();
const contentPagesGetBySlug = vi.fn();
const coursesGetCourseForDoctor = vi.fn();
const getProgress = vi.fn();
const getCheckinState = vi.fn();
const getWeekSparkline = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientHomeBlocks: { listBlocksWithItems },
    contentSections: { getBySlug: contentSectionsGetBySlug },
    contentPages: { getBySlug: contentPagesGetBySlug },
    courses: { getCourseForDoctor: coursesGetCourseForDoctor },
    reminders: { listRulesByUser, getReminderMutedUntil: vi.fn().mockResolvedValue(null) },
    treatmentProgramInstance: {
      listForPatient,
      getInstanceForPatient,
      patientPlanUpdatedBadgeForInstance,
    },
    patientCalendarTimezone: { getIanaForUser: patientCalendarGetIanaForUser },
    treatmentProgramPatientActions: { listChecklistDoneToday },
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
    patientPractice: { getProgress },
    patientMood: { getCheckinState, getWeekSparkline },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn().mockResolvedValue("Europe/Moscow"),
}));

vi.mock("@/modules/patient-home/todayConfig", () => ({
  getPatientHomeTodayConfig: vi.fn(),
}));

function emptyChecklistTodaySnapshot() {
  return {
    doneItemIds: [] as string[],
    doneTodayCountByItemId: {} as Record<string, number>,
    lastDoneAtIsoByItemId: {} as Record<string, string>,
    totalCompletionEventsByItemId: {} as Record<string, number>,
    doneTodayCountByActivityKey: {} as Record<string, number>,
    lastDoneAtIsoByActivityKey: {} as Record<string, string>,
  };
}

function homeItem(
  id: string,
  blockCode: PatientHomeBlock["code"],
  targetType: PatientHomeBlockItem["targetType"],
  targetRef: string,
  sortOrder: number,
): PatientHomeBlockItem {
  return {
    id,
    blockCode,
    targetType,
    targetRef,
    titleOverride: null,
    subtitleOverride: null,
    imageUrlOverride: null,
    badgeLabel: null,
    isVisible: true,
    sortOrder,
  };
}

function homeBlock(code: PatientHomeBlock["code"], sortOrder: number, items: PatientHomeBlockItem[]): PatientHomeBlock {
  return {
    code,
    title: code,
    description: "",
    isVisible: true,
    sortOrder,
    iconImageUrl: null,
    items,
  };
}

const fixtureSession: AppSession = {
  user: {
    userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    role: "client",
    displayName: "Fixture User",
    phone: "+70000000000",
    bindings: {},
  },
  issuedAt: 0,
  expiresAt: Number.MAX_SAFE_INTEGER,
};

describe("PatientHomeToday", () => {
  beforeEach(() => {
    vi.mocked(getPatientHomeTodayConfig).mockResolvedValue({
      dailyWarmupItem: {
        blockItem: homeItem("i-w", "daily_warmup", "content_page", "fixture-warmup-page", 0),
        page: {
          slug: "fixture-warmup-page",
          title: "Fixture warmup",
          summary: "Summary",
          imageUrl: "/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      },
      practiceTarget: 3,
    });

    listBlocksWithItems.mockResolvedValue([
      homeBlock("daily_warmup", 10, [homeItem("i-w", "daily_warmup", "content_page", "fixture-warmup-page", 0)]),
      homeBlock("useful_post", 15, []),
      homeBlock("booking", 20, []),
      homeBlock("situations", 30, [homeItem("i-s", "situations", "content_section", "fixture-section-a", 0)]),
      homeBlock("progress", 40, []),
      homeBlock("mood_checkin", 50, []),
      homeBlock("next_reminder", 60, []),
      homeBlock("plan", 70, []),
      homeBlock("courses", 80, []),
    ]);

    contentPagesGetBySlug.mockImplementation(async (slug: string) => {
      if (slug === "fixture-warmup-page") {
        return {
          slug,
          title: "Fixture warmup",
          summary: "Summary",
          requiresAuth: false,
          imageUrl: "/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          section: "warmups",
        };
      }
      return null;
    });

    contentSectionsGetBySlug.mockImplementation(async (slug: string) => {
      if (slug === "fixture-section-a") {
        return {
          slug,
          title: "Fixture section",
          description: "",
          isVisible: true,
          requiresAuth: false,
          iconImageUrl: null,
          coverImageUrl: null,
          kind: "system" as const,
          systemParentCode: "situations" as const,
        };
      }
      if (slug === "warmups") {
        return {
          slug: "warmups",
          title: "Warmups",
          description: "",
          isVisible: true,
          requiresAuth: false,
          iconImageUrl: null,
          coverImageUrl: null,
          kind: "system" as const,
          systemParentCode: "warmups" as const,
        };
      }
      return null;
    });

    coursesGetCourseForDoctor.mockResolvedValue(null);
    listRulesByUser.mockResolvedValue([]);
    listForPatient.mockResolvedValue([]);
    getInstanceForPatient.mockResolvedValue(null);
    patientPlanUpdatedBadgeForInstance.mockResolvedValue({ show: false });
    patientCalendarGetIanaForUser.mockResolvedValue(null);
    listChecklistDoneToday.mockResolvedValue(emptyChecklistTodaySnapshot());
    getProgress.mockResolvedValue({ todayDone: 1, todayTarget: 3, streak: 2 });
    getCheckinState.mockResolvedValue({
      mood: { moodDate: "2026-04-28", score: 4 },
      lastEntry: { id: "e1", recordedAt: "2026-04-28T10:00:00.000Z", score: 4 },
    });
    getWeekSparkline.mockResolvedValue([]);
  });

  it("anonymous guest: no personal API, login drilldown on warmup, shows personal blocks with guest CTAs", async () => {
    const tree = await PatientHomeToday({ session: null, personalTierOk: false, canViewAuthOnlyContent: false });
    render(tree);

    expect(listRulesByUser).not.toHaveBeenCalled();
    expect(listForPatient).not.toHaveBeenCalled();
    expect(getProgress).not.toHaveBeenCalled();
    expect(getCheckinState).not.toHaveBeenCalled();

    expect(screen.queryByText(/Fixture User/i)).toBeNull();
    expect(screen.getByRole("heading", { name: /Сегодня выполнено/i })).toBeInTheDocument();
    expect(screen.getByText(/Как вы себя чувствуете/i)).toHaveProperty("tagName", "H3");
    expect(screen.getByText(/Напоминания не настроены/i)).toBeInTheDocument();
    expect(screen.queryByText(/Пока нет курсов на главной/i)).toBeNull();

    const start = screen.getByRole("link", { name: /Начать разминку/i });
    expect(start.getAttribute("href")).toContain(`${routePaths.root}?next=`);
    expect(start.getAttribute("href")).toContain(encodeURIComponent("/app/patient/content/"));

    expect(screen.queryByRole("img")).toBeNull();

    const loginReminder = screen
      .getAllByRole("link", { name: /^Войти$/i })
      .find((link) => link.getAttribute("href")?.includes(encodeURIComponent(routePaths.patientReminders)));
    expect(loginReminder?.getAttribute("href")).toContain(encodeURIComponent(routePaths.patientReminders));
  });

  it("authorized without tier: no personal API, activation copy, no name in greeting", async () => {
    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: false,
      canViewAuthOnlyContent: false,
    });
    render(tree);

    expect(listRulesByUser).not.toHaveBeenCalled();
    expect(listForPatient).not.toHaveBeenCalled();
    expect(getProgress).not.toHaveBeenCalled();
    expect(getCheckinState).not.toHaveBeenCalled();

    expect(screen.queryByText(/Fixture User/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Активировать профиль/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Сегодня выполнено/i })).toBeInTheDocument();
    expect(screen.getByText(/Как вы себя чувствуете/i)).toHaveProperty("tagName", "H3");
    for (const link of screen.getAllByRole("link", { name: /Настроить/i })) {
      expect(link).toHaveAttribute("href", routePaths.patientReminders);
    }
    expect(screen.queryByRole("link", { name: /К каталогу курсов/i })).toBeNull();
  });

  it("patient tier: calls personal loaders and shows progress", async () => {
    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(listRulesByUser).toHaveBeenCalledWith(fixtureSession.user.userId);
    expect(listForPatient).toHaveBeenCalledWith(fixtureSession.user.userId);
    expect(getProgress).toHaveBeenCalled();
    expect(getCheckinState).toHaveBeenCalledWith(fixtureSession.user.userId, "Europe/Moscow");
    expect(getWeekSparkline).toHaveBeenCalledWith(fixtureSession.user.userId, "Europe/Moscow");

    expect(screen.getByRole("heading", { name: /Fixture User!/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Сегодня выполнено/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Самочувствие 4 из 5/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("patient tier: renders useful post link when block has a content_page item", async () => {
    listBlocksWithItems.mockResolvedValue([
      homeBlock("daily_warmup", 10, [homeItem("i-w", "daily_warmup", "content_page", "fixture-warmup-page", 0)]),
      homeBlock("useful_post", 15, [homeItem("i-up", "useful_post", "content_page", "fixture-useful-post", 0)]),
      homeBlock("booking", 20, []),
      homeBlock("situations", 30, [homeItem("i-s", "situations", "content_section", "fixture-section-a", 0)]),
      homeBlock("progress", 40, []),
      homeBlock("mood_checkin", 50, []),
      homeBlock("next_reminder", 60, []),
      homeBlock("plan", 70, []),
      homeBlock("courses", 80, []),
    ]);

    contentPagesGetBySlug.mockImplementation(async (slug: string) => {
      if (slug === "fixture-warmup-page") {
        return {
          slug,
          title: "Fixture warmup",
          summary: "Summary",
          requiresAuth: false,
          imageUrl: "/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          section: "warmups",
        };
      }
      if (slug === "fixture-useful-post") {
        return {
          slug,
          title: "Статья для главной",
          summary: "",
          requiresAuth: false,
          imageUrl: null,
          section: "article-home",
        };
      }
      return null;
    });

    contentSectionsGetBySlug.mockImplementation(async (slug: string) => {
      if (slug === "fixture-section-a") {
        return {
          slug,
          title: "Fixture section",
          description: "",
          isVisible: true,
          requiresAuth: false,
          iconImageUrl: null,
          coverImageUrl: null,
          kind: "system" as const,
          systemParentCode: "situations" as const,
        };
      }
      if (slug === "warmups") {
        return {
          slug: "warmups",
          title: "Warmups",
          description: "",
          isVisible: true,
          requiresAuth: false,
          iconImageUrl: null,
          coverImageUrl: null,
          kind: "system" as const,
          systemParentCode: "warmups" as const,
        };
      }
      if (slug === "article-home") {
        return {
          slug: "article-home",
          title: "Articles",
          description: "",
          isVisible: true,
          requiresAuth: false,
          iconImageUrl: null,
          coverImageUrl: null,
          kind: "article" as const,
          systemParentCode: null,
        };
      }
      return null;
    });

    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    const link = screen.getByRole("link", { name: /Статья для главной/i });
    expect(link).toHaveAttribute("href", "/app/patient/content/fixture-useful-post");
  });
});
