import { beforeEach, describe, expect, it, vi } from "vitest";

const permanentRedirectMock = vi.hoisted(() => vi.fn());
const resolveMock = vi.hoisted(() => vi.fn());
const listBySectionMock = vi.hoisted(() => vi.fn(async () => []));
const listBlocksWithItemsMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: (url: string) => {
    permanentRedirectMock(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/infra/repos/resolvePatientContentSectionSlug", () => ({
  resolvePatientContentSectionSlug: (...args: unknown[]) => resolveMock(...args),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  getOptionalPatientSession: vi.fn(async () => null),
  patientRscPersonalDataGate: vi.fn(),
}));

vi.mock("@/modules/platform-access", () => ({
  resolvePatientCanViewAuthOnlyContent: vi.fn(async () => false),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentSections: {
      getBySlug: vi.fn(),
      getRedirectNewSlugForOldSlug: vi.fn(),
    },
    contentPages: {
      listBySection: listBySectionMock,
    },
    patientHomeBlocks: {
      listBlocksWithItems: listBlocksWithItemsMock,
    },
    reminders: {
      listRulesByUser: vi.fn(async () => []),
    },
  }),
}));

import PatientSectionPage from "./page";

const sectionRow = {
  id: "00000000-0000-4000-8000-000000000101",
  slug: "canonical",
  title: "Title",
  description: "",
  sortOrder: 0,
  isVisible: true,
  requiresAuth: false,
  coverImageUrl: null,
  iconImageUrl: null,
};

describe("PatientSectionPage slug redirect", () => {
  beforeEach(() => {
    permanentRedirectMock.mockClear();
    resolveMock.mockReset();
    listBySectionMock.mockClear();
    listBlocksWithItemsMock.mockClear();
  });

  it("calls permanentRedirect when canonical slug differs from URL", async () => {
    resolveMock.mockResolvedValue({
      canonicalSlug: "canonical",
      section: sectionRow,
    });

    await expect(PatientSectionPage({ params: Promise.resolve({ slug: "legacy" }) })).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(permanentRedirectMock).toHaveBeenCalledWith("/app/patient/sections/canonical");
    expect(resolveMock).toHaveBeenCalled();
  });

  it("uses canonical slug when URL slug is current", async () => {
    resolveMock.mockResolvedValue({
      canonicalSlug: "canonical",
      section: sectionRow,
    });

    await PatientSectionPage({ params: Promise.resolve({ slug: "canonical" }) });

    expect(permanentRedirectMock).not.toHaveBeenCalled();
    expect(listBySectionMock).toHaveBeenCalledWith("canonical", { viewAuthOnlyPages: false });
    expect(listBlocksWithItemsMock).toHaveBeenCalled();
  });
});
