import type {
  ProductPayLinkRecord,
  ProductPurchaseRecord,
  ProductRecord,
  UpsertProductInput,
} from "./types";

export type ProductsPort = {
  listProducts(organizationId: string, activeOnly?: boolean): Promise<ProductRecord[]>;
  getProduct(id: string, organizationId: string): Promise<ProductRecord | null>;
  upsertProduct(input: UpsertProductInput): Promise<ProductRecord>;
  createPayLink(input: {
    organizationId: string;
    productId: string;
    token: string;
    expiresAt?: string | null;
    maxUses?: number | null;
  }): Promise<ProductPayLinkRecord>;
  getPayLinkByToken(token: string): Promise<(ProductPayLinkRecord & { product: ProductRecord }) | null>;
  incrementPayLinkUse(payLinkId: string): Promise<void>;

  createPurchase(input: {
    organizationId: string;
    productId: string;
    productType: ProductRecord["productType"];
    platformUserId?: string | null;
    buyerPhoneNormalized?: string | null;
    giftRecipientPhoneNormalized?: string | null;
    title: string;
    priceMinor: number;
    currency: string;
    validityDays?: number | null;
    payLinkId?: string | null;
    assignedByPlatformUserId?: string | null;
    fulfillmentJson?: Record<string, unknown>;
  }): Promise<ProductPurchaseRecord>;

  getPurchase(id: string, organizationId: string): Promise<ProductPurchaseRecord | null>;
  listPurchasesForUser(platformUserId: string, organizationId: string): Promise<ProductPurchaseRecord[]>;
  listPurchasesByPhone(phoneNormalized: string, organizationId: string): Promise<ProductPurchaseRecord[]>;
  linkPurchasesByPhone(platformUserId: string, phoneNormalized: string, organizationId: string): Promise<number>;
  setPurchaseStatus(
    id: string,
    organizationId: string,
    status: ProductPurchaseRecord["status"],
    patch?: Partial<
      Pick<
        ProductPurchaseRecord,
        | "paymentIntentId"
        | "paymentRef"
        | "validFrom"
        | "validUntil"
        | "fulfillmentJson"
        | "platformUserId"
        | "buyerPhoneNormalized"
      >
    >,
  ): Promise<ProductPurchaseRecord | null>;

  appendHistoryEvent(input: {
    organizationId: string;
    productPurchaseId: string;
    eventType: string;
    payloadJson?: Record<string, unknown>;
  }): Promise<void>;
};
