import { AsyncLocalStorage } from 'node:async_hooks';
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { getDrizzleOrMutationTx } from '@/infra/db/drizzleMutationTx';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  bePackageHistoryEvents,
  bePackageItems,
  bePackageUsages,
  bePatientPackageItems,
  bePatientPackages,
  beSubscriptionPackages,
} from '../../../db/schema/bookingMemberships';
import { beAppointments, beBranches, beClinicServices } from '../../../db/schema/bookingEngine';
import type {
  CreateManualPatientPackageInput,
  MembershipsPort,
  UpsertSubscriptionPackageInput,
} from '@/modules/memberships/ports';
import type {
  CanonicalAppointmentStatus,
  PackageUsageRecord,
  PatientPackageItemRecord,
  PatientPackageRecord,
  SubscriptionPackageRecord,
} from '@/modules/memberships/types';

type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];
type MembershipsDb = DrizzleDb | DrizzleTx;

const txStorage = new AsyncLocalStorage<DrizzleTx>();
const getDrizzle = getDrizzleOrMutationTx;

const patientBookingPackageSnapshotSchema = z.array(
  z.object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    platformUserId: z.string().uuid(),
    subscriptionPackageId: z.string().uuid().nullable(),
    status: z.enum(['offered', 'awaiting_payment', 'active', 'expired', 'cancelled']),
    displayNumber: z.number().int().positive(),
    title: z.string(),
    priceMinor: z.number().int().nonnegative(),
    currency: z.string(),
    validityDays: z.number().int().nullable(),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
    deductionMode: z.enum(['auto_on_visit_confirmed', 'manual']),
    paymentIntentId: z.string().uuid().nullable(),
    paymentRef: z.string().nullable(),
    soldAt: z.string().nullable(),
    paidAmountMinor: z.number().int().nonnegative().nullable(),
    paidCurrency: z.string().nullable(),
    createdAt: z.string(),
    notes: z.string().nullable(),
    items: z.array(
      z.object({
        id: z.string().uuid(),
        serviceId: z.string().uuid(),
        quantityInitial: z.number().int().positive(),
        sortOrder: z.number().int(),
      }),
    ),
    balance: z.object({
      patientPackageId: z.string().uuid(),
      status: z.enum(['offered', 'awaiting_payment', 'active', 'expired', 'cancelled']),
      items: z.array(
        z.object({
          patientPackageItemId: z.string().uuid(),
          serviceId: z.string().uuid(),
          serviceTitle: z.string().nullable(),
          quantityInitial: z.number().int().positive(),
          reserved: z.number().int(),
          consumed: z.number().int(),
          released: z.number().int(),
          penalty: z.number().int(),
          refunded: z.number().int(),
          remaining: z.number().int().nonnegative(),
          displayRemaining: z.number().int().nonnegative(),
        }),
      ),
    }),
  }),
);

const patientBookingPackageUsageSchema = z.object({
  id: z.string().uuid(),
  patient_package_id: z.string().uuid(),
  patient_package_item_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable(),
  usage_kind: z.enum(['reserve', 'consume', 'release', 'penalty', 'manual_adjust', 'refund']),
  quantity: z.number().int().positive(),
  comment: z.string().nullable(),
  occurred_at: z.string(),
});

function getMembershipsDb(): MembershipsDb {
  return txStorage.getStore() ?? getDrizzleOrMutationTx();
}

async function runMembershipsTransaction<T>(fn: (db: MembershipsDb) => Promise<T>): Promise<T> {
  const activeTx = txStorage.getStore();
  if (activeTx) {
    return fn(activeTx);
  }
  return getDrizzleOrMutationTx().transaction((tx) => txStorage.run(tx, () => fn(tx)));
}

async function loadPackageItems(
  packageIds: string[],
): Promise<Map<string, PatientPackageItemRecord[]>> {
  if (packageIds.length === 0) return new Map();
  const db = getMembershipsDb();
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
    status: row.status as PatientPackageRecord['status'],
    displayNumber: row.displayNumber,
    title: row.title,
    priceMinor: row.priceMinor,
    currency: row.currency,
    validityDays: row.validityDays,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    deductionMode: row.deductionMode as PatientPackageRecord['deductionMode'],
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
    usageKind: row.usageKind as PackageUsageRecord['usageKind'],
    quantity: row.quantity,
    comment: row.comment,
    occurredAt: row.occurredAt,
  };
}

const CANONICAL_INELIGIBLE_APPOINTMENT_STATUSES = new Set([
  'cancelled_by_patient',
  'cancelled_by_specialist',
  'late_cancellation',
  'no_show',
  'rescheduled',
]);

async function loadCanonicalAppointmentStatuses(
  organizationId: string,
  appointmentIds: string[],
): Promise<Map<string, CanonicalAppointmentStatus>> {
  const out = new Map<string, CanonicalAppointmentStatus>();
  if (appointmentIds.length === 0) return out;
  const db = getMembershipsDb();
  const idValues = sql.join(
    appointmentIds.map((id) => sql`(${id}::uuid)`),
    sql`, `,
  );
  const rows = await db.execute<{
    appointment_id: string;
    status: string | null;
    deleted_at: string | null;
  }>(sql`
    WITH appt(id) AS (
      SELECT * FROM (VALUES ${idValues}) v(id)
    )
    SELECT a.id AS appointment_id,
           bea.status,
           bea.deleted_at
    FROM appt a
    LEFT JOIN be_appointments bea
      ON bea.id = a.id
     AND bea.organization_id = ${organizationId}::uuid
  `);
  for (const r of rows.rows) {
    const verdict: CanonicalAppointmentStatus =
      r.status == null
        ? 'none'
        : r.deleted_at != null || CANONICAL_INELIGIBLE_APPOINTMENT_STATUSES.has(r.status)
          ? 'canceled'
          : 'happened';
    out.set(r.appointment_id, verdict);
  }
  return out;
}

export function createPgMembershipsPort(): MembershipsPort {
  return {
    async listCurrentPatientBookingPackages(organizationId, serviceId) {
      if (getCurrentDbPrincipal()?.kind !== 'patient') {
        throw new Error('patient_principal_required');
      }
      const result = await runWebappNamedRoot<{ packages: unknown }>(
        getWebappSqlDb(),
        'app.read_current_patient_booking_packages(uuid)',
        [serviceId],
        sql`SELECT app.read_current_patient_booking_packages(${serviceId}::uuid) AS packages`,
      );
      const packages = patientBookingPackageSnapshotSchema.parse(result.rows[0]?.packages ?? []);
      if (packages.some((item) => item.organizationId !== organizationId)) {
        throw new Error('ambiguous_booking_tenant');
      }
      return packages;
    },
    async reserveCurrentPatientBookingPackage(input) {
      if (getCurrentDbPrincipal()?.kind !== 'patient') {
        throw new Error('patient_principal_required');
      }
      const inputJson = JSON.stringify(input);
      const result = await runWebappNamedRoot<{ usage: unknown }>(
        getWebappSqlDb(),
        'app.reserve_current_patient_booking_package(text)',
        [inputJson],
        sql`SELECT app.reserve_current_patient_booking_package(${inputJson}::text) AS usage`,
      );
      const usage = patientBookingPackageUsageSchema.parse(result.rows[0]?.usage);
      return {
        id: usage.id,
        patientPackageId: usage.patient_package_id,
        patientPackageItemId: usage.patient_package_item_id,
        appointmentId: usage.appointment_id,
        usageKind: usage.usage_kind,
        quantity: usage.quantity,
        comment: usage.comment,
        occurredAt: usage.occurred_at,
      };
    },
    async listCatalogPackages(organizationId, activeOnly = true) {
      const db = getMembershipsDb();
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
      const itemsByPkg = new Map<string, SubscriptionPackageRecord['items']>();
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
        deductionMode: p.deductionMode as SubscriptionPackageRecord['deductionMode'],
        isActive: p.isActive,
        items: itemsByPkg.get(p.id) ?? [],
      }));
    },

    async getCatalogPackage(id, organizationId) {
      const db = getMembershipsDb();
      const rows = await db
        .select()
        .from(beSubscriptionPackages)
        .where(
          and(
            eq(beSubscriptionPackages.id, id),
            eq(beSubscriptionPackages.organizationId, organizationId),
          ),
        )
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
        deductionMode: p.deductionMode as SubscriptionPackageRecord['deductionMode'],
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
      const run = async (db: MembershipsDb) => {
        const now = new Date().toISOString();
        let packageId = input.id;
        if (packageId) {
          await db
            .update(beSubscriptionPackages)
            .set({
              title: input.title,
              description: input.description ?? null,
              priceMinor: input.priceMinor,
              currency: input.currency ?? 'RUB',
              validityDays: input.validityDays ?? null,
              deductionMode: input.deductionMode ?? 'auto_on_visit_confirmed',
              isActive: input.isActive ?? true,
              updatedAt: now,
            })
            .where(
              and(
                eq(beSubscriptionPackages.id, packageId),
                eq(beSubscriptionPackages.organizationId, input.organizationId),
              ),
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
              currency: input.currency ?? 'RUB',
              validityDays: input.validityDays ?? null,
              deductionMode: input.deductionMode ?? 'auto_on_visit_confirmed',
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
        if (!result) throw new Error('package_upsert_failed');
        return result;
      };
      return runMembershipsTransaction(run);
    },

    async getPatientPackage(id, organizationId) {
      const db = getMembershipsDb();
      const rows = await db
        .select()
        .from(bePatientPackages)
        .where(
          and(eq(bePatientPackages.id, id), eq(bePatientPackages.organizationId, organizationId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const itemsMap = await loadPackageItems([id]);
      return mapPatientPackage(row, itemsMap.get(id) ?? []);
    },

    async listPatientPackagesForUser(platformUserId, organizationId, statuses) {
      const db = getMembershipsDb();
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
      const db = getMembershipsDb();
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
      const now = new Date().toISOString();
      const staffSold =
        input.activateImmediately === true ||
        (input.soldAt != null && input.paidAmountMinor != null && input.sendForPayment === false);
      const status =
        staffSold || (input.sendForPayment === false && input.priceMinor === 0)
          ? 'active'
          : 'offered';
      const soldAt = input.soldAt ?? (staffSold ? now : null);
      const paidAmountMinor = input.paidAmountMinor ?? (staffSold ? input.priceMinor : null);
      const paidCurrency = input.paidCurrency ?? input.currency ?? 'RUB';
      return runMembershipsTransaction(async (db) => {
        const inserted = await db
          .insert(bePatientPackages)
          .values({
            organizationId: input.organizationId,
            platformUserId: input.platformUserId,
            status,
            title: input.title?.trim() || 'Индивидуальный',
            priceMinor: input.priceMinor,
            currency: input.currency ?? 'RUB',
            validityDays: input.validityDays ?? null,
            deductionMode: input.deductionMode ?? 'auto_on_visit_confirmed',
            assignedByPlatformUserId: input.assignedByPlatformUserId ?? null,
            notes: input.notes ?? null,
            soldAt,
            paidAmountMinor,
            paidCurrency: staffSold || paidAmountMinor != null ? paidCurrency : null,
            validFrom: status === 'active' ? now : null,
            validUntil:
              status === 'active' && input.validityDays
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
        if (!pkg) throw new Error('package_create_failed');
        return pkg;
      });
    },

    async offerCatalogPackageToPatient(input) {
      const catalog = await this.getCatalogPackage(
        input.subscriptionPackageId,
        input.organizationId,
      );
      if (!catalog) throw new Error('catalog_not_found');
      const now = new Date().toISOString();
      return runMembershipsTransaction(async (db) => {
        const inserted = await db
          .insert(bePatientPackages)
          .values({
            organizationId: input.organizationId,
            platformUserId: input.platformUserId,
            subscriptionPackageId: catalog.id,
            status: 'offered',
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
        if (!pkg) throw new Error('package_offer_failed');
        return pkg;
      });
    },

    async updatePatientPackageNotes(id, organizationId, notes) {
      const now = new Date().toISOString();
      return runMembershipsTransaction(async (db) => {
        const rows = await db
          .update(bePatientPackages)
          .set({ notes, updatedAt: now })
          .where(
            and(eq(bePatientPackages.id, id), eq(bePatientPackages.organizationId, organizationId)),
          )
          .returning();
        const row = rows[0];
        if (!row) return null;
        const itemsMap = await loadPackageItems([id]);
        return mapPatientPackage(row, itemsMap.get(id) ?? []);
      });
    },

    async listPackageAppointmentSessionSources(patientPackageId, organizationId, options) {
      const db = getMembershipsDb();
      const nowIso = options.nowIso ?? new Date().toISOString();

      // Step 1: find ALL appointments for this patient whose service is in the package,
      // starting from the package's sold date. This mirrors listRecalcCandidateAppointments
      // but includes future appointments too (no upper bound on startAt).
      if (options.serviceIds.length === 0) return [];

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
            eq(beAppointments.platformUserId, options.platformUserId),
            inArray(beAppointments.serviceId, options.serviceIds),
            gte(beAppointments.startAt, options.soldAtIso),
          ),
        )
        .orderBy(asc(beAppointments.startAt));

      if (apptRows.length === 0) return [];

      // Step 2: collect usages for these appointments (from ANY package) plus usages linked
      // to this specific package with no appointment (manual consumes without appointment).
      // We only need appointment-linked usages here; non-appointment usages don't affect the
      // session list.
      const apptIds = apptRows.map((a) => a.id);
      const usageRows = await db
        .select()
        .from(bePackageUsages)
        .where(
          and(
            eq(bePackageUsages.organizationId, organizationId),
            isNotNull(bePackageUsages.appointmentId),
            inArray(bePackageUsages.appointmentId, apptIds),
          ),
        )
        .orderBy(asc(bePackageUsages.occurredAt));

      void nowIso; // available if callers need upper-bound filtering in future

      const usagesByAppointment = new Map<string, PackageUsageRecord[]>();
      for (const row of usageRows) {
        if (!row.appointmentId) continue;
        const list = usagesByAppointment.get(row.appointmentId) ?? [];
        list.push(mapUsage(row));
        usagesByAppointment.set(row.appointmentId, list);
      }

      const canonicalStatuses = await loadCanonicalAppointmentStatuses(organizationId, apptIds);

      return apptRows.map((appt) => ({
        appointmentId: appt.id,
        startsAt: appt.startAt,
        endsAt: appt.endAt,
        status: appt.status,
        canonicalStatus: canonicalStatuses.get(appt.id) ?? 'none',
        branchTitle: appt.branchTitle,
        serviceTitle: appt.serviceTitle,
        serviceId: appt.serviceId,
        usages: usagesByAppointment.get(appt.id) ?? [],
      }));
    },

    async listRecalcCandidateAppointments(input) {
      const db = getMembershipsDb();
      if (input.serviceIds.length === 0) return [];

      const apptRows = await db
        .select({
          id: beAppointments.id,
          startAt: beAppointments.startAt,
          status: beAppointments.status,
          serviceId: beAppointments.serviceId,
        })
        .from(beAppointments)
        .where(
          and(
            eq(beAppointments.organizationId, input.organizationId),
            eq(beAppointments.platformUserId, input.platformUserId),
            inArray(beAppointments.serviceId, input.serviceIds),
            gte(beAppointments.startAt, input.soldAtIso),
            lt(beAppointments.startAt, input.nowIso),
          ),
        )
        .orderBy(asc(beAppointments.startAt));

      if (apptRows.length === 0) return [];

      const appointmentIds = apptRows.map((a) => a.id);
      const usageRows = await db
        .select()
        .from(bePackageUsages)
        .where(
          and(
            eq(bePackageUsages.organizationId, input.organizationId),
            inArray(bePackageUsages.appointmentId, appointmentIds),
          ),
        )
        .orderBy(asc(bePackageUsages.occurredAt));

      const usagesByAppointment = new Map<string, PackageUsageRecord[]>();
      for (const row of usageRows) {
        if (!row.appointmentId) continue;
        const list = usagesByAppointment.get(row.appointmentId) ?? [];
        list.push(mapUsage(row));
        usagesByAppointment.set(row.appointmentId, list);
      }

      const canonicalStatuses = await loadCanonicalAppointmentStatuses(
        input.organizationId,
        appointmentIds,
      );

      return apptRows.map((appt) => ({
        appointmentId: appt.id,
        startsAt: appt.startAt,
        status: appt.status,
        canonicalStatus: canonicalStatuses.get(appt.id) ?? 'none',
        serviceId: appt.serviceId,
        usages: usagesByAppointment.get(appt.id) ?? [],
      }));
    },

    async runWithPackageLock(patientPackageId, _organizationId, fn) {
      const db = getDrizzle();
      // ST-02: serialize concurrent «Пересчитать» passes for one package. A transaction-scoped
      // advisory lock (auto-released at COMMIT/ROLLBACK) keyed on a stable 64-bit hash of the
      // package id. Postgres blocks the second transaction until the first commits, so the second
      // pass reads balances AFTER the first pass's debits landed — no double-debit.
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${patientPackageId}, 0))`,
        );
        return txStorage.run(tx, fn);
      });
    },

    async setPatientPackageStatus(id, organizationId, status, patch) {
      const now = new Date().toISOString();
      const set: Partial<typeof bePatientPackages.$inferInsert> = { status, updatedAt: now };
      if (patch?.paymentIntentId !== undefined) set.paymentIntentId = patch.paymentIntentId;
      if (patch?.paymentRef !== undefined) set.paymentRef = patch.paymentRef;
      if (patch?.validFrom !== undefined) set.validFrom = patch.validFrom;
      if (patch?.validUntil !== undefined) set.validUntil = patch.validUntil;
      if (patch?.soldAt !== undefined) set.soldAt = patch.soldAt;
      if (patch?.paidAmountMinor !== undefined) set.paidAmountMinor = patch.paidAmountMinor;
      if (patch?.paidCurrency !== undefined) set.paidCurrency = patch.paidCurrency;
      return runMembershipsTransaction(async (db) => {
        const rows = await db
          .update(bePatientPackages)
          .set(set)
          .where(
            and(eq(bePatientPackages.id, id), eq(bePatientPackages.organizationId, organizationId)),
          )
          .returning();
        const row = rows[0];
        if (!row) return null;
        const itemsMap = await loadPackageItems([id]);
        return mapPatientPackage(row, itemsMap.get(id) ?? []);
      });
    },

    async appendUsage(input) {
      const now = new Date().toISOString();
      return runMembershipsTransaction(async (db) => {
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
      });
    },

    async listUsagesForPackage(patientPackageId, organizationId) {
      const db = getMembershipsDb();
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
      const db = getMembershipsDb();
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

    async recordReservedAppointmentDebit(input) {
      const now = new Date().toISOString();
      const run = async (executor: MembershipsDb) => {
        const inserted = await executor
          .insert(bePackageUsages)
          .values({
            organizationId: input.organizationId,
            patientPackageId: input.patientPackageId,
            patientPackageItemId: input.patientPackageItemId,
            appointmentId: input.appointmentId,
            usageKind: input.usageKind,
            quantity: 1,
            createdByPlatformUserId: input.createdByPlatformUserId ?? null,
            occurredAt: now,
            createdAt: now,
          })
          .returning();
        const debit = mapUsage(inserted[0]!);

        await executor.insert(bePackageUsages).values({
          organizationId: input.organizationId,
          patientPackageId: input.patientPackageId,
          patientPackageItemId: input.patientPackageItemId,
          appointmentId: input.appointmentId,
          usageKind: 'release',
          quantity: 1,
          createdByPlatformUserId: input.createdByPlatformUserId ?? null,
          occurredAt: now,
          createdAt: now,
        });

        await executor
          .update(beAppointments)
          .set({ packageUsageRef: debit.id, updatedAt: now })
          .where(eq(beAppointments.id, input.appointmentId));

        await executor.insert(bePackageHistoryEvents).values({
          organizationId: input.organizationId,
          patientPackageId: input.patientPackageId,
          eventType: input.eventType,
          payloadJson: { appointmentId: input.appointmentId, usageId: debit.id },
          occurredAt: now,
        });

        return debit;
      };

      if (txStorage.getStore()) {
        return run(getMembershipsDb());
      }
      return getDrizzle().transaction(run);
    },

    async finalizeAppointmentDebit(input) {
      const now = new Date().toISOString();
      const run = async (executor: MembershipsDb) => {
        const releaseRows = await executor
          .select({ id: bePackageUsages.id })
          .from(bePackageUsages)
          .where(
            and(
              eq(bePackageUsages.organizationId, input.organizationId),
              eq(bePackageUsages.appointmentId, input.appointmentId),
              eq(bePackageUsages.patientPackageId, input.patientPackageId),
              eq(bePackageUsages.patientPackageItemId, input.patientPackageItemId),
              eq(bePackageUsages.usageKind, 'release'),
            ),
          )
          .limit(1);

        if (!releaseRows[0]) {
          await executor.insert(bePackageUsages).values({
            organizationId: input.organizationId,
            patientPackageId: input.patientPackageId,
            patientPackageItemId: input.patientPackageItemId,
            appointmentId: input.appointmentId,
            usageKind: 'release',
            quantity: 1,
            createdByPlatformUserId: input.createdByPlatformUserId ?? null,
            occurredAt: now,
            createdAt: now,
          });
        }

        await executor
          .update(beAppointments)
          .set({ packageUsageRef: input.debitUsageId, updatedAt: now })
          .where(eq(beAppointments.id, input.appointmentId));
      };

      if (txStorage.getStore()) {
        await run(getMembershipsDb());
        return;
      }
      await getDrizzle().transaction(run);
    },

    async appendHistoryEvent(input) {
      await runMembershipsTransaction(async (db) => {
        await db.insert(bePackageHistoryEvents).values({
          organizationId: input.organizationId,
          patientPackageId: input.patientPackageId,
          eventType: input.eventType,
          payloadJson: input.payloadJson ?? {},
          occurredAt: new Date().toISOString(),
        });
      });
    },

    async listHistoryForPackage(patientPackageId, organizationId) {
      const db = getMembershipsDb();
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
      await runMembershipsTransaction(async (db) => {
        await db
          .update(beAppointments)
          .set({ packageUsageRef: usageRef, updatedAt: new Date().toISOString() })
          .where(eq(beAppointments.id, appointmentId));
      });
    },

    async recalcCorrectCanceledAppointment(input) {
      const db = getMembershipsDb();
      const now = new Date().toISOString();
      const run = async (executor: MembershipsDb) => {
        const inserted = await executor
          .insert(bePackageUsages)
          .values({
            organizationId: input.organizationId,
            patientPackageId: input.patientPackageId,
            patientPackageItemId: input.patientPackageItemId,
            appointmentId: input.appointmentId,
            usageKind: 'refund',
            quantity: input.quantity,
            comment: 'recalc_correction_canceled_visit',
            createdByPlatformUserId: input.createdByPlatformUserId ?? null,
            occurredAt: now,
            createdAt: now,
          })
          .returning();
        const refund = mapUsage(inserted[0]!);

        await executor
          .update(beAppointments)
          .set({ packageUsageRef: null, updatedAt: now })
          .where(eq(beAppointments.id, input.appointmentId));

        await executor.insert(bePackageHistoryEvents).values({
          organizationId: input.organizationId,
          patientPackageId: input.patientPackageId,
          eventType: 'recalc_corrected_canceled',
          payloadJson: {
            appointmentId: input.appointmentId,
            consumeUsageId: input.consumeUsageId,
            refundUsageId: refund.id,
            serviceId: input.serviceId,
          },
          occurredAt: now,
        });

        return refund;
      };

      if (txStorage.getStore()) {
        return run(db);
      }
      return getDrizzle().transaction(run);
    },

    async recalcConsumeForAppointment(input) {
      const db = getMembershipsDb();
      const now = new Date().toISOString();
      const run = async (executor: MembershipsDb) => {
        const inserted = await executor
          .insert(bePackageUsages)
          .values({
            organizationId: input.organizationId,
            patientPackageId: input.patientPackageId,
            patientPackageItemId: input.patientPackageItemId,
            appointmentId: input.appointmentId,
            usageKind: 'consume',
            quantity: 1,
            createdByPlatformUserId: input.createdByPlatformUserId ?? null,
            occurredAt: now,
            createdAt: now,
          })
          .returning();
        const usage = mapUsage(inserted[0]!);

        await executor
          .update(beAppointments)
          .set({ packageUsageRef: usage.id, updatedAt: now })
          .where(eq(beAppointments.id, input.appointmentId));

        await executor.insert(bePackageHistoryEvents).values({
          organizationId: input.organizationId,
          patientPackageId: input.patientPackageId,
          eventType: 'recalc_consumed',
          payloadJson: {
            appointmentId: input.appointmentId,
            usageId: usage.id,
            serviceId: input.serviceId,
            ...(input.payloadJson ?? {}),
          },
          occurredAt: now,
        });

        return usage;
      };
      try {
        if (txStorage.getStore()) {
          return await run(db);
        }
        return await getDrizzle().transaction(run);
      } catch (err) {
        // PostgreSQL unique_violation (23505): concurrent parallel call already inserted consume
        // for the same appointment — treat as duplicate_consume so the caller can skip gracefully.
        const code = (err as { code?: string })?.code;
        if (code === '23505') {
          throw Object.assign(new Error('duplicate_consume'), { code: 'duplicate_consume' });
        }
        throw err;
      }
    },
  };
}
