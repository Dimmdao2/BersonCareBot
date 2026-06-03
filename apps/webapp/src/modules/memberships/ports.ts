import type {
  PackageDeductionMode,
  PackageItemInput,
  PackageUsageRecord,
  PatientPackageListItem,
  PatientPackageRecord,
  SubscriptionPackageRecord,
} from "./types";

export type UpsertSubscriptionPackageInput = {
  organizationId: string;
  id?: string;
  title: string;
  description?: string | null;
  priceMinor: number;
  currency?: string;
  validityDays?: number | null;
  deductionMode?: PackageDeductionMode;
  isActive?: boolean;
  items: PackageItemInput[];
};

export type CreateManualPatientPackageInput = {
  organizationId: string;
  platformUserId: string;
  title: string;
  priceMinor: number;
  currency?: string;
  validityDays?: number | null;
  deductionMode?: PackageDeductionMode;
  items: PackageItemInput[];
  assignedByPlatformUserId?: string | null;
  notes?: string | null;
  sendForPayment?: boolean;
  soldAt?: string | null;
  paidAmountMinor?: number | null;
  paidCurrency?: string | null;
  /** Doctor sale: activate immediately without payment intent. */
  activateImmediately?: boolean;
};

export type MembershipsPort = {
  listCatalogPackages(organizationId: string, activeOnly?: boolean): Promise<SubscriptionPackageRecord[]>;
  getCatalogPackage(id: string, organizationId: string): Promise<SubscriptionPackageRecord | null>;
  upsertCatalogPackage(input: UpsertSubscriptionPackageInput): Promise<SubscriptionPackageRecord>;

  getPatientPackage(id: string, organizationId: string): Promise<PatientPackageRecord | null>;
  listPatientPackagesForUser(
    platformUserId: string,
    organizationId: string,
    statuses?: string[],
  ): Promise<PatientPackageRecord[]>;
  listPatientPackagesForPatientIds(
    organizationId: string,
    platformUserIds: string[],
  ): Promise<PatientPackageRecord[]>;

  createManualPatientPackage(input: CreateManualPatientPackageInput): Promise<PatientPackageRecord>;
  offerCatalogPackageToPatient(input: {
    organizationId: string;
    platformUserId: string;
    subscriptionPackageId: string;
    assignedByPlatformUserId?: string | null;
  }): Promise<PatientPackageRecord>;

  setPatientPackageStatus(
    id: string,
    organizationId: string,
    status: PatientPackageRecord["status"],
    patch?: Partial<{
      paymentIntentId: string | null;
      paymentRef: string | null;
      validFrom: string | null;
      validUntil: string | null;
      soldAt: string | null;
      paidAmountMinor: number | null;
      paidCurrency: string | null;
    }>,
  ): Promise<PatientPackageRecord | null>;

  appendUsage(input: {
    organizationId: string;
    patientPackageId: string;
    patientPackageItemId: string;
    appointmentId?: string | null;
    usageKind: PackageUsageRecord["usageKind"];
    quantity?: number;
    comment?: string | null;
    createdByPlatformUserId?: string | null;
  }): Promise<PackageUsageRecord>;

  listUsagesForPackage(patientPackageId: string, organizationId: string): Promise<PackageUsageRecord[]>;
  listUsagesForAppointment(appointmentId: string, organizationId: string): Promise<PackageUsageRecord[]>;

  appendHistoryEvent(input: {
    organizationId: string;
    patientPackageId: string;
    eventType: string;
    payloadJson?: Record<string, unknown>;
  }): Promise<void>;

  listHistoryForPackage(patientPackageId: string, organizationId: string): Promise<
    Array<{ id: string; eventType: string; payloadJson: Record<string, unknown>; occurredAt: string }>
  >;

  setAppointmentPackageUsageRef(appointmentId: string, usageRef: string | null): Promise<void>;
};
