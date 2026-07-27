import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePublicOrganizationBySlugRscMock = vi.hoisted(() => vi.fn());
const loadPublicOrganizationCitiesRscMock = vi.hoisted(() => vi.fn());
const permanentRedirectMock = vi.hoisted(() => vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT_308:${url}`);
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: permanentRedirectMock,
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
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue({
      organizationId: ORGANIZATION_A,
      canonicalSlug: "saas-test-clinic-a",
      disposition: "current",
    });
    loadPublicOrganizationCitiesRscMock.mockResolvedValue({
      ok: true,
      cities: [{ id: "1", code: "moscow", title: "Москва", isActive: true, sortOrder: 0, createdAt: "", updatedAt: "" }],
    });

    const element = await PublicBookOrganizationPage({ params: Promise.resolve({ slug: "saas-test-clinic-a" }) });

    expect(resolvePublicOrganizationBySlugRscMock).toHaveBeenCalledWith("saas-test-clinic-a");
    expect(loadPublicOrganizationCitiesRscMock).toHaveBeenCalledWith(ORGANIZATION_A);
    expect(element).toBeTruthy();
  });

  it("issues a permanent 308 redirect from an alias to the canonical clinic slug", async () => {
    resolvePublicOrganizationBySlugRscMock.mockResolvedValue({
      organizationId: ORGANIZATION_A,
      canonicalSlug: "clinic-new",
      disposition: "redirect",
    });

    await expect(
      PublicBookOrganizationPage({ params: Promise.resolve({ slug: "clinic-old" }) }),
    ).rejects.toThrow("NEXT_REDIRECT_308:/book/clinic-new");
    expect(permanentRedirectMock).toHaveBeenCalledWith("/book/clinic-new");
    expect(loadPublicOrganizationCitiesRscMock).not.toHaveBeenCalled();
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
