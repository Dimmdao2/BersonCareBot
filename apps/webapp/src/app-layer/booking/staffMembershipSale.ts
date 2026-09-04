import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { PackageItemInput } from '@/modules/memberships/types';

type StaffMembershipSaleDeps = Pick<
  ReturnType<typeof buildAppDeps>,
  'memberships' | 'patientPayments'
>;

export type StaffMembershipSaleMethod = 'cash' | 'link' | 'free';

type CommonSaleInput = {
  organizationId: string;
  platformUserId: string;
  assignedByPlatformUserId: string | null;
  createdBy: string;
  method: StaffMembershipSaleMethod;
  /** One sale attempt; a retry carrying the same key converges on the same package and payment. */
  saleIdempotencyKey: string;
  soldAt: string | null;
  notes: string | null;
  /**
   * Whether this clinic's tariff lets it write the cash ledger at all. The cash journal and its
   * KPI are a `payments` mechanic feature; a clinic without it has no ledger to diverge from, and
   * recording an offline sale must stay available to it (`memberships.md`).
   */
  cashLedgerAvailable: boolean;
};

export type StaffMembershipSaleInput = CommonSaleInput &
  (
    | {
        kind: 'manual';
        title?: string;
        priceMinor: number;
        currency?: string;
        validityDays: number | null;
        deductionMode?: 'auto_on_visit_confirmed' | 'manual';
        items: PackageItemInput[];
      }
    | { kind: 'catalog'; subscriptionPackageId: string }
  );

/**
 * The DB principals each write runs inside. They are supplied by the route because the principal is
 * request-scoped, and they are separate because the two writes cross two different tenant doors.
 */
export type StaffMembershipSaleRunners = {
  runMembershipWrite: <T>(fn: () => Promise<T>) => Promise<T>;
  runCashWrite: <T>(fn: () => Promise<T>) => Promise<T>;
};

export type StaffMembershipSaleResult = {
  package: Awaited<ReturnType<NonNullable<StaffMembershipSaleDeps['memberships']>['listPatientPackagesForUser']>>[number] & {
    checkoutUrl?: string | null;
  };
  /** True only when a `patient_payment` cash row exists for this sale. */
  cashLedgerRecorded: boolean;
};

/**
 * The staff membership sale, end to end and server-owned.
 *
 * Lives in app-layer for the same reason `staffAppointmentPayments` does: `memberships` and
 * `patient-payments` may not depend on each other, and parameterizing either with the other's port
 * would reverse that boundary. What it does NOT do is open a second money path — the cash row is
 * written through the one existing cash door, `patientPayments.addCashPayment`, with the package as
 * its subject instead of an appointment.
 *
 * Order matters and is the point: create the package unsettled → write the cash → activate. Both
 * writes are keyed, so a network retry, a second tab or a crash between the steps converges on one
 * package and one payment rather than producing a second active package stamped with a second full
 * payment (the MONEY-11 finding).
 */
export function createStaffMembershipSale(deps: StaffMembershipSaleDeps) {
  async function sell(
    input: StaffMembershipSaleInput,
    runners: StaffMembershipSaleRunners,
  ): Promise<StaffMembershipSaleResult> {
    const memberships = deps.memberships;
    if (!memberships) throw new Error('memberships_unavailable');

    // `cash` is settled below, after its money is in the ledger; `free`/`link` are settled by the
    // memberships service itself, which is why they are the only intents forwarded here.
    const sale =
      input.method === 'cash'
        ? ({ method: 'cash', soldAt: input.soldAt } as const)
        : input.method === 'free'
          ? ({ method: 'free', soldAt: input.soldAt } as const)
          : ({ method: 'link' } as const);

    const created =
      input.kind === 'manual'
        ? await memberships.createManualPatientPackage({
            organizationId: input.organizationId,
            platformUserId: input.platformUserId,
            title: input.title,
            priceMinor: input.priceMinor,
            currency: input.currency,
            validityDays: input.validityDays,
            deductionMode: input.deductionMode,
            items: input.items,
            assignedByPlatformUserId: input.assignedByPlatformUserId,
            notes: input.notes,
            sale,
            saleIdempotencyKey: input.saleIdempotencyKey,
          },
          { runMembershipWrite: runners.runMembershipWrite })
        : await memberships.offerCatalogPackageToPatient({
            organizationId: input.organizationId,
            platformUserId: input.platformUserId,
            subscriptionPackageId: input.subscriptionPackageId,
            assignedByPlatformUserId: input.assignedByPlatformUserId,
            notes: input.notes,
            sale,
            saleIdempotencyKey: input.saleIdempotencyKey,
          },
          { runMembershipWrite: runners.runMembershipWrite });

    if (input.method !== 'cash') {
      return { package: created, cashLedgerRecorded: false };
    }

    // The amount is the package's own price snapshot. Nothing the caller sent can reach it.
    const amountMinor = created.priceMinor;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('sale_cash_requires_price');
    }

    let cashLedgerRecorded = false;
    if (input.cashLedgerAvailable) {
      await runners.runCashWrite(() =>
        deps.patientPayments.addCashPayment({
          organizationId: input.organizationId,
          patientUserId: input.platformUserId,
          patientPackageId: created.id,
          amountMinor,
          currency: created.currency,
          service: created.title,
          comment: 'Продажа абонемента, наличные',
          idempotencyKey: `staff-package-cash:${created.id}`,
          createdBy: input.createdBy,
        }),
      );
      cashLedgerRecorded = true;
    }

    const settled = await memberships.settleStaffCashSale(
      created.id,
      input.organizationId,
      { soldAt: input.soldAt },
      { runMembershipWrite: runners.runMembershipWrite },
    );
    return { package: settled, cashLedgerRecorded };
  }

  return { sell };
}
