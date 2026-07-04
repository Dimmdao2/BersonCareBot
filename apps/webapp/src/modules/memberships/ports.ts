import type {
  PackageDeductionMode,
  PackageItemInput,
  PackageUsageRecord,
  PatientPackageListItem,
  PatientPackageRecord,
  PatientPackageSessionRow,
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
  title?: string;
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
    notes?: string | null;
  }): Promise<PatientPackageRecord>;

  updatePatientPackageNotes(
    id: string,
    organizationId: string,
    notes: string | null,
  ): Promise<PatientPackageRecord | null>;

  listPackageAppointmentSessionSources(
    patientPackageId: string,
    organizationId: string,
    options: { nowIso?: string },
  ): Promise<
    Array<{
      appointmentId: string;
      startsAt: string;
      endsAt: string | null;
      status: string;
      branchTitle: string | null;
      serviceTitle: string | null;
      serviceId: string | null;
      usages: PackageUsageRecord[];
    }>
  >;

  /**
   * ST-01 bulk «Пересчитать»: past appointments of a patient for the package's services
   * within `[soldAtIso; nowIso)`, joined with any existing package usages (to skip already
   * debited ones). Unlike `listPackageAppointmentSessionSources`, this does NOT require a
   * pre-existing usage row — it finds appointments that were never linked to the package.
   */
  listRecalcCandidateAppointments(input: {
    organizationId: string;
    platformUserId: string;
    serviceIds: string[];
    soldAtIso: string;
    nowIso: string;
  }): Promise<
    Array<{
      appointmentId: string;
      startsAt: string;
      status: string;
      serviceId: string | null;
      usages: PackageUsageRecord[];
    }>
  >;

  /**
   * ST-02: serialize the bulk «Пересчитать» pass for a single patient package so two
   * concurrent recalc requests can never read the same balance and double-debit. The pg
   * port takes a Postgres transaction-scoped advisory lock keyed on the package id and runs
   * `fn` inside that transaction; the in-memory/fake port serializes with a simple mutex.
   * All debits for one pass happen inside `fn`.
   */
  runWithPackageLock<T>(
    patientPackageId: string,
    organizationId: string,
    fn: () => Promise<T>,
  ): Promise<T>;

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

  /**
   * ST-01 atomic consume for a single appointment during bulk «Пересчитать».
   * Executes in a single DB transaction:
   *   1. INSERT consume into be_package_usages
   *   2. UPDATE appointment.packageUsageRef
   *   3. INSERT recalc_consumed history event
   * Returns the created usage record.
   * Throws an Error with message "duplicate_consume" if a consume row for this
   * appointment already exists (UNIQUE constraint violation — concurrent double-debit guard).
   */
  recalcConsumeForAppointment(input: {
    organizationId: string;
    patientPackageId: string;
    patientPackageItemId: string;
    appointmentId: string;
    createdByPlatformUserId: string | null;
    serviceId: string;
    payloadJson?: Record<string, unknown>;
  }): Promise<PackageUsageRecord>;
};
