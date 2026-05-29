import { describe, expect, it, vi } from "vitest";
import { createProductsService } from "./service";
import type { ProductsPort } from "./ports";

function makePort(overrides: Partial<ProductsPort> = {}): ProductsPort {
  return {
    listProducts: vi.fn(),
    getProduct: vi.fn(),
    upsertProduct: vi.fn(),
    createPayLink: vi.fn(),
    getPayLinkByToken: vi.fn(),
    incrementPayLinkUse: vi.fn(),
    createPurchase: vi.fn(),
    getPurchase: vi.fn(),
    listPurchasesForUser: vi.fn(),
    listPurchasesByPhone: vi.fn(),
    linkPurchasesByPhone: vi.fn(),
    setPurchaseStatus: vi.fn(),
    appendHistoryEvent: vi.fn(),
    ...overrides,
  };
}

describe("products service", () => {
  it("linkPurchasesByPhone normalizes phone", async () => {
    const linkPurchasesByPhone = vi.fn().mockResolvedValue(2);
    const svc = createProductsService({
      port: makePort({ linkPurchasesByPhone }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
    });
    const n = await svc.linkPurchasesForUser("u1", "89991234567", "org-1");
    expect(n).toBe(2);
    expect(linkPurchasesByPhone).toHaveBeenCalledWith("u1", "+79991234567", "org-1");
  });

  it("activatePurchase grants course enrollment", async () => {
    const enrollPatient = vi.fn().mockResolvedValue({});
    const purchase = {
      id: "pur-1",
      organizationId: "org-1",
      productId: "prod-1",
      productType: "course" as const,
      platformUserId: "u1",
      buyerPhoneNormalized: null,
      giftRecipientPhoneNormalized: null,
      status: "awaiting_payment" as const,
      title: "Курс",
      priceMinor: 1000,
      currency: "RUB",
      validityDays: null,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: {},
      paymentIntentId: null,
      paymentRef: "pay-1",
      payLinkId: null,
    };
    const product = {
      id: "prod-1",
      organizationId: "org-1",
      productType: "course" as const,
      title: "Курс",
      description: null,
      priceMinor: 1000,
      currency: "RUB",
      compositionJson: {},
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: "course-1",
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: false,
      isActive: true,
    };
    const setPurchaseStatus = vi.fn().mockResolvedValue({ ...purchase, status: "active" });
    const svc = createProductsService({
      port: makePort({
        getPurchase: vi.fn().mockResolvedValue(purchase),
        getProduct: vi.fn().mockResolvedValue(product),
        setPurchaseStatus,
        appendHistoryEvent: vi.fn(),
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: { enrollPatient } as never,
    });
    await svc.activatePurchase("pur-1", "org-1", "pay-1");
    expect(enrollPatient).toHaveBeenCalledWith({ courseId: "course-1", patientUserId: "u1" });
  });

  it("listActivePurchasesForBooking filters by service and visits", async () => {
    const purchase = {
      id: "pur-2",
      organizationId: "org-1",
      productId: "prod-2",
      productType: "promo" as const,
      platformUserId: "u1",
      buyerPhoneNormalized: null,
      giftRecipientPhoneNormalized: null,
      status: "active" as const,
      title: "Акция",
      priceMinor: 0,
      currency: "RUB",
      validityDays: null,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: { visitsRemaining: 2 },
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    };
    const product = {
      id: "prod-2",
      organizationId: "org-1",
      productType: "promo" as const,
      title: "Акция",
      description: null,
      priceMinor: 0,
      currency: "RUB",
      compositionJson: { serviceIds: ["svc-1"], visitCount: 2 },
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: null,
      courseId: null,
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: false,
      isActive: true,
    };
    const svc = createProductsService({
      port: makePort({
        listPurchasesForUser: vi.fn().mockResolvedValue([purchase]),
        getProduct: vi.fn().mockResolvedValue(product),
      }),
      payments: null,
      entitlements: null,
      memberships: null,
      courses: null,
    });
    const list = await svc.listActivePurchasesForBooking("u1", "org-1", "svc-1");
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("pur-2");
    const empty = await svc.listActivePurchasesForBooking("u1", "org-1", "other");
    expect(empty).toHaveLength(0);
  });

  it("activatePurchase links platform user from buyer phone before fulfillment", async () => {
    const setPurchaseStatus = vi.fn().mockResolvedValue({
      id: "pur-3",
      organizationId: "org-1",
      productId: "prod-3",
      productType: "content_access" as const,
      platformUserId: "u-guest",
      buyerPhoneNormalized: "+79991112233",
      giftRecipientPhoneNormalized: null,
      status: "offered" as const,
      title: "Доступ",
      priceMinor: 0,
      currency: "RUB",
      validityDays: 30,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: {},
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    });
    const purchase = {
      id: "pur-3",
      organizationId: "org-1",
      productId: "prod-3",
      productType: "content_access" as const,
      platformUserId: null,
      buyerPhoneNormalized: "+79991112233",
      giftRecipientPhoneNormalized: null,
      status: "offered" as const,
      title: "Доступ",
      priceMinor: 0,
      currency: "RUB",
      validityDays: 30,
      validFrom: null,
      validUntil: null,
      fulfillmentJson: {},
      paymentIntentId: null,
      paymentRef: null,
      payLinkId: null,
    };
    const product = {
      id: "prod-3",
      organizationId: "org-1",
      productType: "content_access" as const,
      title: "Доступ",
      description: null,
      priceMinor: 0,
      currency: "RUB",
      compositionJson: { contentIds: ["lesson-x"] },
      accessRulesJson: {},
      paymentRulesJson: {},
      validityDays: 30,
      courseId: null,
      subscriptionPackageId: null,
      showInPatientCatalog: true,
      payByLinkEnabled: false,
      isActive: true,
    };
    const grantContentAccessForPurchase = vi.fn();
    const getPurchase = vi.fn().mockResolvedValue(purchase);
    const svc = createProductsService({
      port: makePort({
        getPurchase,
        getProduct: vi.fn().mockResolvedValue(product),
        setPurchaseStatus,
        appendHistoryEvent: vi.fn(),
      }),
      payments: null,
      entitlements: { grantContentAccessForPurchase } as never,
      memberships: null,
      courses: null,
      resolvePlatformUserByPhone: vi.fn(async () => ({ ok: true as const, userId: "u-guest" })),
    });
    await svc.activatePurchase("pur-3", "org-1");
    expect(grantContentAccessForPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: "u-guest", contentIds: ["lesson-x"] }),
    );
  });
});
