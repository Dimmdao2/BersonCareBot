import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";

const {
  revalidatePathMock,
  reorderQuotesMock,
  setQuoteActiveMock,
  setQuoteArchivedMock,
  upsertQuoteMock,
  requireDoctorWorkspaceContextMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  reorderQuotesMock: vi.fn(),
  setQuoteActiveMock: vi.fn(),
  setQuoteArchivedMock: vi.fn(),
  upsertQuoteMock: vi.fn(),
  requireDoctorWorkspaceContextMock: vi.fn(),
}));

const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}));

vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgres://unit-test",
  },
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceContext: requireDoctorWorkspaceContextMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorMotivationQuotesEditor: {
      reorderQuotes: reorderQuotesMock,
      setQuoteActive: setQuoteActiveMock,
      setQuoteArchived: setQuoteArchivedMock,
      upsertQuote: upsertQuoteMock,
    },
  }),
}));

import { reorderMotivationQuotes, setQuoteActive, setQuoteArchived, upsertMotivationQuote } from "./actions";

describe("motivation quote actions", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    reorderQuotesMock.mockReset();
    setQuoteActiveMock.mockReset();
    setQuoteArchivedMock.mockReset();
    upsertQuoteMock.mockReset();
    requireDoctorWorkspaceContextMock.mockReset();
    requireDoctorWorkspaceContextMock.mockResolvedValue({
      session: { user: { userId: "11111111-1111-4111-8111-111111111111" } },
      organizationId: ORGANIZATION_ID,
      membershipId: "33333333-3333-4333-8333-333333333333",
      membershipRole: "doctor",
      specialistId: "44444444-4444-4444-8444-444444444444",
      canManageOrganization: false,
      canManageAllSpecialists: false,
    });
    revalidatePathMock.mockImplementation(() => {
      expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    });
  });

  it("upserts a quote under the selected organization principal and clears context after action", async () => {
    upsertQuoteMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });

    const formData = new FormData();
    formData.set("id", "55555555-5555-4555-8555-555555555555");
    formData.set("body_text", "Keep going");
    formData.set("author", "Berson");
    formData.set("is_active", "on");
    formData.set("sort_order", "7");

    const result = await upsertMotivationQuote(null, formData);

    expect(result).toEqual({ ok: true });
    expect(upsertQuoteMock).toHaveBeenCalledWith({
      id: "55555555-5555-4555-8555-555555555555",
      bodyText: "Keep going",
      author: "Berson",
      isActive: true,
      sortOrder: 7,
    });
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/content/motivation");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/patient");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("archives a quote under the selected organization principal and clears context after action", async () => {
    setQuoteArchivedMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });

    const result = await setQuoteArchived("55555555-5555-4555-8555-555555555555", true);

    expect(result).toEqual({ ok: true });
    expect(setQuoteArchivedMock).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555", true);
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("sets quote activity under the selected organization principal and clears context after action", async () => {
    setQuoteActiveMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });

    const result = await setQuoteActive("55555555-5555-4555-8555-555555555555", false);

    expect(result).toEqual({ ok: true });
    expect(setQuoteActiveMock).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555", false);
    expect(requireDoctorWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("runs reorder under the selected organization principal and clears context after action", async () => {
    reorderQuotesMock.mockImplementation(async () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe(ORGANIZATION_ID);
    });

    const result = await reorderMotivationQuotes([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);

    expect(result).toEqual({ ok: true });
    expect(reorderQuotesMock).toHaveBeenCalledWith([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/doctor/content/motivation");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/patient");
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });
});
