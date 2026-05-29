import type { EntitlementsPort } from "./ports";

const GRANT_PURPOSE_PRODUCT = "be_product_purchase";

export function createEntitlementsService(deps: { port: EntitlementsPort }) {
  return {
    async grantContentAccessForPurchase(input: {
      productPurchaseId: string;
      platformUserId: string;
      contentIds: string[];
      validUntil: string | null;
    }) {
      const integratorUserId =
        (await deps.port.getPlatformUserIntegratorId(input.platformUserId)) ??
        0;
      const expiresAt =
        input.validUntil ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      for (const contentId of input.contentIds) {
        const grantId = `be_product_purchase:${input.productPurchaseId}:${contentId}`;
        await deps.port.upsertWebappGrant({
          integratorGrantId: grantId,
          platformUserId: input.platformUserId,
          integratorUserId,
          contentId,
          purpose: GRANT_PURPOSE_PRODUCT,
          expiresAt,
          metaJson: { productPurchaseId: input.productPurchaseId },
        });
      }
    },

    async listActiveContentGrants(platformUserId: string) {
      return deps.port.listActiveGrantsForUser(platformUserId);
    },

    async hasActiveContentGrant(platformUserId: string, contentId: string): Promise<boolean> {
      const grants = await deps.port.listActiveGrantsForUser(platformUserId);
      return grants.some((g) => g.contentId === contentId);
    },
  };
}

export type EntitlementsService = ReturnType<typeof createEntitlementsService>;
