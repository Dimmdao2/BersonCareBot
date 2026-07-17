import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePublicOrganizationBySlugRscMock = vi.hoisted(() => vi.fn());
const loadPublicOrganizationCitiesRscMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("../publicOrganizationBooking", () => ({
  resolvePublicOrganizationBySlugRsc: resolvePublicOrganizationBySlugRscMock,
  loadPublicOrganizationCitiesRsc: loadPublicOrganizationCitiesRscMock,
}));

import PublicBookOrganizationPage from "./page";

const ORGANIZATION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("PublicBookOrganizationPage (/book/[slug])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the org-scoped format step for a published, active clinic slug", async () => {
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue({ organizationId: ORGANIZATION_A });
    loadPublicOrganizationCitiesRscMock.mockResolvedValue({
      ok: true,
      cities: [{ id: "1", code: "moscow", title: "Москва", isActive: true, sortOrder: 0, createdAt: "", updatedAt: "" }],
    });

    const element = await PublicBookOrganizationPage({ params: Promise.resolve({ slug: "saas-test-clinic-a" }) });

    expect(resolvePublicOrganizationBySlugRscMock).toHaveBeenCalledWith("saas-test-clinic-a");
    expect(loadPublicOrganizationCitiesRscMock).toHaveBeenCalledWith(ORGANIZATION_A);
    expect(element).toBeTruthy();
  });

  it("fails closed with a uniform 404 for an unknown slug (no clinic enumeration)", async () => {
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue(null);

    await expect(
      PublicBookOrganizationPage({ params: Promise.resolve({ slug: "no-such-clinic" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadPublicOrganizationCitiesRscMock).not.toHaveBeenCalled();
  });

  it("fails closed with the same uniform 404 for an unpublished/inactive-organization slug", async () => {
    // The resolver deliberately does not distinguish "unpublished" from "unknown" — both
    // surface as null here, and the page must react identically (no leaking which case it is).
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue(null);

    await expect(
      PublicBookOrganizationPage({ params: Promise.resolve({ slug: "saas-test-clinic-draft" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadPublicOrganizationCitiesRscMock).not.toHaveBeenCalled();
  });
});
