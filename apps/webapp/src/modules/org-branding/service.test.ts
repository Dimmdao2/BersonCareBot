import { beforeEach, describe, expect, it } from "vitest";
import {
  createInMemoryOrgBrandingPort,
  listInMemoryOrgBrandRevisions,
  resetInMemoryOrgBrandingForTests,
  seedInMemoryOrgBrandingMedia,
  seedInMemoryOrgBrandingOrganization,
} from "@/infra/repos/inMemoryOrgBranding";
import {
  CALLER_SUPPLIED_ORGANIZATION_ID_ERROR,
  CORE_CONTEXT_UNAVAILABLE_ERROR,
  createOrgBrandingService,
  type OrgBrandingManagementContext,
} from "./service";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const LOGO_A = "44444444-4444-4444-8444-444444444444";
const LOGO_B = "55555555-5555-4555-8555-555555555555";
const LOGO_PLATFORM = "66666666-6666-4666-8666-666666666666";

const ctxA: OrgBrandingManagementContext = {
  organizationId: ORG_A,
  actorPlatformUserId: ACTOR,
  hasOrganizationManagementCapability: true,
};

let brandingEnabled = true;

function serviceFor() {
  return createOrgBrandingService({
    port: createInMemoryOrgBrandingPort(),
    isBrandingMechanicEnabled: async () => brandingEnabled,
  });
}

beforeEach(() => {
  resetInMemoryOrgBrandingForTests();
  brandingEnabled = true;
  seedInMemoryOrgBrandingOrganization({ organizationId: ORG_A, displayName: "Клиника А" });
  seedInMemoryOrgBrandingOrganization({ organizationId: ORG_B, displayName: "Клиника Б" });
  seedInMemoryOrgBrandingMedia({ mediaId: LOGO_A, organizationId: ORG_A });
  seedInMemoryOrgBrandingMedia({ mediaId: LOGO_B, organizationId: ORG_B });
  seedInMemoryOrgBrandingMedia({ mediaId: LOGO_PLATFORM, organizationId: null });
});

async function publishBrand(displayName: string | null, logoMediaId: string | null) {
  const service = serviceFor();
  await service.saveDraft(ctxA, { displayName, logoMediaId });
  await service.publishDraft(ctxA);
  return service;
}

describe("resolveEffectiveOrgBranding — core context is never gated", () => {
  it("returns the canonical name with null paid fields when the branding mechanic is OFF", async () => {
    const service = await publishBrand("Брендовое имя", LOGO_A);
    brandingEnabled = false;

    const effective = await service.resolveEffectiveOrgBranding(ORG_A);

    expect(effective.core.displayName).toBe("Клиника А");
    expect(effective.effectiveDisplayName).toBe("Клиника А");
    expect(effective.paid).toEqual({ displayName: null, logoUrl: null });
    expect(effective.resolution).toBe("entitlement_disabled");
    // Entitlement OFF hides the paid layer; it never deletes the published revision.
    expect(
      listInMemoryOrgBrandRevisions(ORG_A).filter((revision) => revision.status === "published"),
    ).toHaveLength(1);
  });

  it("returns the canonical name with null paid fields when nothing is published", async () => {
    const service = serviceFor();
    await service.saveDraft(ctxA, { displayName: "Черновик", logoMediaId: LOGO_A });

    const effective = await service.resolveEffectiveOrgBranding(ORG_A);

    expect(effective.core.displayName).toBe("Клиника А");
    expect(effective.paid).toEqual({ displayName: null, logoUrl: null });
    expect(effective.resolution).toBe("no_published_revision");
  });

  it("applies the paid name and the server-computed logo URL once entitled and published", async () => {
    const service = await publishBrand("Брендовое имя", LOGO_A);

    const effective = await service.resolveEffectiveOrgBranding(ORG_A);

    expect(effective.resolution).toBe("applied");
    expect(effective.paid.displayName).toBe("Брендовое имя");
    expect(effective.paid.logoUrl).toBe(`/api/media/${LOGO_A}`);
    expect(effective.effectiveDisplayName).toBe("Брендовое имя");
    expect(effective.core.displayName).toBe("Клиника А");
  });

  it("never degrades to an anonymous surface: an unreadable organization fails loudly", async () => {
    const service = serviceFor();
    await expect(service.resolveEffectiveOrgBranding(ORG_B.replace("2", "9"))).rejects.toThrow(
      CORE_CONTEXT_UNAVAILABLE_ERROR,
    );
  });
});

describe("logo readiness and ownership", () => {
  it("refuses a draft logo owned by a DIFFERENT organization", async () => {
    const service = serviceFor();
    await expect(service.saveDraft(ctxA, { displayName: null, logoMediaId: LOGO_B })).rejects.toThrow(
      "org_brand_logo_media_must_be_owned_by_organization",
    );
  });

  it("refuses a platform-owned asset as a paid organization logo", async () => {
    const service = serviceFor();
    await expect(
      service.saveDraft(ctxA, { displayName: null, logoMediaId: LOGO_PLATFORM }),
    ).rejects.toThrow("org_brand_logo_media_must_be_owned_by_organization");
  });

  it("ignores a published logo that stops being owned by the organization", async () => {
    const service = await publishBrand("Брендовое имя", LOGO_A);
    // The asset is re-owned by another organization (or purged and reused) after publication.
    seedInMemoryOrgBrandingMedia({ mediaId: LOGO_A, organizationId: ORG_B });

    const effective = await service.resolveEffectiveOrgBranding(ORG_A);

    expect(effective.paid.logoUrl).toBeNull();
    // The rest of the paid layer still applies, and the core name is still there.
    expect(effective.paid.displayName).toBe("Брендовое имя");
    expect(effective.core.displayName).toBe("Клиника А");
  });

  it("ignores a published logo whose upload is not ready", async () => {
    const service = await publishBrand(null, LOGO_A);
    seedInMemoryOrgBrandingMedia({ mediaId: LOGO_A, organizationId: ORG_A, ready: false });

    expect((await service.resolveEffectiveOrgBranding(ORG_A)).paid.logoUrl).toBeNull();
  });
});

describe("publication transitions", () => {
  it("publishes a draft, then archives the superseded revision instead of deleting it", async () => {
    const service = await publishBrand("Первое имя", LOGO_A);
    await service.saveDraft(ctxA, { displayName: "Второе имя", logoMediaId: null });
    const republished = await service.publishDraft(ctxA);

    expect(republished.ok).toBe(true);
    const revisions = listInMemoryOrgBrandRevisions(ORG_A);
    expect(revisions.filter((revision) => revision.status === "published")).toHaveLength(1);
    const archived = revisions.filter((revision) => revision.status === "archived");
    expect(archived).toHaveLength(1);
    expect(archived[0]?.displayName).toBe("Первое имя");
    expect(archived[0]?.archivedByPlatformUserId).toBe(ACTOR);
    expect((await service.resolveEffectiveOrgBranding(ORG_A)).paid.displayName).toBe("Второе имя");
  });

  it("unpublishes to core context only, keeping the revision as history", async () => {
    const service = await publishBrand("Брендовое имя", LOGO_A);

    expect(await service.unpublish(ctxA)).toEqual({ ok: true });

    const effective = await service.resolveEffectiveOrgBranding(ORG_A);
    expect(effective.resolution).toBe("no_published_revision");
    expect(effective.effectiveDisplayName).toBe("Клиника А");
    expect(listInMemoryOrgBrandRevisions(ORG_A)).toHaveLength(1);
    expect(listInMemoryOrgBrandRevisions(ORG_A)[0]?.status).toBe("archived");
  });

  it("reports nothing_to_publish and nothing_published instead of guessing", async () => {
    const service = serviceFor();
    expect(await service.publishDraft(ctxA)).toEqual({ ok: false, code: "nothing_to_publish" });
    expect(await service.unpublish(ctxA)).toEqual({ ok: false, code: "nothing_published" });
  });

  it("blocks every mutation while the branding mechanic is OFF", async () => {
    const service = serviceFor();
    brandingEnabled = false;
    expect(await service.saveDraft(ctxA, { displayName: "X", logoMediaId: null })).toEqual({
      ok: false,
      code: "entitlement_disabled",
    });
    expect(await service.publishDraft(ctxA)).toEqual({ ok: false, code: "entitlement_disabled" });
    expect(await service.unpublish(ctxA)).toEqual({ ok: false, code: "entitlement_disabled" });
  });
});

describe("the client cannot choose the organization or the effective logo", () => {
  it("rejects a caller-supplied organization id in the mutation payload", async () => {
    const service = serviceFor();
    await expect(
      service.saveDraft(ctxA, {
        displayName: "X",
        logoMediaId: null,
        // @ts-expect-error — the typed input has no organization id; an adversarial caller is simulated.
        organizationId: ORG_B,
      }),
    ).rejects.toThrow(`${CALLER_SUPPLIED_ORGANIZATION_ID_ERROR}:organizationId`);
    expect(listInMemoryOrgBrandRevisions(ORG_B)).toHaveLength(0);
  });

  it("writes the draft to the trusted context organization, not to any payload value", async () => {
    const service = serviceFor();
    const saved = await service.saveDraft(ctxA, { displayName: "X", logoMediaId: LOGO_A });

    expect(saved.ok && saved.draft.organizationId).toBe(ORG_A);
    expect(listInMemoryOrgBrandRevisions(ORG_B)).toHaveLength(0);
  });

  it("rejects a caller-supplied logo URL and derives the URL from the validated media id only", async () => {
    const service = serviceFor();
    await expect(
      service.saveDraft(ctxA, {
        displayName: null,
        logoMediaId: LOGO_A,
        // @ts-expect-error — a client trying to dictate the effective asset URL.
        logoUrl: "https://evil.example.com/logo.png",
      }),
    ).rejects.toThrow(`${CALLER_SUPPLIED_ORGANIZATION_ID_ERROR}:logoUrl`);

    await service.saveDraft(ctxA, { displayName: null, logoMediaId: LOGO_A });
    await service.publishDraft(ctxA);
    const effective = await service.resolveEffectiveOrgBranding(ORG_A);
    expect(effective.paid.logoUrl).toBe(`/api/media/${LOGO_A}`);
    expect(effective.paid.logoUrl).not.toContain("evil.example.com");
  });

  it("rejects a malformed logo media id instead of storing it", async () => {
    const service = serviceFor();
    await expect(
      service.saveDraft(ctxA, { displayName: null, logoMediaId: "../../etc/passwd" }),
    ).rejects.toThrow("org_brand_logo_media_id_invalid");
  });
});
