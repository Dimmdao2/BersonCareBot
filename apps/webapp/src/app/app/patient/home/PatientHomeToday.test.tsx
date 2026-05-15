/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { AppSession } from "@/shared/types/session";
import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import type { ReminderRule } from "@/modules/reminders/types";
import { getPatientHomeTodayConfig } from "@/modules/patient-home/todayConfig";
import { PatientHomeToday } from "./PatientHomeToday";
import { routePaths } from "@/app-layer/routes/paths";
import { DateTime } from "luxon";

const listRulesByUser = vi.fn();
const listForPatient = vi.fn();
const getInstanceForPatient = vi.fn();
const patientPlanUpdatedBadgeForInstance = vi.fn();
const patientCalendarGetIanaForUser = vi.fn();
const listChecklistDoneToday = vi.fn();
const listLocalDoneDateKeysForRecentDays = vi.fn();
const listBlocksWithItems = vi.fn();
const contentSectionsGetBySlug = vi.fn();
const contentPagesGetBySlug = vi.fn();
const coursesGetCourseForDoctor = vi.fn();
const getProgress = vi.fn();
const getDailyWarmupHeroCooldownMeta = vi.fn();
const listRecent = vi.fn();
const getCheckinState = vi.fn();
const getWeekSparkline = vi.fn();
const refresh = vi.fn();
const systemSettingsGetSetting = vi.hoisted(() => vi.fn().mockImplementation(async () => null));
const getReminderMutedUntil = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientHomeBlocks: { listBlocksWithItems },
    contentSections: {
      getBySlug: contentSectionsGetBySlug,
      getRedirectNewSlugForOldSlug: vi.fn().mockResolvedValue(null),
    },
    contentPages: { getBySlug: contentPagesGetBySlug },
    courses: { getCourseForDoctor: coursesGetCourseForDoctor },
    reminders: { listRulesByUser, getReminderMutedUntil },
    treatmentProgramInstance: {
      listForPatient,
      getInstanceForPatient,
      patientPlanUpdatedBadgeForInstance,
    },
    patientCalendarTimezone: { getIanaForUser: patientCalendarGetIanaForUser },
    treatmentProgramPatientActions: { listChecklistDoneToday, listLocalDoneDateKeysForRecentDays },
    systemSettings: { getSetting: systemSettingsGetSetting },
    patientPractice: { getProgress, getDailyWarmupHeroCooldownMeta, listRecent },
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

/** Shared fixtures for patient-tier reminder math on home (warmups section + rehab slots). */
function reminderRulesWarmupsSectionPlusRehab(): ReminderRule[] {
  return [
    {
      id: "warmups-section-rule",
      integratorUserId: "i1",
      category: "lfk",
      enabled: true,
      intervalMinutes: 60,
      windowStartMinute: 9 * 60,
      windowEndMinute: 10 * 60,
      daysMask: "1111111",
      timezone: "Europe/Moscow",
      fallbackEnabled: true,
      linkedObjectType: "content_section",
      linkedObjectId: "warmups",
      customTitle: null,
      customText: null,
      scheduleType: "interval_window",
      scheduleData: null,
      reminderIntent: "warmup",
      displayTitle: null,
      displayDescription: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
      notificationTopicCode: "exercise_reminders",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    {
      id: "rehab-rule",
      integratorUserId: "i1",
      category: "lfk",
      enabled: true,
      intervalMinutes: null,
      windowStartMinute: 0,
      windowEndMinute: 0,
      daysMask: "1111111",
      timezone: "Europe/Moscow",
      fallbackEnabled: true,
      linkedObjectType: "rehab_program",
      linkedObjectId: "program-1",
      customTitle: null,
      customText: null,
      scheduleType: "slots_v1",
      scheduleData: { timesLocal: ["12:00"], dayFilter: "weekly_mask", daysMask: "1111111" },
      reminderIntent: "exercises",
      displayTitle: null,
      displayDescription: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
      notificationTopicCode: "exercise_reminders",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
  ];
}

function reminderRulesProgressTargetFour(): ReminderRule[] {
  return [
    ...reminderRulesWarmupsSectionPlusRehab(),
    {
      id: "custom-rule",
      integratorUserId: "i1",
      category: "important",
      enabled: true,
      intervalMinutes: 60,
      windowStartMinute: 20 * 60,
      windowEndMinute: 20 * 60,
      daysMask: "1111111",
      timezone: "Europe/Moscow",
      fallbackEnabled: true,
      linkedObjectType: "custom",
      linkedObjectId: null,
      customTitle: "После прогулки",
      customText: null,
      scheduleType: "interval_window",
      scheduleData: null,
      reminderIntent: "generic",
      displayTitle: null,
      displayDescription: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
      notificationTopicCode: null,
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
  ];
}

describe("PatientHomeToday", () => {
  beforeEach(() => {
    vi.mocked(getPatientHomeTodayConfig).mockResolvedValue({
      dailyWarmupItem: {
        blockItem: homeItem("i-w", "daily_warmup", "content_page", "fixture-warmup-page", 0),
        page: {
          contentPageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          slug: "fixture-warmup-page",
          title: "Fixture warmup",
          summary: "Summary",
          imageUrl: "/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      },
      practiceTarget: 3,
      allDailyWarmupsInCooldown: false,
      allDailyWarmupsCooldownMinutesRemaining: null,
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
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
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
    listLocalDoneDateKeysForRecentDays.mockResolvedValue({ iana: "Europe/Moscow", dateKeys: [] });
    getProgress.mockResolvedValue({ todayDone: 1, todayTarget: 3, streak: 2 });
    getDailyWarmupHeroCooldownMeta.mockResolvedValue({ active: false });
    listRecent.mockResolvedValue([]);
    getCheckinState.mockResolvedValue({
      mood: { moodDate: "2026-04-28", score: 4 },
      lastEntry: { id: "e1", recordedAt: "2026-04-28T10:00:00.000Z", score: 4 },
    });
    getWeekSparkline.mockResolvedValue([]);
    getReminderMutedUntil.mockReset();
    getReminderMutedUntil.mockResolvedValue(null);
    systemSettingsGetSetting.mockReset();
    systemSettingsGetSetting.mockImplementation(async () => null);
  });

  it("anonymous guest: no personal API, login drilldown on warmup, shows personal blocks with guest CTAs", async () => {
    const tree = await PatientHomeToday({ session: null, personalTierOk: false, canViewAuthOnlyContent: false });
    render(tree);

    expect(listRulesByUser).not.toHaveBeenCalled();
    expect(listForPatient).not.toHaveBeenCalled();
    expect(getProgress).not.toHaveBeenCalled();
    expect(getDailyWarmupHeroCooldownMeta).not.toHaveBeenCalled();
    expect(getCheckinState).not.toHaveBeenCalled();

    expect(screen.queryByText(/Fixture User/i)).toBeNull();
    expect(screen.getByRole("heading", { name: /Сегодня выполнено/i })).toBeInTheDocument();
    expect(screen.getByText(/Как ваше сегодня/i)).toHaveProperty("tagName", "H3");
    expect(screen.getAllByText(/Напоминания не настроены/i).length).toBeGreaterThanOrEqual(1);
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
    expect(getProgress).toHaveBeenCalled();
    expect(getDailyWarmupHeroCooldownMeta).not.toHaveBeenCalled();
    expect(getCheckinState).not.toHaveBeenCalled();

    expect(screen.queryByText(/Fixture User/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Активировать профиль/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Сегодня выполнено/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Выполнено практик сегодня: 1, цель 3/)).toBeInTheDocument();
    expect(screen.getByText(/Как ваше сегодня/i)).toHaveProperty("tagName", "H3");
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
    expect(getDailyWarmupHeroCooldownMeta).toHaveBeenCalledWith(
      fixtureSession.user.userId,
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      60,
    );

    expect(screen.getByRole("heading", { name: /Fixture User!/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Сегодня выполнено/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Самочувствие 4 из 5/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("patient tier: passes warmup repeat cooldown minutes from system_settings into getDailyWarmupHeroCooldownMeta", async () => {
    systemSettingsGetSetting.mockImplementation(async (key: string) => {
      if (key === "patient_home_daily_warmup_repeat_cooldown_minutes") {
        return { valueJson: { value: 90 } };
      }
      if (key === "patient_home_warmup_skip_to_next_available_enabled") {
        return { valueJson: { value: true } };
      }
      return null;
    });
    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(getDailyWarmupHeroCooldownMeta).toHaveBeenCalledWith(
      fixtureSession.user.userId,
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      90,
    );
  });

  it("patient tier: warmup hero shows «Разминка выполнена» and cooldown caption when cooldown active", async () => {
    getDailyWarmupHeroCooldownMeta.mockResolvedValueOnce({ active: true, minutesAgo: 3, minutesRemaining: 17 });
    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(screen.getByRole("status", { name: /Разминка дня уже отмечена выполненной/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Начать разминку/i })).toBeNull();
    expect(screen.getByText(/Разминка будет доступна через 17 минут\./i)).toBeInTheDocument();
  });

  it("patient tier: progress reflects checklist completion even when practice progress is zero", async () => {
    getProgress.mockResolvedValueOnce({ todayDone: 0, todayTarget: 3, streak: 0 });
    listForPatient.mockResolvedValueOnce([
      {
        id: "inst-active-1",
        title: "Активный план",
        status: "active",
        updatedAt: "2026-04-28T10:00:00.000Z",
      },
    ]);
    getInstanceForPatient.mockResolvedValueOnce(null);
    listChecklistDoneToday.mockResolvedValueOnce({
      doneItemIds: ["item-1"],
      doneTodayCountByItemId: {},
      lastDoneAtIsoByItemId: {},
      totalCompletionEventsByItemId: {},
      doneTodayCountByActivityKey: {},
      lastDoneAtIsoByActivityKey: {},
    });

    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(screen.getByLabelText(/Выполнено практик сегодня: 1, цель 3/)).toBeInTheDocument();
    expect(listChecklistDoneToday).toHaveBeenCalledWith(fixtureSession.user.userId, "inst-active-1");
  });

  it("patient tier: streak is boosted by LFK completion dates", async () => {
    const today = DateTime.now().setZone("Europe/Moscow").toISODate()!;
    getProgress.mockResolvedValueOnce({ todayDone: 0, todayTarget: 3, streak: 0 });
    listLocalDoneDateKeysForRecentDays.mockResolvedValueOnce({ iana: "Europe/Moscow", dateKeys: [today] });

    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(screen.getByText(/^день$/)).toBeInTheDocument();
  });

  it("patient tier: progress target uses planned reminder total when warmups section reminder exists", async () => {
    listRulesByUser.mockResolvedValueOnce(reminderRulesProgressTargetFour());
    getProgress.mockResolvedValueOnce({ todayDone: 1, todayTarget: 3, streak: 2 });

    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(
      screen.getByLabelText(/^Выполнено практик сегодня: 1, цель 4, в плане разминок: 2, остальных: 2$/),
    ).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledWith(fixtureSession.user.userId, "Europe/Moscow", 4);
  });

  it("patient tier: mute zeros practice goal and hides warmup/LFK breakdown labels", async () => {
    getReminderMutedUntil.mockResolvedValueOnce("2099-01-01T12:00:00.000Z");
    listRulesByUser.mockResolvedValueOnce(reminderRulesWarmupsSectionPlusRehab());
    getProgress.mockResolvedValueOnce({ todayDone: 0, todayTarget: 0, streak: 1 });

    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(getReminderMutedUntil).toHaveBeenCalledWith(fixtureSession.user.userId);
    expect(getProgress).toHaveBeenCalledWith(fixtureSession.user.userId, "Europe/Moscow", 0);
    expect(screen.getByLabelText(/^Выполнено практик сегодня: 0, цель 0$/)).toBeInTheDocument();
    const progressArticle = document.getElementById("patient-home-progress-block");
    expect(progressArticle).not.toBeNull();
    expect(within(progressArticle as HTMLElement).queryByText(/^разминок:/)).toBeNull();
  });

  it("patient tier: uses admin practice target when reminders lack enabled warmups section rule", async () => {
    listRulesByUser.mockResolvedValueOnce([
      {
        id: "rehab-only",
        integratorUserId: "i1",
        category: "lfk",
        enabled: true,
        intervalMinutes: null,
        windowStartMinute: 0,
        windowEndMinute: 0,
        daysMask: "1111111",
        timezone: "Europe/Moscow",
        fallbackEnabled: true,
        linkedObjectType: "rehab_program",
        linkedObjectId: "program-1",
        customTitle: null,
        customText: null,
        scheduleType: "slots_v1",
        scheduleData: { timesLocal: ["12:00"], dayFilter: "weekly_mask", daysMask: "1111111" },
        reminderIntent: "exercises",
        displayTitle: null,
        displayDescription: null,
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
        notificationTopicCode: "exercise_reminders",
        updatedAt: "2026-04-28T00:00:00.000Z",
      },
    ]);
    getProgress.mockResolvedValueOnce({ todayDone: 1, todayTarget: 3, streak: 2 });

    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(screen.getByLabelText(/Выполнено практик сегодня: 1, цель 3/)).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledWith(fixtureSession.user.userId, "Europe/Moscow", 3);
  });

  it("patient tier: week sparkline uses saved calendar IANA when set", async () => {
    patientCalendarGetIanaForUser.mockResolvedValue("Asia/Yekaterinburg");
    const tree = await PatientHomeToday({
      session: fixtureSession,
      personalTierOk: true,
      canViewAuthOnlyContent: true,
    });
    render(tree);

    expect(getWeekSparkline).toHaveBeenCalledWith(fixtureSession.user.userId, "Asia/Yekaterinburg");
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
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
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
          id: "33333333-3333-4333-8333-333333333333",
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
