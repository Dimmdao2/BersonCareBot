import type {
  PackageDeductionMode,
  PackageUsageKind,
  PatientPackageStatus,
} from '../../../db/schema/bookingMemberships';

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
  displayNumber: number;
  title: string;
  priceMinor: number;
  currency: string;
  validityDays: number | null;
  validFrom: string | null;
  validUntil: string | null;
  deductionMode: PackageDeductionMode;
  paymentIntentId: string | null;
  /**
   * The pay link the package's own payment offer issued. Kept on the package so a retried sale,
   * a reopened card or a second tab hands back the link that already exists instead of asking the
   * provider for a second invoice.
   */
  checkoutUrl: string | null;
  paymentRef: string | null;
  soldAt: string | null;
  paidAmountMinor: number | null;
  paidCurrency: string | null;
  createdAt: string;
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
  refunded: number;
  /** Available for new booking (reserves block overbooking). */
  remaining: number;
  /** Display: sessions not yet consumed (reserved still count as owned). */
  displayRemaining: number;
};

export type PatientPackageBalanceView = {
  patientPackageId: string;
  status: PatientPackageStatus;
  items: PackageItemBalance[];
};

/**
 * The read shape of a package. `checkoutUrl` is deliberately NOT part of it: the pay link is
 * answered only by the sale that issued it and by the tariff-gated
 * `GET /api/booking/memberships/payment-status`, so a list or a card can never hand out a live
 * invoice for a clinic that no longer has the `payments` mechanic.
 */
export type PatientPackageListItem = Omit<PatientPackageRecord, 'checkoutUrl'> & {
  balance: PatientPackageBalanceView;
};

export type PatientPackageSessionLinkage =
  | 'reserved'
  | 'consumed'
  | 'penalty'
  | 'released'
  | 'refunded'
  | 'none';

export type PatientPackageSessionMappingStatus = 'ok' | 'mapping_missing' | 'not_applicable';

/** Canonical "did it happen" verdict derived from `be_appointments`. */
export type CanonicalAppointmentStatus = 'happened' | 'canceled' | 'none';

/** Why a candidate past appointment was NOT debited during bulk «Пересчитать». */
export type RecalcSkipReason = 'already_debited' | 'service_not_in_package' | 'status_not_eligible';

export type RecalcDebitedEntry = {
  appointmentId: string;
  patientPackageItemId: string;
  serviceId: string;
  usageId: string;
};

export type RecalcSkippedEntry = {
  appointmentId: string;
  serviceId: string | null;
  reason: RecalcSkipReason;
};

/** A consume auto-reversed by «Пересчитать» because the visit is cancelled in the canonical projection. */
export type RecalcCorrectedEntry = {
  appointmentId: string;
  serviceId: string | null;
  /** The refund usage id written to reverse the erroneous consume. */
  refundUsageId: string;
};

/** Summary returned by `recalcPastSessionsForPackage` (feeds the doctor toast). */
export type RecalcPastSessionsSummary = {
  patientPackageId: string;
  debited: RecalcDebitedEntry[];
  skipped: RecalcSkippedEntry[];
  /** Appointments eligible by status+service but not debited because the package ran out. */
  outOfBalance: Array<{ appointmentId: string; serviceId: string }>;
  /**
   * Consumes reversed this pass because the visit is cancelled in the canonical projection —
   * self-correction of earlier erroneous debits (e.g. a visit consumed before its cancellation
   * was reflected). Append-only refund; never worsens balance.
   */
  corrected: RecalcCorrectedEntry[];
};

export type PatientPackageSessionRow = {
  appointmentId: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  branchTitle: string | null;
  serviceTitle: string;
  serviceId: string | null;
  linkage: PatientPackageSessionLinkage;
  mappingStatus: PatientPackageSessionMappingStatus;
  isPast: boolean;
  actions: {
    canUnlinkReserve: boolean;
    canRefundConsumed: boolean;
    canManualConsume: boolean;
    canOpenInCalendar: boolean;
  };
};
