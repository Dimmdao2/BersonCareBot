import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const listBlocksWithItemsMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn(() => {
    throw new Error("NEXT_PERMANENT_REDIRECT");
  }),
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: vi.fn(async () => null),
}));

vi.mock("@/modules/platform-access", () => ({
  resolvePatientCanViewAuthOnlyContent: vi.fn(async () => false),
}));

vi.mock("@/infra/repos/resolvePatientContentSectionSlug", () => ({
  resolvePatientContentSectionSlug: vi.fn(async () => ({
    canonicalSlug: "warmups",
    section: {
      id: "00000000-0000-4000-8000-000000000101",
      slug: "warmups",
      title: "Разминки",
      description: "",
      sortOrder: 0,
      isVisible: true,
      requiresAuth: false,
      systemParentCode: "warmups",
    },
  })),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      getBySlug: vi.fn(),
      getRedirectNewSlugForOldSlug: vi.fn(),
    },
    contentPages: { listBySection: vi.fn(async () => []) },
    patientHomeBlocks: { listBlocksWithItems: listBlocksWithItemsMock },
    courses: { getCourseForDoctor: vi.fn() },
  }),
}));

import PatientSectionPage from "./page";
import { routePaths } from "@/app-layer/routes/paths";

describe("PatientSectionPage /warmups", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    listBlocksWithItemsMock.mockClear();
  });

  it("redirects warmups section to daily warmup go route", async () => {
    await expect(PatientSectionPage({ params: Promise.resolve({ slug: "warmups" }) })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirectMock).toHaveBeenCalledWith(routePaths.patientGoDailyWarmup);
    expect(listBlocksWithItemsMock).not.toHaveBeenCalled();
  });
});
