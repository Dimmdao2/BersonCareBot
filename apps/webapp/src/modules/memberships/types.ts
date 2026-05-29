import type {
  PackageDeductionMode,
  PackageUsageKind,
  PatientPackageStatus,
} from "../../../db/schema/bookingMemberships";

export type { PackageDeductionMode, PackageUsageKind, PatientPackageStatus };

export type PackageItemInput = {
  serviceId: string;
  quantity: number;
  sortOrder?: number;
};

export type SubscriptionPackageRecord = {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  validityDays: number | null;
  deductionMode: PackageDeductionMode;
  isActive: boolean;
  items: Array<{
    id: string;
    serviceId: string;
    quantity: number;
    sortOrder: number;
  }>;
};

export type PatientPackageItemRecord = {
  id: string;
  serviceId: string;
  quantityInitial: number;
  sortOrder: number;
};

export type PackageUsageRecord = {
  id: string;
  patientPackageId: string;
  patientPackageItemId: string;
  appointmentId: string | null;
  usageKind: PackageUsageKind;
  quantity: number;
  comment: string | null;
  occurredAt: string;
};

export type PatientPackageRecord = {
  id: string;
  organizationId: string;
  platformUserId: string;
  subscriptionPackageId: string | null;
  status: PatientPackageStatus;
  title: string;
  priceMinor: number;
  currency: string;
  validityDays: number | null;
  validFrom: string | null;
  validUntil: string | null;
  deductionMode: PackageDeductionMode;
  paymentIntentId: string | null;
  paymentRef: string | null;
  notes: string | null;
  items: PatientPackageItemRecord[];
};

export type PackageItemBalance = {
  patientPackageItemId: string;
  serviceId: string;
  serviceTitle?: string | null;
  quantityInitial: number;
  reserved: number;
  consumed: number;
  released: number;
  penalty: number;
  remaining: number;
};

export type PatientPackageBalanceView = {
  patientPackageId: string;
  status: PatientPackageStatus;
  items: PackageItemBalance[];
};

export type PatientPackageListItem = PatientPackageRecord & {
  balance: PatientPackageBalanceView;
};
