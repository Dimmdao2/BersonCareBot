import { describe, expect, it, vi, beforeEach } from "vitest";

const permanentRedirectMock = vi.hoisted(() => vi.fn());
const resolveMock = vi.hoisted(() => vi.fn());
const listBySectionMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const e = new Error("NEXT_NOT_FOUND");
    throw e;
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

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    contentPages: {
      listBySection: listBySectionMock,
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
};

describe("PatientSectionPage — slug redirect (Phase 4)", () => {
  beforeEach(() => {
    permanentRedirectMock.mockClear();
    resolveMock.mockReset();
    listBySectionMock.mockClear();
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

  it("does not redirect when URL slug is already canonical", async () => {
    resolveMock.mockResolvedValue({
      canonicalSlug: "canonical",
      section: sectionRow,
    });
    await PatientSectionPage({ params: Promise.resolve({ slug: "canonical" }) });
    expect(permanentRedirectMock).not.toHaveBeenCalled();
    expect(listBySectionMock).toHaveBeenCalledWith("canonical", expect.any(Object));
  });
});
