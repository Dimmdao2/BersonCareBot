import { randomBytes } from "node:crypto";
import type { PaymentsService } from "@/modules/payments/service";
import type { EntitlementsService } from "@/modules/entitlements/service";
import type { MembershipsService } from "@/modules/memberships/service";
import type { CoursesService } from "@/modules/courses/service";
import type { ProductsPort } from "./ports";
import type { ProductComposition, ProductPurchaseRecord, ProductRecord, UpsertProductInput } from "./types";

const BOOKABLE_AT_APPOINTMENT_TYPES = ["promo", "gift_certificate", "single_visit"] as const;

type ResolvePlatformUserByPhone = (
  phone: string,
  name: string,
) => Promise<{ ok: true; userId: string } | { ok: false; error: string }>;

function visitsRemainingFromFulfillment(fulfillment: Record<string, unknown>): number {
  const n = fulfillment.visitsRemaining;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function purchaseIsExpired(purchase: ProductPurchaseRecord): boolean {
  if (!purchase.validUntil) return false;
  return new Date(purchase.validUntil).getTime() < Date.now();
}

function serviceAllowedForProduct(product: ProductRecord, serviceId: string): boolean {
  const ids = product.compositionJson.serviceIds ?? [];
  if (ids.length === 0) return true;
  return ids.includes(serviceId);
}

function addValidity(validFrom: string, validityDays: number | null): string | null {
  if (validityDays == null || validityDays <= 0) return null;
  const d = new Date(validFrom);
  d.setUTCDate(d.getUTCDate() + validityDays);
  return d.toISOString();
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.startsWith("7") && digits.length === 11) return `+${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function initialFulfillment(product: ProductRecord): Record<string, unknown> {
  const comp = product.compositionJson;
  if (
    product.productType === "promo" ||
    product.productType === "gift_certificate" ||
    product.productType === "single_visit"
  ) {
    const visitCount = product.productType === "single_visit" ? 1 : (comp.visitCount ?? 1);
    return { visitsTotal: visitCount, visitsRemaining: visitCount };
  }
  if (product.productType === "individual_offer") {
    return { offered: true };
  }
  return {};
}

export function createProductsService(deps: {
  port: ProductsPort;
  payments: PaymentsService | null;
  entitlements: EntitlementsService | null;
  memberships: MembershipsService | null;
  courses: CoursesService | null;
  resolvePlatformUserByPhone?: ResolvePlatformUserByPhone;
}) {
  async function ensurePurchasePlatformUser(
    purchase: ProductPurchaseRecord,
    organizationId: string,
    contactName?: string | null,
  ): Promise<ProductPurchaseRecord> {
    if (purchase.platformUserId || !purchase.buyerPhoneNormalized || !deps.resolvePlatformUserByPhone) {
      return purchase;
    }
    const resolved = await deps.resolvePlatformUserByPhone(
      purchase.buyerPhoneNormalized,
      (contactName ?? purchase.buyerPhoneNormalized).trim(),
    );
    if (!resolved.ok) return purchase;
    const updated = await deps.port.setPurchaseStatus(purchase.id, organizationId, purchase.status, {
      platformUserId: resolved.userId,
      buyerPhoneNormalized: purchase.buyerPhoneNormalized,
    });
    return updated ?? { ...purchase, platformUserId: resolved.userId };
  }

  return {
    async listCatalog(organizationId: string) {
      return deps.port.listProducts(organizationId, true);
    },

    async listStaffProducts(organizationId: string) {
      return deps.port.listProducts(organizationId, false);
    },

    async upsertProduct(input: UpsertProductInput) {
      return deps.port.upsertProduct(input);
    },

    async createPayLink(input: {
      organizationId: string;
      productId: string;
      expiresAt?: string | null;
      maxUses?: number | null;
    }) {
      const product = await deps.port.getProduct(input.productId, input.organizationId);
      if (!product?.payByLinkEnabled) throw new Error("pay_link_not_enabled");
      const token = randomBytes(24).toString("base64url");
      return deps.port.createPayLink({ ...input, token });
    },

    async resolvePayLink(token: string) {
      const link = await deps.port.getPayLinkByToken(token);
      if (!link?.isActive) return null;
      if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return null;
      if (link.maxUses != null && link.useCount >= link.maxUses) return null;
      return link;
    },

    async linkPurchasesForUser(platformUserId: string, phoneNormalized: string, organizationId: string) {
      const phone = normalizePhone(phoneNormalized);
      if (!phone) return 0;
      return deps.port.linkPurchasesByPhone(platformUserId, phone, organizationId);
    },

    async listPatientPurchases(platformUserId: string, organizationId: string) {
      return deps.port.listPurchasesForUser(platformUserId, organizationId);
    },

    async listPatientProductsForStaff(platformUserId: string, organizationId: string) {
      const purchases = await deps.port.listPurchasesForUser(platformUserId, organizationId);
      return purchases.filter((p) => p.status === "active" || p.status === "awaiting_payment");
    },

    async getPurchaseDetail(purchaseId: string, organizationId: string, platformUserId?: string) {
      const purchase = await deps.port.getPurchase(purchaseId, organizationId);
      if (!purchase) return null;
      if (platformUserId && purchase.platformUserId && purchase.platformUserId !== platformUserId) {
        return null;
      }
      const product = await deps.port.getProduct(purchase.productId, organizationId);
      return { purchase, product };
    },

    async startPurchase(input: {
      organizationId: string;
      productId: string;
      platformUserId?: string | null;
      buyerPhone?: string | null;
      buyerName?: string | null;
      giftRecipientPhone?: string | null;
      payLinkToken?: string | null;
    }) {
      let product: ProductRecord | null = null;
      let payLinkId: string | null = null;

      if (input.payLinkToken) {
        const link = await this.resolvePayLink(input.payLinkToken);
        if (!link || link.product.id !== input.productId) throw new Error("invalid_pay_link");
        product = link.product;
        payLinkId = link.id;
        await deps.port.incrementPayLinkUse(link.id);
      } else {
        product = await deps.port.getProduct(input.productId, input.organizationId);
      }

      if (!product || !product.isActive) throw new Error("product_not_found");

      const buyerPhoneNormalized = input.buyerPhone ? normalizePhone(input.buyerPhone) : null;
      const purchase = await deps.port.createPurchase({
        organizationId: input.organizationId,
        productId: product.id,
        productType: product.productType,
        platformUserId: input.platformUserId ?? null,
        buyerPhoneNormalized,
        giftRecipientPhoneNormalized: input.giftRecipientPhone
          ? normalizePhone(input.giftRecipientPhone)
          : null,
        title: product.title,
        priceMinor: product.priceMinor,
        currency: product.currency,
        validityDays: product.validityDays,
        payLinkId,
        fulfillmentJson: initialFulfillment(product),
      });

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        productPurchaseId: purchase.id,
        eventType: "purchase_started",
        payloadJson: { productId: product.id, productType: product.productType },
      });

      if (product.priceMinor > 0) {
        let platformUserId = input.platformUserId ?? purchase.platformUserId ?? null;
        if (!platformUserId && buyerPhoneNormalized && deps.resolvePlatformUserByPhone) {
          const resolved = await deps.resolvePlatformUserByPhone(
            buyerPhoneNormalized,
            (input.buyerName ?? buyerPhoneNormalized).trim(),
          );
          if (!resolved.ok) throw new Error(resolved.error);
          platformUserId = resolved.userId;
          await deps.port.setPurchaseStatus(purchase.id, input.organizationId, purchase.status, {
            platformUserId,
            buyerPhoneNormalized,
          });
        }
        return this.createPaymentOffer(
          purchase.id,
          input.organizationId,
          platformUserId,
          buyerPhoneNormalized,
        );
      }
      const linked = await ensurePurchasePlatformUser(
        purchase,
        input.organizationId,
        input.buyerName ?? input.buyerPhone,
      );
      return this.activatePurchase(linked.id, input.organizationId);
    },

    async createPaymentOffer(
      purchaseId: string,
      organizationId: string,
      platformUserId?: string | null,
      buyerPhoneNormalized?: string | null,
    ) {
      const purchase = await deps.port.getPurchase(purchaseId, organizationId);
      if (!purchase) throw new Error("purchase_not_found");
      if (!deps.payments) throw new Error("payments_unavailable");
      if (!platformUserId) throw new Error("platform_user_required_for_payment");

      const idempotencyKey = `product:${purchaseId}:offer`;
      const intent = await deps.payments.createProductPaymentIntent({
        organizationId,
        platformUserId,
        productPurchaseId: purchaseId,
        amountMinor: purchase.priceMinor,
        currency: purchase.currency,
        idempotencyKey,
      });

      const updated = await deps.port.setPurchaseStatus(purchaseId, organizationId, "awaiting_payment", {
        paymentIntentId: intent.id,
        platformUserId,
        buyerPhoneNormalized: buyerPhoneNormalized ?? purchase.buyerPhoneNormalized,
      });
      await deps.port.appendHistoryEvent({
        organizationId,
        productPurchaseId: purchaseId,
        eventType: "payment_offer_created",
        payloadJson: { intentId: intent.id },
      });
      return { purchase: updated ?? purchase, paymentIntentId: intent.id };
    },

    async captureProductPayment(intentId: string, organizationId: string, platformUserId: string) {
      if (!deps.payments) throw new Error("payments_unavailable");
      const result = await deps.payments.captureIntentForPatient(intentId, organizationId, platformUserId);
      return result;
    },

    async activatePurchase(purchaseId: string, organizationId: string, paymentRef?: string) {
      let purchase = await deps.port.getPurchase(purchaseId, organizationId);
      if (!purchase) return null;
      if (purchase.status === "active") return purchase;

      purchase = await ensurePurchasePlatformUser(purchase, organizationId);

      const product = await deps.port.getProduct(purchase.productId, organizationId);
      if (!product) throw new Error("product_not_found");

      const now = new Date().toISOString();
      const validUntil = addValidity(now, purchase.validityDays);
      let fulfillmentJson = { ...purchase.fulfillmentJson };

      const validUntilForGrant = validUntil;
      if (purchase.platformUserId) {
        fulfillmentJson = await this.fulfillProduct({
          purchase,
          product,
          platformUserId: purchase.platformUserId,
          fulfillmentJson,
          validUntil: validUntilForGrant,
        });
      }

      const updated = await deps.port.setPurchaseStatus(purchaseId, organizationId, "active", {
        paymentRef: paymentRef ?? purchase.paymentRef,
        validFrom: now,
        validUntil: validUntilForGrant,
        fulfillmentJson,
      });

      await deps.port.appendHistoryEvent({
        organizationId,
        productPurchaseId: purchaseId,
        eventType: "activated",
        payloadJson: { paymentRef: paymentRef ?? null },
      });

      return updated;
    },

    async fulfillProduct(input: {
      purchase: ProductPurchaseRecord;
      product: ProductRecord;
      platformUserId: string;
      fulfillmentJson: Record<string, unknown>;
      validUntil: string | null;
    }): Promise<Record<string, unknown>> {
      const { purchase, product, platformUserId, validUntil } = input;
      let fulfillmentJson = { ...input.fulfillmentJson };

      if (product.productType === "course" && product.courseId && deps.courses) {
        await deps.courses.enrollPatient({
          courseId: product.courseId,
          patientUserId: platformUserId,
        });
        fulfillmentJson = { ...fulfillmentJson, courseId: product.courseId, enrolled: true };
      }

      if (product.productType === "membership" && product.subscriptionPackageId && deps.memberships) {
        const pkg = await deps.memberships.grantPrepaidCatalogPackage({
          organizationId: purchase.organizationId,
          platformUserId,
          subscriptionPackageId: product.subscriptionPackageId,
          paymentRef: purchase.paymentRef ?? undefined,
        });
        fulfillmentJson = {
          ...fulfillmentJson,
          patientPackageId: pkg.id,
        };
      }

      const contentIds = [
        ...(product.accessRulesJson.contentIds ?? []),
        ...(product.compositionJson.contentIds ?? []),
      ];
      if (contentIds.length > 0 && deps.entitlements) {
        await deps.entitlements.grantContentAccessForPurchase({
          productPurchaseId: purchase.id,
          platformUserId,
          contentIds,
          validUntil,
        });
        fulfillmentJson = { ...fulfillmentJson, contentGrantIds: contentIds };
      }

      if (product.productType === "individual_offer") {
        fulfillmentJson = { ...fulfillmentJson, offered: true, fulfilledAt: new Date().toISOString() };
      }

      return fulfillmentJson;
    },

    async listActivePurchasesForBooking(
      platformUserId: string,
      organizationId: string,
      serviceId: string,
    ): Promise<
      Array<{
        id: string;
        title: string;
        productType: ProductRecord["productType"];
        visitsRemaining: number;
      }>
    > {
      const purchases = await deps.port.listPurchasesForUser(platformUserId, organizationId);
      const out: Array<{
        id: string;
        title: string;
        productType: ProductRecord["productType"];
        visitsRemaining: number;
      }> = [];
      for (const purchase of purchases) {
        if (purchase.status !== "active") continue;
        if (!BOOKABLE_AT_APPOINTMENT_TYPES.includes(purchase.productType as (typeof BOOKABLE_AT_APPOINTMENT_TYPES)[number])) {
          continue;
        }
        if (purchaseIsExpired(purchase)) continue;
        const remaining = visitsRemainingFromFulfillment(purchase.fulfillmentJson);
        if (remaining <= 0) continue;
        const product = await deps.port.getProduct(purchase.productId, organizationId);
        if (!product?.isActive) continue;
        if (!serviceAllowedForProduct(product, serviceId)) continue;
        out.push({
          id: purchase.id,
          title: purchase.title,
          productType: purchase.productType,
          visitsRemaining: remaining,
        });
      }
      return out;
    },

    async consumeVisitForAppointment(input: {
      organizationId: string;
      productPurchaseId: string;
      platformUserId: string;
      appointmentId: string;
      serviceId: string;
    }) {
      const purchase = await deps.port.getPurchase(input.productPurchaseId, input.organizationId);
      if (!purchase || purchase.platformUserId !== input.platformUserId) {
        throw new Error("product_purchase_not_found");
      }
      if (purchase.status !== "active") throw new Error("product_not_active");
      if (purchaseIsExpired(purchase)) throw new Error("product_expired");
      const product = await deps.port.getProduct(purchase.productId, input.organizationId);
      if (!product) throw new Error("product_not_found");
      if (!serviceAllowedForProduct(product, input.serviceId)) {
        throw new Error("product_service_mismatch");
      }
      const remaining = visitsRemainingFromFulfillment(purchase.fulfillmentJson);
      if (remaining <= 0) throw new Error("product_no_visits");

      const appointmentIds = Array.isArray(purchase.fulfillmentJson.appointmentIds)
        ? [...(purchase.fulfillmentJson.appointmentIds as string[])]
        : [];
      if (!appointmentIds.includes(input.appointmentId)) {
        appointmentIds.push(input.appointmentId);
      }
      const nextRemaining = remaining - 1;
      const fulfillmentJson = {
        ...purchase.fulfillmentJson,
        visitsRemaining: nextRemaining,
        appointmentIds,
      };
      const status = nextRemaining <= 0 ? ("used" as const) : purchase.status;
      await deps.port.setPurchaseStatus(input.productPurchaseId, input.organizationId, status, {
        fulfillmentJson,
      });
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        productPurchaseId: input.productPurchaseId,
        eventType: "visit_consumed",
        payloadJson: { appointmentId: input.appointmentId, visitsRemaining: nextRemaining },
      });
    },

    async applyCancelVisitOutcome(input: {
      organizationId: string;
      productPurchaseId: string;
      appointmentId: string;
      visitDeducted: boolean;
    }) {
      if (input.visitDeducted) return;
      const purchase = await deps.port.getPurchase(input.productPurchaseId, input.organizationId);
      if (!purchase) return;
      const appointmentIds = Array.isArray(purchase.fulfillmentJson.appointmentIds)
        ? (purchase.fulfillmentJson.appointmentIds as string[])
        : [];
      if (!appointmentIds.includes(input.appointmentId)) return;

      const visitsTotal =
        typeof purchase.fulfillmentJson.visitsTotal === "number"
          ? purchase.fulfillmentJson.visitsTotal
          : 1;
      const current = visitsRemainingFromFulfillment(purchase.fulfillmentJson);
      const nextRemaining = Math.min(visitsTotal, current + 1);
      const nextAppointmentIds = appointmentIds.filter((id) => id !== input.appointmentId);
      const fulfillmentJson = {
        ...purchase.fulfillmentJson,
        visitsRemaining: nextRemaining,
        appointmentIds: nextAppointmentIds,
      };
      await deps.port.setPurchaseStatus(input.productPurchaseId, input.organizationId, "active", {
        fulfillmentJson,
      });
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        productPurchaseId: input.productPurchaseId,
        eventType: "visit_released",
        payloadJson: { appointmentId: input.appointmentId, visitsRemaining: nextRemaining },
      });
    },

    async manualConsumeVisitForStaff(input: {
      organizationId: string;
      productPurchaseId: string;
      platformUserId: string;
      appointmentId?: string | null;
      serviceId: string;
      actorPlatformUserId: string;
    }) {
      await this.consumeVisitForAppointment({
        organizationId: input.organizationId,
        productPurchaseId: input.productPurchaseId,
        platformUserId: input.platformUserId,
        appointmentId: input.appointmentId ?? `staff:${input.actorPlatformUserId}:${Date.now()}`,
        serviceId: input.serviceId,
      });
    },
  };
}

export type ProductsService = ReturnType<typeof createProductsService>;
