import type { createBookingEngineService } from '@/modules/booking-engine/service';
import type { PaymentsService } from '@/modules/payments/service';
import { env } from '@/config/env';
import {
  computeItemBalances,
  findItemForService,
  hasAvailableForService,
} from './balanceCalculator';
import { pickPatientPackageFefo } from './fefoPicker';
import type { MembershipsPort } from './ports';
import type {
  PatientPackageBalanceView,
  PatientPackageListItem,
  PatientPackageRecord,
  SubscriptionPackageRecord,
} from './types';

type BookingEngineService = Pick<
  ReturnType<typeof createBookingEngineService>,
  'getAppointment' | 'getStatusBeforePackageCharge' | 'transitionAppointmentStatus'
>;

export type MembershipWriteOptions = {
  runMembershipWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

function runMembershipWrite<T>(
  options: MembershipWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runMembershipWrite ? options.runMembershipWrite(fn) : fn();
}

import { parsePatientPackageProductRef } from './patientPackageProductRef';
import { isPatientPackageExpired, isPatientPackageWithinValidity } from './packageValidity';
import { buildManualPatientPackageTitle } from './packageManualTitle';
import {
  computeAppointmentPackageLinkage,
  resolvePackageSessionMappingStatus,
} from './packageSessionLinkage';
import type {
  CanonicalAppointmentStatus,
  PackageUsageRecord,
  PatientPackageSessionRow,
  RecalcPastSessionsSummary,
} from './types';

/**
 * FALLBACK denylist of `be_appointments.status` values meaning "definitely did NOT happen",
 * used only when the canonical appointment row is missing from the repo-side status lookup.
 *
 * "rescheduled" is excluded because it means the appointment was moved to a new slot — the
 * original slot never happened.
 */
const APPOINTMENT_INELIGIBLE_STATUSES: ReadonlySet<string> = new Set([
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
  'rescheduled',
]);

/**
 * Returns true if a PAST appointment is eligible for package deduction.
 * Repo-side `canonicalStatus` is authoritative: `canceled` -> never eligible,
 * `happened` -> eligible. Only when the row is missing (`none`) do we fall back
 * to the appointment status denylist.
 */
function isAppointmentEligibleForConsume(
  status: string,
  canonicalStatus: CanonicalAppointmentStatus,
  startsAt: string,
  endsAt: string | null,
  nowIso: string,
): boolean {
  const pastBoundary = endsAt ?? startsAt;
  if (pastBoundary >= nowIso) return false;
  if (canonicalStatus === 'canceled') return false;
  if (canonicalStatus === 'happened') return true;
  return !APPOINTMENT_INELIGIBLE_STATUSES.has(status);
}

export type PackageDetachOutcome = 'release_reserve' | 'charge_as_delivered' | 'refund_consumed';

function addValidity(validFrom: string, validityDays: number | null): string | null {
  if (validityDays == null || validityDays <= 0) return null;
  const d = new Date(validFrom);
  d.setUTCDate(d.getUTCDate() + validityDays);
  return d.toISOString();
}

const PACKAGE_CHARGE_REVERT_STATUSES = ['visit_confirmed', 'confirmed', 'completed'] as const;

const APPOINTMENT_DEBIT_USAGE_KINDS: ReadonlySet<PackageUsageRecord['usageKind']> = new Set([
  'consume',
  'penalty',
  'manual_adjust',
]);

function hasReserveWithoutRelease(usages: PackageUsageRecord[]): boolean {
  const reserved = usages.some((u) => u.usageKind === 'reserve');
  if (!reserved) return false;
  return !usages.some((u) => u.usageKind === 'release');
}

function isPaymentOfferConfigurationError(code: string): boolean {
  return (
    code === 'payments_disabled' ||
    code === 'payment_provider_unavailable' ||
    code === 'payments_unavailable'
  );
}

function findAppointmentDebit(usages: PackageUsageRecord[]): PackageUsageRecord | null {
  const debits = usages.filter((u) => APPOINTMENT_DEBIT_USAGE_KINDS.has(u.usageKind));
  if (debits.length === 0) return null;
  return debits[debits.length - 1] ?? null;
}

export function createMembershipsService(deps: {
  port: MembershipsPort;
  payments: PaymentsService | null;
  bookingEngine: BookingEngineService | null;
  resolveServiceTitle?: (serviceId: string) => Promise<string | null>;
  /** Refreshes GCal after consume / penalty ref update (best-effort). */
  refreshPackageCalendar?: (appointmentId: string) => Promise<void>;
  /**
   * 3.2: physically refuses a subscriptions write unless a passing `subscriptions` mutation
   * decision already ran in this request (injected from `buildAppDeps.ts` as
   * `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'subscriptions') => void;
}) {
  async function refreshPackageCalendarForAppointment(appointmentId: string) {
    if (!deps.refreshPackageCalendar) return;
    try {
      await deps.refreshPackageCalendar(appointmentId);
    } catch {
      // Calendar sync is best-effort.
    }
  }
  async function refreshPatientPackageRecord(
    pkg: PatientPackageRecord,
  ): Promise<PatientPackageRecord> {
    if (isPatientPackageExpired(pkg) && pkg.status === 'active') {
      const updated = await deps.port.setPatientPackageStatus(
        pkg.id,
        pkg.organizationId,
        'expired',
      );
      if (updated) {
        await deps.port.appendHistoryEvent({
          organizationId: pkg.organizationId,
          patientPackageId: pkg.id,
          eventType: 'expired',
          payloadJson: { validUntil: pkg.validUntil },
        });
        return updated;
      }
      return { ...pkg, status: 'expired' };
    }
    return pkg;
  }

  async function withBalance(pkg: PatientPackageRecord): Promise<PatientPackageListItem> {
    const fresh = await refreshPatientPackageRecord(pkg);
    const usages = await deps.port.listUsagesForPackage(fresh.id, fresh.organizationId);
    const itemBalances = computeItemBalances(fresh.items, usages);
    const items = await Promise.all(
      itemBalances.map(async (row) => ({
        ...row,
        serviceTitle: deps.resolveServiceTitle
          ? await deps.resolveServiceTitle(row.serviceId)
          : null,
      })),
    );
    const balance: PatientPackageBalanceView = {
      patientPackageId: fresh.id,
      status: fresh.status,
      items,
    };
    return { ...fresh, balance };
  }

  return {
    async listCatalogPackages(organizationId: string, activeOnly = true) {
      return deps.port.listCatalogPackages(organizationId, activeOnly);
    },

    async getCatalogPackage(id: string, organizationId: string) {
      return deps.port.getCatalogPackage(id, organizationId);
    },

    async upsertCatalogPackage(
      input: Parameters<MembershipsPort['upsertCatalogPackage']>[0],
    ): Promise<SubscriptionPackageRecord> {
      deps.assertWriteClearance?.('subscriptions');
      return deps.port.upsertCatalogPackage(input);
    },

    async listPatientPackagesForUser(platformUserId: string, organizationId: string) {
      const rows = await deps.port.listPatientPackagesForUser(platformUserId, organizationId);
      return Promise.all(rows.map((r) => withBalance(r)));
    },

    async getPatientPackageDetail(id: string, organizationId: string) {
      const pkg = await deps.port.getPatientPackage(id, organizationId);
      if (!pkg) return null;
      const usages = await deps.port.listUsagesForPackage(id, organizationId);
      const history = await deps.port.listHistoryForPackage(id, organizationId);
      return {
        package: await withBalance(pkg),
        usages,
        history,
      };
    },

    async createManualPatientPackage(
      input: Parameters<MembershipsPort['createManualPatientPackage']>[0],
      options?: MembershipWriteOptions,
    ) {
      deps.assertWriteClearance?.('subscriptions');
      const title =
        input.title?.trim() ||
        buildManualPatientPackageTitle({
          itemCount: input.items.length,
          soldAtIso: input.soldAt,
        });
      const pkg = await runMembershipWrite(options, () =>
        deps.port.createManualPatientPackage({ ...input, title }),
      );
      await runMembershipWrite(options, () =>
        deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          patientPackageId: pkg.id,
          eventType: 'manual_created',
          payloadJson: { title: input.title, priceMinor: input.priceMinor },
        }),
      );
      const staffSold =
        input.activateImmediately === true ||
        (input.soldAt != null && input.paidAmountMinor != null && input.sendForPayment === false);
      if (input.priceMinor > 0 && input.sendForPayment !== false && !staffSold) {
        return this.createPaymentOfferOrKeepOffered(
          pkg.id,
          input.organizationId,
          input.platformUserId,
          pkg,
          options,
        );
      }
      const activated = await this.activatePatientPackage(
        pkg.id,
        input.organizationId,
        undefined,
        options,
      );
      return activated ?? (await withBalance(pkg));
    },

    async offerCatalogPackageToPatient(
      input: {
        organizationId: string;
        platformUserId: string;
        subscriptionPackageId: string;
        assignedByPlatformUserId?: string | null;
        notes?: string | null;
        soldAt?: string | null;
        paidAmountMinor?: number | null;
        paidCurrency?: string | null;
        activateImmediately?: boolean;
      },
      options?: MembershipWriteOptions,
    ) {
      deps.assertWriteClearance?.('subscriptions');
      const pkg = await runMembershipWrite(options, () =>
        deps.port.offerCatalogPackageToPatient(input),
      );
      await runMembershipWrite(options, () =>
        deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          patientPackageId: pkg.id,
          eventType: 'catalog_offered',
          payloadJson: { subscriptionPackageId: input.subscriptionPackageId },
        }),
      );
      const staffSold =
        input.activateImmediately === true ||
        (input.soldAt != null && input.paidAmountMinor != null);
      if (staffSold || input.activateImmediately === true) {
        const activated = await this.activatePatientPackageFromDoctorSale(
          pkg.id,
          input.organizationId,
          {
            soldAt: input.soldAt ?? null,
            paidAmountMinor: input.paidAmountMinor ?? pkg.priceMinor,
            paidCurrency: input.paidCurrency,
            paymentRef: `doctor_sale:${pkg.id}`,
          },
          options,
        );
        return activated ?? (await withBalance(pkg));
      }
      if (pkg.priceMinor > 0) {
        return this.createPaymentOfferOrKeepOffered(
          pkg.id,
          input.organizationId,
          input.platformUserId,
          pkg,
          options,
        );
      }
      const activated = await this.activatePatientPackage(
        pkg.id,
        input.organizationId,
        undefined,
        options,
      );
      return activated ?? (await withBalance(pkg));
    },

    async createPaymentOffer(
      patientPackageId: string,
      organizationId: string,
      platformUserId: string,
      options?: MembershipWriteOptions,
    ) {
      const pkg = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!pkg) throw new Error('package_not_found');
      if (!deps.payments) throw new Error('payments_unavailable');
      const idempotencyKey = `package:${patientPackageId}:offer`;
      const returnUrl = `${env.APP_BASE_URL}/app/patient/memberships/pay?patientPackageId=${encodeURIComponent(patientPackageId)}`;
      const intent = await deps.payments.createPackagePaymentIntent({
        organizationId,
        platformUserId,
        patientPackageId,
        amountMinor: pkg.priceMinor,
        currency: pkg.currency,
        idempotencyKey,
        returnUrl,
      });
      await runMembershipWrite(options, async () => {
        await deps.port.setPatientPackageStatus(
          patientPackageId,
          organizationId,
          'awaiting_payment',
          {
            paymentIntentId: intent.id,
          },
        );
        await deps.port.appendHistoryEvent({
          organizationId,
          patientPackageId,
          eventType: 'payment_offer_created',
          payloadJson: { intentId: intent.id, amountMinor: pkg.priceMinor },
        });
      });
      const updated = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!updated) throw new Error('package_not_found');
      return {
        ...(await withBalance(updated)),
        paymentIntentId: intent.id,
        checkoutUrl: intent.checkoutUrl,
      };
    },

    async createPaymentOfferOrKeepOffered(
      patientPackageId: string,
      organizationId: string,
      platformUserId: string,
      fallbackPkg: PatientPackageRecord,
      options?: MembershipWriteOptions,
    ) {
      try {
        return await this.createPaymentOffer(
          patientPackageId,
          organizationId,
          platformUserId,
          options,
        );
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (isPaymentOfferConfigurationError(code)) {
          return withBalance(fallbackPkg);
        }
        throw err;
      }
    },

    async activatePatientPackageFromDoctorSale(
      patientPackageId: string,
      organizationId: string,
      input: {
        soldAt?: string | null;
        paidAmountMinor?: number | null;
        paidCurrency?: string | null;
        paymentRef?: string;
      },
      options?: MembershipWriteOptions,
    ) {
      const activated = await this.activatePatientPackage(
        patientPackageId,
        organizationId,
        input.paymentRef,
        options,
      );
      if (!activated) return null;
      const now = input.soldAt ?? new Date().toISOString();
      const updated = await runMembershipWrite(options, () =>
        deps.port.setPatientPackageStatus(patientPackageId, organizationId, 'active', {
          soldAt: now,
          paidAmountMinor: input.paidAmountMinor ?? activated.priceMinor,
          paidCurrency: input.paidCurrency ?? activated.currency,
        }),
      );
      return updated ? withBalance(updated) : activated;
    },

    async activatePatientPackage(
      patientPackageId: string,
      organizationId: string,
      paymentRef?: string,
      options?: MembershipWriteOptions,
    ) {
      const pkg = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!pkg) return null;
      if (pkg.status === 'active') return withBalance(pkg);
      const now = new Date().toISOString();
      const validUntil = addValidity(now, pkg.validityDays);
      const updated = await runMembershipWrite(options, () =>
        deps.port.setPatientPackageStatus(patientPackageId, organizationId, 'active', {
          paymentRef: paymentRef ?? pkg.paymentRef,
          validFrom: now,
          validUntil,
        }),
      );
      if (!updated) return null;
      await runMembershipWrite(options, () =>
        deps.port.appendHistoryEvent({
          organizationId,
          patientPackageId,
          eventType: 'activated',
          payloadJson: { paymentRef: paymentRef ?? null },
        }),
      );
      return withBalance(updated);
    },

    async capturePackagePayment(intentId: string, organizationId: string, platformUserId: string) {
      if (!deps.payments) throw new Error('payments_unavailable');
      const result = await deps.payments.captureIntentForPatient(
        intentId,
        organizationId,
        platformUserId,
      );
      const productRef = parsePatientPackageProductRef(result.intent.productRef);
      if (productRef) {
        await this.activatePatientPackage(productRef, organizationId, result.payment?.id);
      }
      return result;
    },

    async pickAutoPackageForBooking(
      platformUserId: string,
      organizationId: string,
      serviceId: string,
    ): Promise<PatientPackageListItem | null> {
      const eligible = await this.listActivePackagesForBooking(
        platformUserId,
        organizationId,
        serviceId,
      );
      return pickPatientPackageFefo(eligible, serviceId);
    },

    async listActivePackagesForBooking(
      platformUserId: string,
      organizationId: string,
      serviceId: string,
    ) {
      const rows = await deps.port.listPatientPackagesForUser(platformUserId, organizationId, [
        'active',
      ]);
      const out: PatientPackageListItem[] = [];
      for (const pkg of rows) {
        const withBal = await withBalance(pkg);
        if (!isPatientPackageWithinValidity(withBal)) continue;
        if (hasAvailableForService(withBal.balance.items, serviceId)) {
          out.push(withBal);
        }
      }
      return out;
    },

    async listCatalogPackagesForPatient(organizationId: string) {
      return deps.port.listCatalogPackages(organizationId, true);
    },

    async purchaseCatalogPackageForPatient(input: {
      organizationId: string;
      platformUserId: string;
      subscriptionPackageId: string;
    }) {
      deps.assertWriteClearance?.('subscriptions');
      return this.offerCatalogPackageToPatient({
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
        subscriptionPackageId: input.subscriptionPackageId,
      });
    },

    async reserveForAppointment(input: {
      organizationId: string;
      patientPackageId: string;
      serviceId: string;
      appointmentId: string;
      platformUserId: string;
    }) {
      deps.assertWriteClearance?.('subscriptions');
      return deps.port.runWithPackageLock(
        input.patientPackageId,
        input.organizationId,
        async () => {
          const raw = await deps.port.getPatientPackage(
            input.patientPackageId,
            input.organizationId,
          );
          if (!raw || raw.platformUserId !== input.platformUserId) {
            throw new Error('package_not_found');
          }
          const pkg = await refreshPatientPackageRecord(raw);
          if (!isPatientPackageWithinValidity(pkg)) throw new Error('package_expired');
          if (pkg.status !== 'active') throw new Error('package_not_active');
          const usages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
          const balances = computeItemBalances(pkg.items, usages);
          const found = findItemForService(pkg.items, balances, input.serviceId);
          if (!found) throw new Error('package_no_balance');

          const usage = await deps.port.appendUsage({
            organizationId: input.organizationId,
            patientPackageId: pkg.id,
            patientPackageItemId: found.item.id,
            appointmentId: input.appointmentId,
            usageKind: 'reserve',
            quantity: 1,
          });
          await deps.port.setAppointmentPackageUsageRef(input.appointmentId, usage.id);
          await deps.port.appendHistoryEvent({
            organizationId: input.organizationId,
            patientPackageId: pkg.id,
            eventType: 'reserved_for_appointment',
            payloadJson: { appointmentId: input.appointmentId, usageId: usage.id },
          });
          return usage;
        },
      );
    },

    async consumeForAppointment(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
      asPenalty?: boolean;
    }) {
      deps.assertWriteClearance?.('subscriptions');
      const usages = await deps.port.listUsagesForAppointment(
        input.appointmentId,
        input.organizationId,
      );
      const existingDebit = findAppointmentDebit(usages);
      if (existingDebit) {
        if (hasReserveWithoutRelease(usages)) {
          await deps.port.finalizeAppointmentDebit({
            organizationId: input.organizationId,
            patientPackageId: existingDebit.patientPackageId,
            patientPackageItemId: existingDebit.patientPackageItemId,
            appointmentId: input.appointmentId,
            debitUsageId: existingDebit.id,
            createdByPlatformUserId: input.createdByPlatformUserId ?? null,
          });
        }
        return existingDebit;
      }

      const reserve = usages.find((u) => u.usageKind === 'reserve');
      if (!reserve) throw new Error('no_reserve');

      const pkg = await deps.port.getPatientPackage(reserve.patientPackageId, input.organizationId);
      if (!pkg) throw new Error('package_not_found');

      let consume: PackageUsageRecord;
      try {
        consume = await deps.port.recordReservedAppointmentDebit({
          organizationId: input.organizationId,
          patientPackageId: reserve.patientPackageId,
          patientPackageItemId: reserve.patientPackageItemId,
          appointmentId: input.appointmentId,
          usageKind: input.asPenalty ? 'penalty' : 'consume',
          createdByPlatformUserId: input.createdByPlatformUserId ?? null,
          eventType: input.asPenalty ? 'penalty_consumed' : 'consumed',
        });
      } catch (err) {
        if ((err as { code?: string })?.code === '23505') {
          const freshUsages = await deps.port.listUsagesForAppointment(
            input.appointmentId,
            input.organizationId,
          );
          const freshDebit = findAppointmentDebit(freshUsages);
          if (freshDebit) {
            if (hasReserveWithoutRelease(freshUsages)) {
              await deps.port.finalizeAppointmentDebit({
                organizationId: input.organizationId,
                patientPackageId: freshDebit.patientPackageId,
                patientPackageItemId: freshDebit.patientPackageItemId,
                appointmentId: input.appointmentId,
                debitUsageId: freshDebit.id,
                createdByPlatformUserId: input.createdByPlatformUserId ?? null,
              });
            }
            return freshDebit;
          }
        }
        throw err;
      }

      if (deps.bookingEngine && !input.asPenalty) {
        const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
        if (appt && appt.status !== 'charged_to_package') {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: input.appointmentId,
            toStatus: 'charged_to_package',
            payload: { source: 'membership_consume', usageId: consume.id },
          });
        }
      }

      await refreshPackageCalendarForAppointment(input.appointmentId);

      return consume;
    },

    async releaseReserveForAppointment(input: {
      organizationId: string;
      appointmentId: string;
      comment?: string | null;
    }) {
      const usages = await deps.port.listUsagesForAppointment(
        input.appointmentId,
        input.organizationId,
      );
      const reserve = usages.find((u) => u.usageKind === 'reserve');
      if (!reserve) return { ok: true as const, skipped: true as const };

      const hasConsume = usages.some((u) => APPOINTMENT_DEBIT_USAGE_KINDS.has(u.usageKind));
      if (hasConsume) return { ok: true as const, skipped: true as const };

      await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        patientPackageItemId: reserve.patientPackageItemId,
        appointmentId: input.appointmentId,
        usageKind: 'release',
        quantity: 1,
        comment: input.comment ?? null,
      });

      await deps.port.setAppointmentPackageUsageRef(input.appointmentId, null);

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        eventType: 'reserve_released',
        payloadJson: { appointmentId: input.appointmentId },
      });

      return { ok: true as const, skipped: false as const };
    },

    async penaltyDeductForAppointment(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
    }) {
      const usages = await deps.port.listUsagesForAppointment(
        input.appointmentId,
        input.organizationId,
      );
      const existingDebit = findAppointmentDebit(usages);
      if (existingDebit) {
        if (hasReserveWithoutRelease(usages)) {
          await deps.port.finalizeAppointmentDebit({
            organizationId: input.organizationId,
            patientPackageId: existingDebit.patientPackageId,
            patientPackageItemId: existingDebit.patientPackageItemId,
            appointmentId: input.appointmentId,
            debitUsageId: existingDebit.id,
            createdByPlatformUserId: input.createdByPlatformUserId ?? null,
          });
        }
        return existingDebit;
      }

      const reserve = usages.find((u) => u.usageKind === 'reserve');
      if (reserve) {
        return this.consumeForAppointment({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          createdByPlatformUserId: input.createdByPlatformUserId,
          asPenalty: true,
        });
      }
      if (!deps.bookingEngine) throw new Error('package_penalty_unavailable');
      const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
      if (!appt?.serviceId || !appt.platformUserId) throw new Error('package_no_balance');
      const serviceId = appt.serviceId;

      const linkedPackageId =
        usages.find((u) => u.usageKind === 'reserve')?.patientPackageId ??
        usages[0]?.patientPackageId;
      let patientPackageId = linkedPackageId;
      if (!patientPackageId) {
        const eligible = await this.listActivePackagesForBooking(
          appt.platformUserId,
          input.organizationId,
          serviceId,
        );
        if (eligible.length === 0) throw new Error('package_no_balance');
        patientPackageId = eligible[0]!.id;
      }

      let appended = false;
      const usage = await deps.port.runWithPackageLock(
        patientPackageId,
        input.organizationId,
        async () => {
          const raw = await deps.port.getPatientPackage(patientPackageId, input.organizationId);
          if (!raw) throw new Error('package_no_balance');
          const pkg = await refreshPatientPackageRecord(raw);
          const pkgUsages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
          const balances = computeItemBalances(pkg.items, pkgUsages);
          const found = findItemForService(pkg.items, balances, serviceId);
          if (!found) throw new Error('package_no_balance');

          let penaltyUsage: PackageUsageRecord;
          try {
            penaltyUsage = await deps.port.appendUsage({
              organizationId: input.organizationId,
              patientPackageId: pkg.id,
              patientPackageItemId: found.item.id,
              appointmentId: input.appointmentId,
              usageKind: 'penalty',
              quantity: 1,
              createdByPlatformUserId: input.createdByPlatformUserId ?? null,
            });
          } catch (err) {
            if ((err as { code?: string })?.code === '23505') {
              const freshUsages = await deps.port.listUsagesForAppointment(
                input.appointmentId,
                input.organizationId,
              );
              const freshDebit = findAppointmentDebit(freshUsages);
              if (freshDebit) return freshDebit;
            }
            throw err;
          }
          await deps.port.setAppointmentPackageUsageRef(input.appointmentId, penaltyUsage.id);
          await deps.port.appendHistoryEvent({
            organizationId: input.organizationId,
            patientPackageId: pkg.id,
            eventType: 'penalty_without_reserve',
            payloadJson: { appointmentId: input.appointmentId, usageId: penaltyUsage.id },
          });
          appended = true;
          return penaltyUsage;
        },
      );
      if (appended) {
        await refreshPackageCalendarForAppointment(input.appointmentId);
      }
      return usage;
    },

    async applyCancelPackageOutcome(input: {
      organizationId: string;
      appointmentId: string;
      packageLessonDeducted: boolean;
      createdByPlatformUserId?: string | null;
    }) {
      if (input.packageLessonDeducted) {
        await this.penaltyDeductForAppointment({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          createdByPlatformUserId: input.createdByPlatformUserId,
        });
        return { action: 'penalty' as const };
      }
      await this.releaseReserveForAppointment({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
      });
      return { action: 'released' as const };
    },

    async assertAppointmentNotLinkedToPackage(appointmentId: string, organizationId: string) {
      if (deps.bookingEngine) {
        const appt = await deps.bookingEngine.getAppointment(appointmentId);
        if (appt?.packageUsageRef) throw new Error('appointment_already_linked_to_package');
      }
      const usages = await deps.port.listUsagesForAppointment(appointmentId, organizationId);
      if (findAppointmentDebit(usages)) {
        throw new Error('appointment_already_linked_to_package');
      }

      let reserved = 0;
      let released = 0;
      for (const u of usages) {
        const q = u.quantity;
        switch (u.usageKind) {
          case 'reserve':
            reserved += q;
            break;
          case 'release':
            released += q;
            break;
          default:
            break;
        }
      }
      if (reserved > released) {
        throw new Error('appointment_already_linked_to_package');
      }
    },

    async unlinkAppointmentFromPackage(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
    }) {
      deps.assertWriteClearance?.('subscriptions');
      const usages = await deps.port.listUsagesForAppointment(
        input.appointmentId,
        input.organizationId,
      );
      const hasConsume = usages.some(
        (u) =>
          u.usageKind === 'consume' || u.usageKind === 'penalty' || u.usageKind === 'manual_adjust',
      );
      if (hasConsume) throw new Error('appointment_has_consumed_package_session');
      const result = await this.releaseReserveForAppointment({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        comment: 'doctor_unlink',
      });
      if (result.skipped) throw new Error('appointment_not_linked_to_package');
      return result;
    },

    async refundConsumedAppointmentPackage(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
    }) {
      deps.assertWriteClearance?.('subscriptions');
      const usages = await deps.port.listUsagesForAppointment(
        input.appointmentId,
        input.organizationId,
      );
      const consume = usages.find(
        (u) =>
          u.usageKind === 'consume' || u.usageKind === 'penalty' || u.usageKind === 'manual_adjust',
      );
      if (!consume) throw new Error('appointment_not_linked_to_package');

      const refund = await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: consume.patientPackageId,
        patientPackageItemId: consume.patientPackageItemId,
        appointmentId: input.appointmentId,
        usageKind: 'refund',
        quantity: consume.quantity,
        comment: 'doctor_refund',
        createdByPlatformUserId: input.createdByPlatformUserId ?? null,
      });

      await deps.port.setAppointmentPackageUsageRef(input.appointmentId, null);

      if (deps.bookingEngine) {
        const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
        if (appt?.status === 'charged_to_package') {
          const fromHistory = await deps.bookingEngine.getStatusBeforePackageCharge(
            input.appointmentId,
          );
          const revertTo =
            fromHistory &&
            (PACKAGE_CHARGE_REVERT_STATUSES as readonly string[]).includes(fromHistory)
              ? fromHistory
              : 'visit_confirmed';
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: input.appointmentId,
            toStatus: revertTo,
            payload: { source: 'membership_refund' },
          });
        }
      }

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: consume.patientPackageId,
        eventType: 'session_refunded',
        payloadJson: { appointmentId: input.appointmentId, refundUsageId: refund.id },
      });

      return refund;
    },

    async manualConsume(
      input: {
        organizationId: string;
        patientPackageId: string;
        patientPackageItemId: string;
        appointmentId?: string | null;
        createdByPlatformUserId: string;
      },
      options?: MembershipWriteOptions,
    ) {
      deps.assertWriteClearance?.('subscriptions');
      const pkg = await deps.port.getPatientPackage(input.patientPackageId, input.organizationId);
      if (!pkg) throw new Error('package_not_found');
      if (input.appointmentId) {
        await this.assertAppointmentNotLinkedToPackage(input.appointmentId, input.organizationId);
      }
      const usages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
      const balances = computeItemBalances(pkg.items, usages);
      const row = balances.find((b) => b.patientPackageItemId === input.patientPackageItemId);
      if (!row || row.remaining < 1) throw new Error('package_no_balance');

      const usage = await runMembershipWrite(options, () =>
        deps.port.appendUsage({
          organizationId: input.organizationId,
          patientPackageId: pkg.id,
          patientPackageItemId: input.patientPackageItemId,
          appointmentId: input.appointmentId ?? null,
          usageKind: 'consume',
          quantity: 1,
          createdByPlatformUserId: input.createdByPlatformUserId,
        }),
      );

      if (input.appointmentId && deps.bookingEngine) {
        const appointmentId = input.appointmentId;
        await runMembershipWrite(options, () =>
          deps.port.setAppointmentPackageUsageRef(appointmentId, usage.id),
        );
        const appt = await deps.bookingEngine.getAppointment(appointmentId);
        if (appt && appt.status !== 'charged_to_package') {
          await runMembershipWrite(options, () =>
            deps.bookingEngine!.transitionAppointmentStatus({
              appointmentId,
              toStatus: 'charged_to_package',
              payload: { source: 'membership_manual_consume' },
            }),
          );
        }
      }

      await runMembershipWrite(options, () =>
        deps.port.appendHistoryEvent({
          organizationId: input.organizationId,
          patientPackageId: pkg.id,
          eventType: 'manual_consume',
          payloadJson: { usageId: usage.id, appointmentId: input.appointmentId ?? null },
        }),
      );

      if (input.appointmentId) {
        await refreshPackageCalendarForAppointment(input.appointmentId);
      }

      return usage;
    },

    async updatePatientPackageNotes(
      patientPackageId: string,
      organizationId: string,
      notes: string | null,
      options?: MembershipWriteOptions,
    ) {
      deps.assertWriteClearance?.('subscriptions');
      const updated = await runMembershipWrite(options, () =>
        deps.port.updatePatientPackageNotes(patientPackageId, organizationId, notes),
      );
      if (!updated) throw new Error('package_not_found');
      return withBalance(updated);
    },

    async listPatientPackageSessions(
      patientPackageId: string,
      organizationId: string,
      options: { includePast: boolean; allowPastUnlink: boolean },
    ) {
      const pkg = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!pkg) throw new Error('package_not_found');
      const packageServiceIds = new Set(pkg.items.map((i) => i.serviceId));
      const serviceIds = pkg.items.map((i) => i.serviceId).filter((id): id is string => id != null);
      const nowIso = new Date().toISOString();
      // soldAt may be null for legacy packages; fall back to createdAt or epoch so the window
      // is as inclusive as possible.
      const soldAtIso = pkg.soldAt ?? pkg.createdAt ?? '2000-01-01T00:00:00Z';
      const sources = await deps.port.listPackageAppointmentSessionSources(
        patientPackageId,
        organizationId,
        {
          nowIso,
          platformUserId: pkg.platformUserId,
          serviceIds,
          soldAtIso,
        },
      );

      const rows: PatientPackageSessionRow[] = sources.map((src) => {
        const linkage = computeAppointmentPackageLinkage(src.usages);
        const isPast = src.startsAt < nowIso;
        const mappingStatus = resolvePackageSessionMappingStatus({
          serviceId: src.serviceId,
          packageServiceIds,
        });
        // Past unlink/refund guard: controlled by admin setting (allowPastUnlink).
        const pastEditAllowed = !isPast || options.allowPastUnlink;
        const canUnlinkReserve = pastEditAllowed && linkage === 'reserved';
        const canRefundConsumed =
          pastEditAllowed && (linkage === 'consumed' || linkage === 'penalty');
        // Manual consume of a past visit is intentional doctor action — always allowed
        // regardless of allowPastUnlink. This is a new debit (not editing past billing).
        // For past appointments: only eligible if not in the explicitly-not-happened status set.
        // Future appointments are always eligible (doctor may pre-mark them).
        const eligibleForConsume =
          !isPast ||
          isAppointmentEligibleForConsume(
            src.status,
            src.canonicalStatus,
            src.startsAt,
            src.endsAt,
            nowIso,
          );
        const canManualConsume =
          eligibleForConsume &&
          linkage === 'none' &&
          src.serviceId != null &&
          packageServiceIds.has(src.serviceId);
        return {
          appointmentId: src.appointmentId,
          startsAt: src.startsAt,
          endsAt: src.endsAt,
          status: src.status,
          branchTitle: src.branchTitle,
          serviceTitle: src.serviceTitle ?? '—',
          serviceId: src.serviceId,
          linkage,
          mappingStatus,
          isPast,
          actions: {
            canUnlinkReserve,
            canRefundConsumed,
            canManualConsume,
            canOpenInCalendar: true,
          },
        };
      });

      if (!options.includePast) {
        return rows.filter((r) => !r.isPast);
      }
      return rows;
    },

    async detachAppointmentPackage(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
      outcome?: PackageDetachOutcome;
      confirmPastTwice?: boolean;
      allowPastUnlink: boolean;
      freeCancelHoursBefore: number;
    }) {
      deps.assertWriteClearance?.('subscriptions');
      if (!deps.bookingEngine) throw new Error('appointment_not_found');
      const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
      if (!appt || appt.organizationId !== input.organizationId) {
        throw new Error('appointment_not_found');
      }

      const usages = await deps.port.listUsagesForAppointment(
        input.appointmentId,
        input.organizationId,
      );
      const linkage = computeAppointmentPackageLinkage(usages);
      const nowMs = Date.now();
      const startMs = new Date(appt.startAt).getTime();
      const isPast = startMs < nowMs;
      const hoursUntilStart = (startMs - nowMs) / (60 * 60 * 1000);
      const isLate = hoursUntilStart < input.freeCancelHoursBefore;

      if (isPast && !input.allowPastUnlink) {
        throw new Error('past_unlink_not_allowed');
      }
      if (isPast && input.allowPastUnlink && !input.confirmPastTwice) {
        throw new Error('past_detach_confirmation_required');
      }
      if (isLate && !input.outcome) {
        throw new Error('late_detach_choice_required');
      }

      const outcome: PackageDetachOutcome =
        input.outcome ??
        (linkage === 'reserved'
          ? 'release_reserve'
          : linkage === 'consumed' || linkage === 'penalty'
            ? 'refund_consumed'
            : (() => {
                throw new Error('appointment_not_linked_to_package');
              })());

      if (outcome === 'release_reserve') {
        return this.unlinkAppointmentFromPackage({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          createdByPlatformUserId: input.createdByPlatformUserId,
        });
      }
      if (outcome === 'refund_consumed') {
        return this.refundConsumedAppointmentPackage({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          createdByPlatformUserId: input.createdByPlatformUserId,
        });
      }
      return this.consumeForAppointment({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
        createdByPlatformUserId: input.createdByPlatformUserId,
      });
    },

    /**
     * ST-01 — bulk «Пересчитать» for a single patient package.
     *
     * Finds the patient's PAST appointments (`startsAt ∈ [soldAt; now)`) for services that
     * the package covers, that are состоявшиеся (status completed / visit_confirmed) and NOT
     * yet linked to any package (`linkage === "none"`), and consumes one session per such
     * appointment against the matching package item — until that item's balance hits zero
     * (no minus, OQ-6). Idempotent: appointments already carrying a package usage are skipped,
     * so a repeated call is a no-op.
     *
     * Every debit writes a `consume` row to the append-only ledger, links the appointment
     * (`setAppointmentPackageUsageRef`), records a history event, and best-effort refreshes
     * the calendar — mirroring `consumeForAppointment`. Balance is always DERIVED from the
     * ledger; nothing is mutated directly.
     */
    async recalcPastSessionsForPackageDbPhase(input: {
      organizationId: string;
      patientPackageId: string;
      createdByPlatformUserId?: string | null;
      nowIso?: string;
    }): Promise<{ summary: RecalcPastSessionsSummary; appointmentsToRefresh: string[] }> {
      deps.assertWriteClearance?.('subscriptions');
      // ST-02: serialize the whole read-balance→debit pass under a per-package lock so two
      // concurrent «Пересчитать» requests can never both read the same balance and double-debit.
      // The pg port runs this inside an advisory-locked transaction; the fake port mutexes it.
      return deps.port.runWithPackageLock(
        input.patientPackageId,
        input.organizationId,
        async () => {
          const raw = await deps.port.getPatientPackage(
            input.patientPackageId,
            input.organizationId,
          );
          if (!raw) throw new Error('package_not_found');
          const pkg = await refreshPatientPackageRecord(raw);
          const summary: RecalcPastSessionsSummary = {
            patientPackageId: pkg.id,
            debited: [],
            skipped: [],
            outOfBalance: [],
            corrected: [],
          };
          const appointmentsToRefresh: string[] = [];

          // Only active packages within validity can be debited. Nothing to do otherwise.
          if (pkg.status !== 'active' || !isPatientPackageWithinValidity(pkg)) {
            return { summary, appointmentsToRefresh };
          }

          const soldAtIso = pkg.soldAt ?? pkg.validFrom ?? pkg.createdAt;
          const nowIso = input.nowIso ?? new Date().toISOString();
          if (soldAtIso >= nowIso) {
            return { summary, appointmentsToRefresh };
          }

          const packageServiceIds = new Set(pkg.items.map((i) => i.serviceId));
          const serviceIds = [...packageServiceIds];
          if (serviceIds.length === 0) return { summary, appointmentsToRefresh };

          const candidates = await deps.port.listRecalcCandidateAppointments({
            organizationId: input.organizationId,
            platformUserId: pkg.platformUserId,
            serviceIds,
            soldAtIso,
            nowIso,
          });

          // Derive current per-item balances from the ledger once (inside the lock), then decrement
          // locally as we consume so we never over-debit within this single pass (no minus). Reading
          // usages here (not before the lock) is what makes concurrent passes see each other's debits.
          const usages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
          const balances = computeItemBalances(pkg.items, usages);
          const remainingByItemId = new Map<string, number>(
            balances.map((b) => [b.patientPackageItemId, b.remaining]),
          );

          // Idempotency inside the lock: re-check each candidate's linkage against the freshly-read
          // usages, so a second concurrent pass skips appointments the first one already debited.
          const debitedApptIds = new Set(
            usages
              .filter(
                (u) =>
                  u.usageKind === 'consume' ||
                  u.usageKind === 'penalty' ||
                  u.usageKind === 'reserve',
              )
              .map((u) => u.appointmentId)
              .filter((a): a is string => Boolean(a)),
          );

          // Deterministic order: oldest appointment first (fair FIFO of past visits).
          const ordered = [...candidates].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

          // T3 CORRECTION PASS (before debiting): a visit that is CANCELLED in the canonical
          // projection must not hold a package `consume`. This reverses debits made before the
          // cancellation was reflected (the root bug: recalc consumed a visit the doctor sees as
          // «отмена»). Append-only `refund`, balance is restored, so a later eligible visit can
          // reuse the freed session in the same pass. `penalty` rows are intentional late-cancel
          // charges and are left untouched.
          for (const cand of ordered) {
            if (cand.canonicalStatus !== 'canceled') continue;
            const consume = cand.usages.find((u) => u.usageKind === 'consume');
            if (!consume) continue;
            const alreadyRefunded = cand.usages.some((u) => u.usageKind === 'refund');
            if (alreadyRefunded) continue;
            const refund = await deps.port.recalcCorrectCanceledAppointment({
              organizationId: input.organizationId,
              patientPackageId: pkg.id,
              patientPackageItemId: consume.patientPackageItemId,
              appointmentId: cand.appointmentId,
              consumeUsageId: consume.id,
              quantity: consume.quantity,
              createdByPlatformUserId: input.createdByPlatformUserId ?? null,
              serviceId: cand.serviceId,
            });
            remainingByItemId.set(
              consume.patientPackageItemId,
              (remainingByItemId.get(consume.patientPackageItemId) ?? 0) + consume.quantity,
            );
            debitedApptIds.delete(cand.appointmentId);
            appointmentsToRefresh.push(cand.appointmentId);
            summary.corrected.push({
              appointmentId: cand.appointmentId,
              serviceId: cand.serviceId,
              refundUsageId: refund.id,
            });
          }

          for (const cand of ordered) {
            if (debitedApptIds.has(cand.appointmentId)) {
              summary.skipped.push({
                appointmentId: cand.appointmentId,
                serviceId: cand.serviceId,
                reason: 'already_debited',
              });
              continue;
            }
            const linkage = computeAppointmentPackageLinkage(cand.usages);
            if (linkage !== 'none') {
              summary.skipped.push({
                appointmentId: cand.appointmentId,
                serviceId: cand.serviceId,
                reason: 'already_debited',
              });
              continue;
            }
            if (
              !isAppointmentEligibleForConsume(
                cand.status,
                cand.canonicalStatus,
                cand.startsAt,
                null,
                nowIso,
              )
            ) {
              summary.skipped.push({
                appointmentId: cand.appointmentId,
                serviceId: cand.serviceId,
                reason: 'status_not_eligible',
              });
              continue;
            }
            if (!cand.serviceId || !packageServiceIds.has(cand.serviceId)) {
              summary.skipped.push({
                appointmentId: cand.appointmentId,
                serviceId: cand.serviceId,
                reason: 'service_not_in_package',
              });
              continue;
            }

            // Pick a package item for this service with remaining balance > 0.
            const item = pkg.items.find(
              (it) => it.serviceId === cand.serviceId && (remainingByItemId.get(it.id) ?? 0) >= 1,
            );
            if (!item) {
              // Eligible visit, but the package for this service is exhausted → stop-at-zero (OQ-6).
              summary.outOfBalance.push({
                appointmentId: cand.appointmentId,
                serviceId: cand.serviceId,
              });
              continue;
            }

            let usage;
            try {
              usage = await deps.port.recalcConsumeForAppointment({
                organizationId: input.organizationId,
                patientPackageId: pkg.id,
                patientPackageItemId: item.id,
                appointmentId: cand.appointmentId,
                createdByPlatformUserId: input.createdByPlatformUserId ?? null,
                serviceId: cand.serviceId,
              });
            } catch (err) {
              const code =
                (err as { code?: string; message?: string })?.code ?? (err as Error)?.message;
              if (code === 'duplicate_consume') {
                summary.skipped.push({
                  appointmentId: cand.appointmentId,
                  serviceId: cand.serviceId,
                  reason: 'already_debited',
                });
                continue;
              }
              throw err;
            }
            remainingByItemId.set(item.id, (remainingByItemId.get(item.id) ?? 0) - 1);
            debitedApptIds.add(cand.appointmentId);

            appointmentsToRefresh.push(cand.appointmentId);

            summary.debited.push({
              appointmentId: cand.appointmentId,
              patientPackageItemId: item.id,
              serviceId: cand.serviceId,
              usageId: usage.id,
            });
          }

          return { summary, appointmentsToRefresh };
        },
      );
    },

    async refreshRecalcPastSessionsCalendar(appointmentIds: readonly string[]): Promise<void> {
      for (const appointmentId of appointmentIds) {
        await refreshPackageCalendarForAppointment(appointmentId);
      }
    },

    async recalcPastSessionsForPackage(input: {
      organizationId: string;
      patientPackageId: string;
      createdByPlatformUserId?: string | null;
      nowIso?: string;
    }): Promise<RecalcPastSessionsSummary> {
      const result = await this.recalcPastSessionsForPackageDbPhase(input);
      await this.refreshRecalcPastSessionsCalendar(result.appointmentsToRefresh);

      return result.summary;
    },

    async onVisitConfirmed(appointmentId: string, organizationId: string) {
      const usages = await deps.port.listUsagesForAppointment(appointmentId, organizationId);
      const reserve = usages.find((u) => u.usageKind === 'reserve');
      if (!reserve) return { skipped: true as const };
      const pkg = await deps.port.getPatientPackage(reserve.patientPackageId, organizationId);
      if (!pkg || pkg.deductionMode !== 'auto_on_visit_confirmed')
        return { skipped: true as const };
      const hasConsume = usages.some((u) => u.usageKind === 'consume' || u.usageKind === 'penalty');
      if (hasConsume) return { skipped: true as const };
      await this.consumeForAppointment({ organizationId, appointmentId });
      return { skipped: false as const };
    },
  };
}

export type MembershipsService = ReturnType<typeof createMembershipsService>;
