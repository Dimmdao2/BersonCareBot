import {
  BE_PRODUCT_TYPES,
  type BeProductType,
  type ProductPurchaseStatus,
} from "../../../db/schema/bookingProducts";

export { BE_PRODUCT_TYPES };

export type ProductComposition = {
  serviceIds?: string[];
  contentIds?: string[];
  visitCount?: number;
};

export type ProductAccessRules = {
  contentIds?: string[];
  grantCourseEnrollment?: boolean;
};

export type ProductRecord = {
  id: string;
  organizationId: string;
  productType: BeProductType;
  title: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  compositionJson: ProductComposition;
  accessRulesJson: ProductAccessRules;
  paymentRulesJson: Record<string, unknown>;
  validityDays: number | null;
  courseId: string | null;
  subscriptionPackageId: string | null;
  showInPatientCatalog: boolean;
  payByLinkEnabled: boolean;
  isActive: boolean;
};

export type ProductPayLinkRecord = {
  id: string;
  organizationId: string;
  productId: string;
  token: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
};

export type ProductPurchaseRecord = {
  id: string;
  organizationId: string;
  productId: string;
  productType: BeProductType;
  platformUserId: string | null;
  buyerPhoneNormalized: string | null;
  giftRecipientPhoneNormalized: string | null;
  status: ProductPurchaseStatus;
  title: string;
  priceMinor: number;
  currency: string;
  validityDays: number | null;
  validFrom: string | null;
  validUntil: string | null;
  fulfillmentJson: Record<string, unknown>;
  paymentIntentId: string | null;
  paymentRef: string | null;
  payLinkId: string | null;
};

export type ProductPurchaseListItem = ProductPurchaseRecord & {
  product?: Pick<ProductRecord, "title" | "productType">;
};

export type UpsertProductInput = {
  organizationId: string;
  id?: string;
  productType: BeProductType;
  title: string;
  description?: string | null;
  priceMinor: number;
  currency?: string;
  compositionJson?: ProductComposition;
  accessRulesJson?: ProductAccessRules;
  paymentRulesJson?: Record<string, unknown>;
  validityDays?: number | null;
  courseId?: string | null;
  subscriptionPackageId?: string | null;
  showInPatientCatalog?: boolean;
  payByLinkEnabled?: boolean;
  isActive?: boolean;
};
