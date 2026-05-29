import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  beProductHistoryEvents,
  beProductPayLinks,
  beProductPurchases,
  beProducts,
} from "../../../db/schema/bookingProducts";
import type { ProductsPort } from "@/modules/products/ports";
import type {
  ProductAccessRules,
  ProductComposition,
  ProductPayLinkRecord,
  ProductPurchaseRecord,
  ProductRecord,
} from "@/modules/products/types";

function mapProduct(row: typeof beProducts.$inferSelect): ProductRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productType: row.productType as ProductRecord["productType"],
    title: row.title,
    description: row.description,
    priceMinor: row.priceMinor,
    currency: row.currency,
    compositionJson: (row.compositionJson ?? {}) as ProductComposition,
    accessRulesJson: (row.accessRulesJson ?? {}) as ProductAccessRules,
    paymentRulesJson: (row.paymentRulesJson ?? {}) as Record<string, unknown>,
    validityDays: row.validityDays,
    courseId: row.courseId,
    subscriptionPackageId: row.subscriptionPackageId,
    showInPatientCatalog: row.showInPatientCatalog,
    payByLinkEnabled: row.payByLinkEnabled,
    isActive: row.isActive,
  };
}

function mapPurchase(row: typeof beProductPurchases.$inferSelect): ProductPurchaseRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    productType: row.productType as ProductPurchaseRecord["productType"],
    platformUserId: row.platformUserId,
    buyerPhoneNormalized: row.buyerPhoneNormalized,
    giftRecipientPhoneNormalized: row.giftRecipientPhoneNormalized,
    status: row.status as ProductPurchaseRecord["status"],
    title: row.title,
    priceMinor: row.priceMinor,
    currency: row.currency,
    validityDays: row.validityDays,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    fulfillmentJson: (row.fulfillmentJson ?? {}) as Record<string, unknown>,
    paymentIntentId: row.paymentIntentId,
    paymentRef: row.paymentRef,
    payLinkId: row.payLinkId,
  };
}

function mapPayLink(row: typeof beProductPayLinks.$inferSelect): ProductPayLinkRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    token: row.token,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    useCount: row.useCount,
    isActive: row.isActive,
  };
}

export function createPgProductsPort(): ProductsPort {
  return {
    async listProducts(organizationId, activeOnly = true) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beProducts)
        .where(
          activeOnly
            ? and(eq(beProducts.organizationId, organizationId), eq(beProducts.isActive, true))
            : eq(beProducts.organizationId, organizationId),
        )
        .orderBy(asc(beProducts.title));
      return rows.map(mapProduct);
    },

    async getProduct(id, organizationId) {
      const db = getDrizzle();
      const [row] = await db
        .select()
        .from(beProducts)
        .where(and(eq(beProducts.id, id), eq(beProducts.organizationId, organizationId)))
        .limit(1);
      return row ? mapProduct(row) : null;
    },

    async upsertProduct(input) {
      const db = getDrizzle();
      const values = {
        organizationId: input.organizationId,
        productType: input.productType,
        title: input.title,
        description: input.description ?? null,
        priceMinor: input.priceMinor,
        currency: input.currency ?? "RUB",
        compositionJson: input.compositionJson ?? {},
        accessRulesJson: input.accessRulesJson ?? {},
        paymentRulesJson: input.paymentRulesJson ?? {},
        validityDays: input.validityDays ?? null,
        courseId: input.courseId ?? null,
        subscriptionPackageId: input.subscriptionPackageId ?? null,
        showInPatientCatalog: input.showInPatientCatalog ?? true,
        payByLinkEnabled: input.payByLinkEnabled ?? false,
        isActive: input.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };
      if (input.id) {
        const [row] = await db
          .update(beProducts)
          .set(values)
          .where(and(eq(beProducts.id, input.id), eq(beProducts.organizationId, input.organizationId)))
          .returning();
        if (!row) throw new Error("product_not_found");
        return mapProduct(row);
      }
      const [row] = await db.insert(beProducts).values(values).returning();
      return mapProduct(row);
    },

    async createPayLink(input) {
      const db = getDrizzle();
      const [row] = await db
        .insert(beProductPayLinks)
        .values({
          organizationId: input.organizationId,
          productId: input.productId,
          token: input.token,
          expiresAt: input.expiresAt ?? null,
          maxUses: input.maxUses ?? null,
        })
        .returning();
      return mapPayLink(row);
    },

    async getPayLinkByToken(token) {
      const db = getDrizzle();
      const [link] = await db
        .select()
        .from(beProductPayLinks)
        .where(eq(beProductPayLinks.token, token))
        .limit(1);
      if (!link) return null;
      const [product] = await db
        .select()
        .from(beProducts)
        .where(eq(beProducts.id, link.productId))
        .limit(1);
      if (!product) return null;
      return { ...mapPayLink(link), product: mapProduct(product) };
    },

    async incrementPayLinkUse(payLinkId) {
      const db = getDrizzle();
      const [row] = await db
        .select({ useCount: beProductPayLinks.useCount })
        .from(beProductPayLinks)
        .where(eq(beProductPayLinks.id, payLinkId))
        .limit(1);
      if (!row) return;
      await db
        .update(beProductPayLinks)
        .set({ useCount: row.useCount + 1 })
        .where(eq(beProductPayLinks.id, payLinkId));
    },

    async createPurchase(input) {
      const db = getDrizzle();
      const [row] = await db
        .insert(beProductPurchases)
        .values({
          organizationId: input.organizationId,
          productId: input.productId,
          productType: input.productType,
          platformUserId: input.platformUserId ?? null,
          buyerPhoneNormalized: input.buyerPhoneNormalized ?? null,
          giftRecipientPhoneNormalized: input.giftRecipientPhoneNormalized ?? null,
          title: input.title,
          priceMinor: input.priceMinor,
          currency: input.currency,
          validityDays: input.validityDays ?? null,
          payLinkId: input.payLinkId ?? null,
          assignedByPlatformUserId: input.assignedByPlatformUserId ?? null,
          fulfillmentJson: input.fulfillmentJson ?? {},
          status: "offered",
        })
        .returning();
      return mapPurchase(row);
    },

    async getPurchase(id, organizationId) {
      const db = getDrizzle();
      const [row] = await db
        .select()
        .from(beProductPurchases)
        .where(and(eq(beProductPurchases.id, id), eq(beProductPurchases.organizationId, organizationId)))
        .limit(1);
      return row ? mapPurchase(row) : null;
    },

    async listPurchasesForUser(platformUserId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beProductPurchases)
        .where(
          and(
            eq(beProductPurchases.organizationId, organizationId),
            eq(beProductPurchases.platformUserId, platformUserId),
          ),
        )
        .orderBy(asc(beProductPurchases.createdAt));
      return rows.map(mapPurchase);
    },

    async listPurchasesByPhone(phoneNormalized, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beProductPurchases)
        .where(
          and(
            eq(beProductPurchases.organizationId, organizationId),
            eq(beProductPurchases.buyerPhoneNormalized, phoneNormalized),
          ),
        )
        .orderBy(asc(beProductPurchases.createdAt));
      return rows.map(mapPurchase);
    },

    async linkPurchasesByPhone(platformUserId, phoneNormalized, organizationId) {
      const db = getDrizzle();
      const unlinked = await db
        .select({ id: beProductPurchases.id })
        .from(beProductPurchases)
        .where(
          and(
            eq(beProductPurchases.organizationId, organizationId),
            eq(beProductPurchases.buyerPhoneNormalized, phoneNormalized),
            isNull(beProductPurchases.platformUserId),
          ),
        );
      if (unlinked.length === 0) return 0;
      await db
        .update(beProductPurchases)
        .set({ platformUserId, updatedAt: new Date().toISOString() })
        .where(
          inArray(
            beProductPurchases.id,
            unlinked.map((r) => r.id),
          ),
        );
      return unlinked.length;
    },

    async setPurchaseStatus(id, organizationId, status, patch) {
      const db = getDrizzle();
      const set: Partial<typeof beProductPurchases.$inferInsert> = {
        status,
        updatedAt: new Date().toISOString(),
      };
      if (patch?.paymentIntentId !== undefined) set.paymentIntentId = patch.paymentIntentId;
      if (patch?.paymentRef !== undefined) set.paymentRef = patch.paymentRef;
      if (patch?.validFrom !== undefined) set.validFrom = patch.validFrom;
      if (patch?.validUntil !== undefined) set.validUntil = patch.validUntil;
      if (patch?.fulfillmentJson !== undefined) set.fulfillmentJson = patch.fulfillmentJson;
      if (patch?.platformUserId !== undefined) set.platformUserId = patch.platformUserId;
      if (patch?.buyerPhoneNormalized !== undefined) {
        set.buyerPhoneNormalized = patch.buyerPhoneNormalized;
      }
      const [row] = await db
        .update(beProductPurchases)
        .set(set)
        .where(and(eq(beProductPurchases.id, id), eq(beProductPurchases.organizationId, organizationId)))
        .returning();
      return row ? mapPurchase(row) : null;
    },

    async appendHistoryEvent(input) {
      const db = getDrizzle();
      await db.insert(beProductHistoryEvents).values({
        organizationId: input.organizationId,
        productPurchaseId: input.productPurchaseId,
        eventType: input.eventType,
        payloadJson: input.payloadJson ?? {},
      });
    },
  };
}
