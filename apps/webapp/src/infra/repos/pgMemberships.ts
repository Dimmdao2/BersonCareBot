import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  bePackageHistoryEvents,
  bePackageItems,
  bePackageUsages,
  bePatientPackageItems,
  bePatientPackages,
  beSubscriptionPackages,
} from "../../../db/schema/bookingMemberships";
import { beAppointments, beBranches, beClinicServices } from "../../../db/schema/bookingEngine";
import type {
  CreateManualPatientPackageInput,
  MembershipsPort,
  UpsertSubscriptionPackageInput,
} from "@/modules/memberships/ports";
import type {
  PackageUsageRecord,
  PatientPackageItemRecord,
  PatientPackageRecord,
  SubscriptionPackageRecord,
} from "@/modules/memberships/types";

async function loadPackageItems(packageIds: string[]): Promise<Map<string, PatientPackageItemRecord[]>> {
  if (packageIds.length === 0) return new Map();
  const db = getDrizzle();
  const rows = await db
    .select()
    .from(bePatientPackageItems)
    .where(inArray(bePatientPackageItems.patientPackageId, packageIds))
    .orderBy(asc(bePatientPackageItems.sortOrder));
  const map = new Map<string, PatientPackageItemRecord[]>();
  for (const r of rows) {
    const list = map.get(r.patientPackageId) ?? [];
    list.push({
      id: r.id,
      serviceId: r.serviceId,
      quantityInitial: r.quantityInitial,
      sortOrder: r.sortOrder,
    });
    map.set(r.patientPackageId, list);
  }
  return map;
}

function mapPatientPackage(
  row: typeof bePatientPackages.$inferSelect,
  items: PatientPackageItemRecord[],
): PatientPackageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    platformUserId: row.platformUserId,
    subscriptionPackageId: row.subscriptionPackageId,
    status: row.status as PatientPackageRecord["status"],
    title: row.title,
    priceMinor: row.priceMinor,
    currency: row.currency,
    validityDays: row.validityDays,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    deductionMode: row.deductionMode as PatientPackageRecord["deductionMode"],
    paymentIntentId: row.paymentIntentId,
    paymentRef: row.paymentRef,
    soldAt: row.soldAt,
    paidAmountMinor: row.paidAmountMinor,
    paidCurrency: row.paidCurrency,
    createdAt: row.createdAt,
    notes: row.notes,
    items,
  };
}

function mapUsage(row: typeof bePackageUsages.$inferSelect): PackageUsageRecord {
  return {
    id: row.id,
    patientPackageId: row.patientPackageId,
    patientPackageItemId: row.patientPackageItemId,
    appointmentId: row.appointmentId,
    usageKind: row.usageKind as PackageUsageRecord["usageKind"],
    quantity: row.quantity,
    comment: row.comment,
    occurredAt: row.occurredAt,
  };
}

export function createPgMembershipsPort(): MembershipsPort {
  return {
    async listCatalogPackages(organizationId, activeOnly = true) {
      const db = getDrizzle();
      const pkgs = await db
        .select()
        .from(beSubscriptionPackages)
        .where(
          activeOnly
            ? and(
                eq(beSubscriptionPackages.organizationId, organizationId),
                eq(beSubscriptionPackages.isActive, true),
              )
            : eq(beSubscriptionPackages.organizationId, organizationId),
        )
        .orderBy(asc(beSubscriptionPackages.title));
      if (pkgs.length === 0) return [];
      const pkgIds = pkgs.map((p) => p.id);
      const itemRows = await db
        .select()
        .from(bePackageItems)
        .where(inArray(bePackageItems.packageId, pkgIds))
        .orderBy(asc(bePackageItems.sortOrder));
      const itemsByPkg = new Map<string, SubscriptionPackageRecord["items"]>();
      for (const it of itemRows) {
        const list = itemsByPkg.get(it.packageId) ?? [];
        list.push({
          id: it.id,
          serviceId: it.serviceId,
          quantity: it.quantity,
          sortOrder: it.sortOrder,
        });
        itemsByPkg.set(it.packageId, list);
      }
      return pkgs.map((p) => ({
        id: p.id,
        organizationId: p.organizationId,
        title: p.title,
        description: p.description,
        priceMinor: p.priceMinor,
        currency: p.currency,
        validityDays: p.validityDays,
        deductionMode: p.deductionMode as SubscriptionPackageRecord["deductionMode"],
        isActive: p.isActive,
        items: itemsByPkg.get(p.id) ?? [],
      }));
    },

    async getCatalogPackage(id, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beSubscriptionPackages)
        .where(and(eq(beSubscriptionPackages.id, id), eq(beSubscriptionPackages.organizationId, organizationId)))
        .limit(1);
      const p = rows[0];
      if (!p) return null;
      const itemRows = await db
        .select()
        .from(bePackageItems)
        .where(eq(bePackageItems.packageId, id))
        .orderBy(asc(bePackageItems.sortOrder));
      return {
        id: p.id,
        organizationId: p.organizationId,
        title: p.title,
        description: p.description,
        priceMinor: p.priceMinor,
        currency: p.currency,
        validityDays: p.validityDays,
        deductionMode: p.deductionMode as SubscriptionPackageRecord["deductionMode"],
        isActive: p.isActive,
        items: itemRows.map((it) => ({
          id: it.id,
          serviceId: it.serviceId,
          quantity: it.quantity,
          sortOrder: it.sortOrder,
        })),
      };
    },

    async upsertCatalogPackage(input: UpsertSubscriptionPackageInput) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      let packageId = input.id;
      if (packageId) {
        await db
          .update(beSubscriptionPackages)
          .set({
            title: input.title,
            description: input.description ?? null,
            priceMinor: input.priceMinor,
            currency: input.currency ?? "RUB",
            validityDays: input.validityDays ?? null,
            deductionMode: input.deductionMode ?? "auto_on_visit_confirmed",
            isActive: input.isActive ?? true,
            updatedAt: now,
          })
          .where(
            and(eq(beSubscriptionPackages.id, packageId), eq(beSubscriptionPackages.organizationId, input.organizationId)),
          );
        await db.delete(bePackageItems).where(eq(bePackageItems.packageId, packageId));
      } else {
        const inserted = await db
          .insert(beSubscriptionPackages)
          .values({
            organizationId: input.organizationId,
            title: input.title,
            description: input.description ?? null,
            priceMinor: input.priceMinor,
            currency: input.currency ?? "RUB",
            validityDays: input.validityDays ?? null,
            deductionMode: input.deductionMode ?? "auto_on_visit_confirmed",
            isActive: input.isActive ?? true,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        packageId = inserted[0]!.id;
      }
      if (input.items.length > 0) {
        await db.insert(bePackageItems).values(
          input.items.map((it, idx) => ({
            packageId: packageId!,
            serviceId: it.serviceId,
            quantity: it.quantity,
            sortOrder: it.sortOrder ?? idx,
            createdAt: now,
          })),
        );
      }
      const result = await this.getCatalogPackage(packageId!, input.organizationId);
      if (!result) throw new Error("package_upsert_failed");
      return result;
    },

    async getPatientPackage(id, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePatientPackages)
        .where(and(eq(bePatientPackages.id, id), eq(bePatientPackages.organizationId, organizationId)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const itemsMap = await loadPackageItems([id]);
      return mapPatientPackage(row, itemsMap.get(id) ?? []);
    },

    async listPatientPackagesForUser(platformUserId, organizationId, statuses) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePatientPackages)
        .where(
          statuses?.length
            ? and(
                eq(bePatientPackages.organizationId, organizationId),
                eq(bePatientPackages.platformUserId, platformUserId),
                inArray(bePatientPackages.status, statuses),
              )
            : and(
                eq(bePatientPackages.organizationId, organizationId),
                eq(bePatientPackages.platformUserId, platformUserId),
              ),
        )
        .orderBy(asc(bePatientPackages.createdAt));
      const itemsMap = await loadPackageItems(rows.map((r) => r.id));
      return rows.map((r) => mapPatientPackage(r, itemsMap.get(r.id) ?? []));
    },

    async listPatientPackagesForPatientIds(organizationId, platformUserIds) {
      if (platformUserIds.length === 0) return [];
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePatientPackages)
        .where(
          and(
            eq(bePatientPackages.organizationId, organizationId),
            inArray(bePatientPackages.platformUserId, platformUserIds),
          ),
        );
      const itemsMap = await loadPackageItems(rows.map((r) => r.id));
      return rows.map((r) => mapPatientPackage(r, itemsMap.get(r.id) ?? []));
    },

    async createManualPatientPackage(input: CreateManualPatientPackageInput) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const staffSold =
        input.activateImmediately === true ||
        (input.soldAt != null &&
          input.paidAmountMinor != null &&
          input.sendForPayment === false);
      const status =
        staffSold || (input.sendForPayment === false && input.priceMinor === 0) ? "active" : "offered";
      const soldAt = input.soldAt ?? (staffSold ? now : null);
      const paidAmountMinor = input.paidAmountMinor ?? (staffSold ? input.priceMinor : null);
      const paidCurrency = input.paidCurrency ?? input.currency ?? "RUB";
      const inserted = await db
        .insert(bePatientPackages)
        .values({
          organizationId: input.organizationId,
          platformUserId: input.platformUserId,
          status,
          title: input.title?.trim() || "Индивидуальный",
          priceMinor: input.priceMinor,
          currency: input.currency ?? "RUB",
          validityDays: input.validityDays ?? null,
          deductionMode: input.deductionMode ?? "auto_on_visit_confirmed",
          assignedByPlatformUserId: input.assignedByPlatformUserId ?? null,
          notes: input.notes ?? null,
          soldAt,
          paidAmountMinor,
          paidCurrency: staffSold || paidAmountMinor != null ? paidCurrency : null,
          validFrom: status === "active" ? now : null,
          validUntil:
            status === "active" && input.validityDays
              ? new Date(Date.now() + input.validityDays * 86400000).toISOString()
              : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const pkgId = inserted[0]!.id;
      await db.insert(bePatientPackageItems).values(
        input.items.map((it, idx) => ({
          patientPackageId: pkgId,
          serviceId: it.serviceId,
          quantityInitial: it.quantity,
          sortOrder: it.sortOrder ?? idx,
          createdAt: now,
        })),
      );
      const pkg = await this.getPatientPackage(pkgId, input.organizationId);
      if (!pkg) throw new Error("package_create_failed");
      return pkg;
    },

    async offerCatalogPackageToPatient(input) {
      const catalog = await this.getCatalogPackage(input.subscriptionPackageId, input.organizationId);
      if (!catalog) throw new Error("catalog_not_found");
      const db = getDrizzle();
      const now = new Date().toISOString();
      const inserted = await db
        .insert(bePatientPackages)
        .values({
          organizationId: input.organizationId,
          platformUserId: input.platformUserId,
          subscriptionPackageId: catalog.id,
          status: "offered",
          title: catalog.title,
          priceMinor: catalog.priceMinor,
          currency: catalog.currency,
          validityDays: catalog.validityDays,
          deductionMode: catalog.deductionMode,
          assignedByPlatformUserId: input.assignedByPlatformUserId ?? null,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const pkgId = inserted[0]!.id;
      await db.insert(bePatientPackageItems).values(
        catalog.items.map((it, idx) => ({
          patientPackageId: pkgId,
          serviceId: it.serviceId,
          quantityInitial: it.quantity,
          sortOrder: it.sortOrder ?? idx,
          createdAt: now,
        })),
      );
      const pkg = await this.getPatientPackage(pkgId, input.organizationId);
      if (!pkg) throw new Error("package_offer_failed");
      return pkg;
    },

    async updatePatientPackageNotes(id, organizationId, notes) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const rows = await db
        .update(bePatientPackages)
        .set({ notes, updatedAt: now })
        .where(and(eq(bePatientPackages.id, id), eq(bePatientPackages.organizationId, organizationId)))
        .returning();
      const row = rows[0];
      if (!row) return null;
      const itemsMap = await loadPackageItems([id]);
      return mapPatientPackage(row, itemsMap.get(id) ?? []);
    },

    async listPackageAppointmentSessionSources(patientPackageId, organizationId, options) {
      const db = getDrizzle();
      const nowIso = options.nowIso ?? new Date().toISOString();
      void nowIso;

      const usageRows = await db
        .select()
        .from(bePackageUsages)
        .where(
          and(
            eq(bePackageUsages.patientPackageId, patientPackageId),
            eq(bePackageUsages.organizationId, organizationId),
            isNotNull(bePackageUsages.appointmentId),
          ),
        )
        .orderBy(asc(bePackageUsages.occurredAt));

      const appointmentIds = [
        ...new Set(
          usageRows
            .map((u) => u.appointmentId)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      ];
      if (appointmentIds.length === 0) return [];

      const apptRows = await db
        .select({
          id: beAppointments.id,
          startAt: beAppointments.startAt,
          endAt: beAppointments.endAt,
          status: beAppointments.status,
          serviceId: beAppointments.serviceId,
          branchTitle: beBranches.title,
          serviceTitle: beClinicServices.title,
        })
        .from(beAppointments)
        .leftJoin(beBranches, eq(beAppointments.branchId, beBranches.id))
        .leftJoin(beClinicServices, eq(beAppointments.serviceId, beClinicServices.id))
        .where(
          and(
            eq(beAppointments.organizationId, organizationId),
            inArray(beAppointments.id, appointmentIds),
          ),
        );

      const usagesByAppointment = new Map<string, PackageUsageRecord[]>();
      for (const row of usageRows) {
        if (!row.appointmentId) continue;
        const list = usagesByAppointment.get(row.appointmentId) ?? [];
        list.push(mapUsage(row));
        usagesByAppointment.set(row.appointmentId, list);
      }

      return apptRows
        .map((appt) => ({
          appointmentId: appt.id,
          startsAt: appt.startAt,
          endsAt: appt.endAt,
          status: appt.status,
          branchTitle: appt.branchTitle,
          serviceTitle: appt.serviceTitle,
          serviceId: appt.serviceId,
          usages: usagesByAppointment.get(appt.id) ?? [],
        }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async setPatientPackageStatus(id, organizationId, status, patch) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const set: Partial<typeof bePatientPackages.$inferInsert> = { status, updatedAt: now };
      if (patch?.paymentIntentId !== undefined) set.paymentIntentId = patch.paymentIntentId;
      if (patch?.paymentRef !== undefined) set.paymentRef = patch.paymentRef;
      if (patch?.validFrom !== undefined) set.validFrom = patch.validFrom;
      if (patch?.validUntil !== undefined) set.validUntil = patch.validUntil;
      if (patch?.soldAt !== undefined) set.soldAt = patch.soldAt;
      if (patch?.paidAmountMinor !== undefined) set.paidAmountMinor = patch.paidAmountMinor;
      if (patch?.paidCurrency !== undefined) set.paidCurrency = patch.paidCurrency;
      const rows = await db
        .update(bePatientPackages)
        .set(set)
        .where(and(eq(bePatientPackages.id, id), eq(bePatientPackages.organizationId, organizationId)))
        .returning();
      const row = rows[0];
      if (!row) return null;
      const itemsMap = await loadPackageItems([id]);
      return mapPatientPackage(row, itemsMap.get(id) ?? []);
    },

    async appendUsage(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const inserted = await db
        .insert(bePackageUsages)
        .values({
          organizationId: input.organizationId,
          patientPackageId: input.patientPackageId,
          patientPackageItemId: input.patientPackageItemId,
          appointmentId: input.appointmentId ?? null,
          usageKind: input.usageKind,
          quantity: input.quantity ?? 1,
          comment: input.comment ?? null,
          createdByPlatformUserId: input.createdByPlatformUserId ?? null,
          occurredAt: now,
          createdAt: now,
        })
        .returning();
      return mapUsage(inserted[0]!);
    },

    async listUsagesForPackage(patientPackageId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePackageUsages)
        .where(
          and(
            eq(bePackageUsages.patientPackageId, patientPackageId),
            eq(bePackageUsages.organizationId, organizationId),
          ),
        )
        .orderBy(asc(bePackageUsages.occurredAt));
      return rows.map(mapUsage);
    },

    async listUsagesForAppointment(appointmentId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePackageUsages)
        .where(
          and(
            eq(bePackageUsages.appointmentId, appointmentId),
            eq(bePackageUsages.organizationId, organizationId),
          ),
        )
        .orderBy(asc(bePackageUsages.occurredAt));
      return rows.map(mapUsage);
    },

    async appendHistoryEvent(input) {
      const db = getDrizzle();
      await db.insert(bePackageHistoryEvents).values({
        organizationId: input.organizationId,
        patientPackageId: input.patientPackageId,
        eventType: input.eventType,
        payloadJson: input.payloadJson ?? {},
        occurredAt: new Date().toISOString(),
      });
    },

    async listHistoryForPackage(patientPackageId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePackageHistoryEvents)
        .where(
          and(
            eq(bePackageHistoryEvents.patientPackageId, patientPackageId),
            eq(bePackageHistoryEvents.organizationId, organizationId),
          ),
        )
        .orderBy(asc(bePackageHistoryEvents.occurredAt));
      return rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        payloadJson: (r.payloadJson ?? {}) as Record<string, unknown>,
        occurredAt: r.occurredAt,
      }));
    },

    async setAppointmentPackageUsageRef(appointmentId, usageRef) {
      const db = getDrizzle();
      await db
        .update(beAppointments)
        .set({ packageUsageRef: usageRef, updatedAt: new Date().toISOString() })
        .where(eq(beAppointments.id, appointmentId));
    },
  };
}
