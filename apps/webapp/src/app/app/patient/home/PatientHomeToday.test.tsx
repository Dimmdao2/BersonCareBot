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
const listBlocksWithItems = vi.fn();
const contentSectionsGetBySlug = vi.fn();
const contentPagesGetBySlug = vi.fn();
const coursesGetCourseForDoctor = vi.fn();
const getProgress = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientHomeBlocks: { listBlocksWithItems },
    contentSections: { getBySlug: contentSectionsGetBySlug },
    contentPages: { getBySlug: contentPagesGetBySlug },
    courses: { getCourseForDoctor: coursesGetCourseForDoctor },
    reminders: { listRulesByUser },
    treatmentProgramInstance: { listForPatient },
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
    patientPractice: { getProgress },
  }),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn().mockResolvedValue("Europe/Moscow"),
}));

vi.mock("@/modules/patient-home/todayConfig", () => ({
  getPatientHomeTodayConfig: vi.fn(),
}));

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
      homeBlock("booking", 20, []),
      homeBlock("situations", 30, [homeItem("i-s", "situations", "content_section", "fixture-section-a", 0)]),
      homeBlock("progress", 40, []),
      homeBlock("mood_checkin", 50, []),
      homeBlock("next_reminder", 60, []),
      homeBlock("plan", 70, []),
    ]);

    contentPagesGetBySlug.mockImplementation(async (slug: string) => {
      if (slug === "fixture-warmup-page") {
        return {
          slug,
          title: "Fixture warmup",
          summary: "Summary",
          requiresAuth: false,
          imageUrl: "/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
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
        };
      }
      return null;
    });

    coursesGetCourseForDoctor.mockResolvedValue(null);
    listRulesByUser.mockResolvedValue([]);
    listForPatient.mockResolvedValue([]);
    getProgress.mockResolvedValue({ todayDone: 1, todayTarget: 3, streak: 2 });
  });

  it("anonymous guest: no personal API, login drilldown on warmup, no progress block", async () => {
    const tree = await PatientHomeToday({ session: null, personalTierOk: false, canViewAuthOnlyContent: false });
    render(tree);

    expect(listRulesByUser).not.toHaveBeenCalled();
    expect(listForPatient).not.toHaveBeenCalled();

    expect(screen.queryByText(/Fixture User/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Прогресс$/ })).toBeNull();

    const start = screen.getByRole("link", { name: /Начать разминку/i });
    expect(start.getAttribute("href")).toContain(`${routePaths.root}?next=`);
    expect(start.getAttribute("href")).toContain(encodeURIComponent("/app/patient/content/"));

    expect(screen.queryByRole("img")).toBeNull();
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

    expect(screen.queryByText(/Fixture User/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Активировать профиль/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Прогресс$/ })).toBeNull();
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

    expect(screen.getByText(/Здравствуйте, Fixture User/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Прогресс$/ })).toBeInTheDocument();
  });
});
