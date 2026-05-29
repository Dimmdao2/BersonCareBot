import type { createBookingEngineService } from "@/modules/booking-engine/service";
import type { PaymentsService } from "@/modules/payments/service";
import {
  computeItemBalances,
  findItemForService,
  hasAvailableForService,
} from "./balanceCalculator";
import type { MembershipsPort } from "./ports";
import type {
  PatientPackageBalanceView,
  PatientPackageListItem,
  PatientPackageRecord,
  SubscriptionPackageRecord,
} from "./types";

type BookingEngineService = Pick<
  ReturnType<typeof createBookingEngineService>,
  "getAppointment" | "transitionAppointmentStatus"
>;

import { parsePatientPackageProductRef } from "./patientPackageProductRef";
import { isPatientPackageExpired, isPatientPackageWithinValidity } from "./packageValidity";

function addValidity(validFrom: string, validityDays: number | null): string | null {
  if (validityDays == null || validityDays <= 0) return null;
  const d = new Date(validFrom);
  d.setUTCDate(d.getUTCDate() + validityDays);
  return d.toISOString();
}

export function createMembershipsService(deps: {
  port: MembershipsPort;
  payments: PaymentsService | null;
  bookingEngine: BookingEngineService | null;
  resolveServiceTitle?: (serviceId: string) => Promise<string | null>;
}) {
  async function refreshPatientPackageRecord(pkg: PatientPackageRecord): Promise<PatientPackageRecord> {
    if (isPatientPackageExpired(pkg) && pkg.status === "active") {
      const updated = await deps.port.setPatientPackageStatus(pkg.id, pkg.organizationId, "expired");
      if (updated) {
        await deps.port.appendHistoryEvent({
          organizationId: pkg.organizationId,
          patientPackageId: pkg.id,
          eventType: "expired",
          payloadJson: { validUntil: pkg.validUntil },
        });
        return updated;
      }
      return { ...pkg, status: "expired" };
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

    async upsertCatalogPackage(
      input: Parameters<MembershipsPort["upsertCatalogPackage"]>[0],
    ): Promise<SubscriptionPackageRecord> {
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
      input: Parameters<MembershipsPort["createManualPatientPackage"]>[0],
    ) {
      const pkg = await deps.port.createManualPatientPackage(input);
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        eventType: "manual_created",
        payloadJson: { title: input.title, priceMinor: input.priceMinor },
      });
      if (input.priceMinor > 0 && input.sendForPayment !== false) {
        return this.createPaymentOffer(pkg.id, input.organizationId, input.platformUserId);
      }
      const activated = await this.activatePatientPackage(pkg.id, input.organizationId);
      return activated ?? (await withBalance(pkg));
    },

    async offerCatalogPackageToPatient(input: {
      organizationId: string;
      platformUserId: string;
      subscriptionPackageId: string;
      assignedByPlatformUserId?: string | null;
    }) {
      const pkg = await deps.port.offerCatalogPackageToPatient(input);
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        eventType: "catalog_offered",
        payloadJson: { subscriptionPackageId: input.subscriptionPackageId },
      });
      if (pkg.priceMinor > 0) {
        return this.createPaymentOffer(pkg.id, input.organizationId, input.platformUserId);
      }
      const activated = await this.activatePatientPackage(pkg.id, input.organizationId);
      return activated ?? (await withBalance(pkg));
    },

    async createPaymentOffer(patientPackageId: string, organizationId: string, platformUserId: string) {
      const pkg = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!pkg) throw new Error("package_not_found");
      if (!deps.payments) throw new Error("payments_unavailable");
      const idempotencyKey = `package:${patientPackageId}:offer`;
      const intent = await deps.payments.createPackagePaymentIntent({
        organizationId,
        platformUserId,
        patientPackageId,
        amountMinor: pkg.priceMinor,
        currency: pkg.currency,
        idempotencyKey,
      });
      await deps.port.setPatientPackageStatus(patientPackageId, organizationId, "awaiting_payment", {
        paymentIntentId: intent.id,
      });
      await deps.port.appendHistoryEvent({
        organizationId,
        patientPackageId,
        eventType: "payment_offer_created",
        payloadJson: { intentId: intent.id, amountMinor: pkg.priceMinor },
      });
      const updated = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!updated) throw new Error("package_not_found");
      return { ...(await withBalance(updated)), paymentIntentId: intent.id };
    },

    async activatePatientPackage(patientPackageId: string, organizationId: string, paymentRef?: string) {
      const pkg = await deps.port.getPatientPackage(patientPackageId, organizationId);
      if (!pkg) return null;
      if (pkg.status === "active") return withBalance(pkg);
      const now = new Date().toISOString();
      const validUntil = addValidity(now, pkg.validityDays);
      const updated = await deps.port.setPatientPackageStatus(patientPackageId, organizationId, "active", {
        paymentRef: paymentRef ?? pkg.paymentRef,
        validFrom: now,
        validUntil,
      });
      if (!updated) return null;
      await deps.port.appendHistoryEvent({
        organizationId,
        patientPackageId,
        eventType: "activated",
        payloadJson: { paymentRef: paymentRef ?? null },
      });
      return withBalance(updated);
    },

    async capturePackagePayment(intentId: string, organizationId: string, platformUserId: string) {
      if (!deps.payments) throw new Error("payments_unavailable");
      const result = await deps.payments.captureIntentForPatient(intentId, organizationId, platformUserId);
      const productRef = parsePatientPackageProductRef(result.intent.productRef);
      if (productRef) {
        await this.activatePatientPackage(productRef, organizationId, result.payment?.id);
      }
      return result;
    },

    async listActivePackagesForBooking(platformUserId: string, organizationId: string, serviceId: string) {
      const rows = await deps.port.listPatientPackagesForUser(platformUserId, organizationId, ["active"]);
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
      return this.offerCatalogPackageToPatient({
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
        subscriptionPackageId: input.subscriptionPackageId,
      });
    },

    /** Catalog package already paid via product layer — activate without second payment intent. */
    async grantPrepaidCatalogPackage(input: {
      organizationId: string;
      platformUserId: string;
      subscriptionPackageId: string;
      paymentRef?: string;
    }) {
      const pkg = await deps.port.offerCatalogPackageToPatient({
        organizationId: input.organizationId,
        platformUserId: input.platformUserId,
        subscriptionPackageId: input.subscriptionPackageId,
      });
      const activated = await this.activatePatientPackage(
        pkg.id,
        input.organizationId,
        input.paymentRef,
      );
      return activated ?? (await withBalance(pkg));
    },

    async reserveForAppointment(input: {
      organizationId: string;
      patientPackageId: string;
      serviceId: string;
      appointmentId: string;
      platformUserId: string;
    }) {
      const raw = await deps.port.getPatientPackage(input.patientPackageId, input.organizationId);
      if (!raw || raw.platformUserId !== input.platformUserId) throw new Error("package_not_found");
      const pkg = await refreshPatientPackageRecord(raw);
      if (!isPatientPackageWithinValidity(pkg)) throw new Error("package_expired");
      if (pkg.status !== "active") throw new Error("package_not_active");
      const usages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
      const balances = computeItemBalances(pkg.items, usages);
      const found = findItemForService(pkg.items, balances, input.serviceId);
      if (!found) throw new Error("package_no_balance");

      const usage = await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        patientPackageItemId: found.item.id,
        appointmentId: input.appointmentId,
        usageKind: "reserve",
        quantity: 1,
      });
      await deps.port.setAppointmentPackageUsageRef(input.appointmentId, usage.id);
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        eventType: "reserved_for_appointment",
        payloadJson: { appointmentId: input.appointmentId, usageId: usage.id },
      });
      return usage;
    },

    async consumeForAppointment(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
      asPenalty?: boolean;
    }) {
      const usages = await deps.port.listUsagesForAppointment(input.appointmentId, input.organizationId);
      const reserve = usages.find((u) => u.usageKind === "reserve");
      if (!reserve) throw new Error("no_reserve");

      const pkg = await deps.port.getPatientPackage(reserve.patientPackageId, input.organizationId);
      if (!pkg) throw new Error("package_not_found");

      await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        patientPackageItemId: reserve.patientPackageItemId,
        appointmentId: input.appointmentId,
        usageKind: "release",
        quantity: 1,
        createdByPlatformUserId: input.createdByPlatformUserId ?? null,
      });

      const consume = await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        patientPackageItemId: reserve.patientPackageItemId,
        appointmentId: input.appointmentId,
        usageKind: input.asPenalty ? "penalty" : "consume",
        quantity: 1,
        createdByPlatformUserId: input.createdByPlatformUserId ?? null,
      });

      await deps.port.setAppointmentPackageUsageRef(input.appointmentId, consume.id);

      if (deps.bookingEngine && !input.asPenalty) {
        const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
        if (appt && appt.status !== "charged_to_package") {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: input.appointmentId,
            toStatus: "charged_to_package",
            payload: { source: "membership_consume", usageId: consume.id },
          });
        }
      }

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        eventType: input.asPenalty ? "penalty_consumed" : "consumed",
        payloadJson: { appointmentId: input.appointmentId, usageId: consume.id },
      });

      return consume;
    },

    async releaseReserveForAppointment(input: {
      organizationId: string;
      appointmentId: string;
      comment?: string | null;
    }) {
      const usages = await deps.port.listUsagesForAppointment(input.appointmentId, input.organizationId);
      const reserve = usages.find((u) => u.usageKind === "reserve");
      if (!reserve) return { ok: true as const, skipped: true as const };

      const hasConsume = usages.some((u) => u.usageKind === "consume" || u.usageKind === "penalty");
      if (hasConsume) return { ok: true as const, skipped: true as const };

      await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        patientPackageItemId: reserve.patientPackageItemId,
        appointmentId: input.appointmentId,
        usageKind: "release",
        quantity: 1,
        comment: input.comment ?? null,
      });

      await deps.port.setAppointmentPackageUsageRef(input.appointmentId, null);

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: reserve.patientPackageId,
        eventType: "reserve_released",
        payloadJson: { appointmentId: input.appointmentId },
      });

      return { ok: true as const, skipped: false as const };
    },

    async penaltyDeductForAppointment(input: {
      organizationId: string;
      appointmentId: string;
      createdByPlatformUserId?: string | null;
    }) {
      const usages = await deps.port.listUsagesForAppointment(input.appointmentId, input.organizationId);
      const reserve = usages.find((u) => u.usageKind === "reserve");
      if (reserve) {
        return this.consumeForAppointment({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          createdByPlatformUserId: input.createdByPlatformUserId,
          asPenalty: true,
        });
      }
      if (!deps.bookingEngine) throw new Error("package_penalty_unavailable");
      const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
      if (!appt?.serviceId || !appt.platformUserId) throw new Error("package_no_balance");

      const linkedPackageId = usages.find((u) => u.usageKind === "reserve")?.patientPackageId
        ?? usages[0]?.patientPackageId;
      let pkg: PatientPackageRecord | null = null;
      if (linkedPackageId) {
        const raw = await deps.port.getPatientPackage(linkedPackageId, input.organizationId);
        if (raw) pkg = await refreshPatientPackageRecord(raw);
      }
      if (!pkg) {
        const eligible = await this.listActivePackagesForBooking(
          appt.platformUserId,
          input.organizationId,
          appt.serviceId,
        );
        if (eligible.length === 0) throw new Error("package_no_balance");
        const raw = await deps.port.getPatientPackage(eligible[0]!.id, input.organizationId);
        if (!raw) throw new Error("package_no_balance");
        pkg = await refreshPatientPackageRecord(raw);
      }
      const pkgUsages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
      const balances = computeItemBalances(pkg.items, pkgUsages);
      const found = findItemForService(pkg.items, balances, appt.serviceId);
      if (!found) throw new Error("package_no_balance");

      const usage = await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        patientPackageItemId: found.item.id,
        appointmentId: input.appointmentId,
        usageKind: "penalty",
        quantity: 1,
        createdByPlatformUserId: input.createdByPlatformUserId ?? null,
      });
      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        eventType: "penalty_without_reserve",
        payloadJson: { appointmentId: input.appointmentId, usageId: usage.id },
      });
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
        return { action: "penalty" as const };
      }
      await this.releaseReserveForAppointment({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId,
      });
      return { action: "released" as const };
    },

    async manualConsume(input: {
      organizationId: string;
      patientPackageId: string;
      patientPackageItemId: string;
      appointmentId?: string | null;
      createdByPlatformUserId: string;
    }) {
      const pkg = await deps.port.getPatientPackage(input.patientPackageId, input.organizationId);
      if (!pkg) throw new Error("package_not_found");
      const usages = await deps.port.listUsagesForPackage(pkg.id, pkg.organizationId);
      const balances = computeItemBalances(pkg.items, usages);
      const row = balances.find((b) => b.patientPackageItemId === input.patientPackageItemId);
      if (!row || row.remaining < 1) throw new Error("package_no_balance");

      const usage = await deps.port.appendUsage({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        patientPackageItemId: input.patientPackageItemId,
        appointmentId: input.appointmentId ?? null,
        usageKind: "consume",
        quantity: 1,
        createdByPlatformUserId: input.createdByPlatformUserId,
      });

      if (input.appointmentId && deps.bookingEngine) {
        await deps.port.setAppointmentPackageUsageRef(input.appointmentId, usage.id);
        const appt = await deps.bookingEngine.getAppointment(input.appointmentId);
        if (appt && appt.status !== "charged_to_package") {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: input.appointmentId,
            toStatus: "charged_to_package",
            payload: { source: "membership_manual_consume" },
          });
        }
      }

      await deps.port.appendHistoryEvent({
        organizationId: input.organizationId,
        patientPackageId: pkg.id,
        eventType: "manual_consume",
        payloadJson: { usageId: usage.id, appointmentId: input.appointmentId ?? null },
      });

      return usage;
    },

    async onVisitConfirmed(appointmentId: string, organizationId: string) {
      const usages = await deps.port.listUsagesForAppointment(appointmentId, organizationId);
      const reserve = usages.find((u) => u.usageKind === "reserve");
      if (!reserve) return { skipped: true as const };
      const pkg = await deps.port.getPatientPackage(reserve.patientPackageId, organizationId);
      if (!pkg || pkg.deductionMode !== "auto_on_visit_confirmed") return { skipped: true as const };
      const hasConsume = usages.some((u) => u.usageKind === "consume" || u.usageKind === "penalty");
      if (hasConsume) return { skipped: true as const };
      await this.consumeForAppointment({ organizationId, appointmentId });
      return { skipped: false as const };
    },
  };
}

export type MembershipsService = ReturnType<typeof createMembershipsService>;
