import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  beAppointmentStaffComments,
  bePatientBookingProfiles,
} from "../../../db/schema/bookingClientProfile";
import {
  beAppointmentCancellations,
  beAppointmentReschedules,
} from "../../../db/schema/bookingPolicies";
import {
  beAppointments,
  beBranches,
  beClinicServices,
  bePatientTimelineEvents,
  beRooms,
  beSpecialists,
} from "../../../db/schema/bookingEngine";
import {
  bePackageHistoryEvents,
  bePackageUsages,
  bePatientPackageItems,
  bePatientPackages,
} from "../../../db/schema/bookingMemberships";
import { bePaymentHistoryEvents } from "../../../db/schema/bookingPayments";
import { beProductHistoryEvents, beProductPurchases } from "../../../db/schema/bookingProducts";
import { doctorNotes, platformUsers } from "../../../db/schema/schema";
import type { ClientHistoryPort } from "@/modules/client-history/ports";
import type {
  AppointmentStaffCommentRow,
  ClientTimelineItem,
  ClientVisitHistoryRow,
  PatientBookingProfile,
} from "@/modules/client-history/types";
import {
  dedupeTimelineItems,
  enrichPaymentHistoryRow,
  isFinalPaymentEventType,
  isPrepaymentEventType,
  parsePaymentPayloadRefs,
} from "@/modules/client-history/clientHistoryUtils";
import {
  formatAmountMinor,
  paymentMethodLabel,
  timelineEventTitle,
} from "@/modules/client-history/labels";

function sourceFetchLimit(limit: number): number {
  return Math.min(Math.max(limit * 3, 150), 500);
}

function mapProfile(row: typeof bePatientBookingProfiles.$inferSelect): PatientBookingProfile {
  return {
    platformUserId: row.platformUserId,
    organizationId: row.organizationId,
    isProblematic: row.isProblematic,
    bookingBlocked: row.bookingBlocked,
    problematicNote: row.problematicNote,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function mapStaffComment(row: typeof beAppointmentStaffComments.$inferSelect): AppointmentStaffCommentRow {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    platformUserId: row.platformUserId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function resolveUserPhone(platformUserId: string): Promise<string | null> {
  const db = getDrizzle();
  const rows = await db
    .select({ phone: platformUsers.phoneNormalized })
    .from(platformUsers)
    .where(eq(platformUsers.id, platformUserId))
    .limit(1);
  const phone = rows[0]?.phone?.trim();
  return phone || null;
}

function productPurchaseScope(organizationId: string, platformUserId: string, phone: string | null) {
  if (!phone) {
    return and(
      eq(beProductPurchases.organizationId, organizationId),
      eq(beProductPurchases.platformUserId, platformUserId),
    );
  }
  return and(
    eq(beProductPurchases.organizationId, organizationId),
    or(
      eq(beProductPurchases.platformUserId, platformUserId),
      and(isNull(beProductPurchases.platformUserId), eq(beProductPurchases.buyerPhoneNormalized, phone)),
    ),
  );
}

type PaymentHistoryRow = typeof bePaymentHistoryEvents.$inferSelect;

async function fetchPhoneMatchedOrphanPaymentRows(
  organizationId: string,
  userPhone: string | null,
  fetchLimit: number,
): Promise<PaymentHistoryRow[]> {
  if (!userPhone) return [];
  const db = getDrizzle();
  const phonePurchases = await db
    .select({ id: beProductPurchases.id })
    .from(beProductPurchases)
    .where(
      and(
        eq(beProductPurchases.organizationId, organizationId),
        isNull(beProductPurchases.platformUserId),
        eq(beProductPurchases.buyerPhoneNormalized, userPhone),
      ),
    );
  const refs = phonePurchases.map((p) => `product_purchase:${p.id}`);
  if (refs.length === 0) return [];

  const orphanRows = await db
    .select()
    .from(bePaymentHistoryEvents)
    .where(
      and(
        eq(bePaymentHistoryEvents.organizationId, organizationId),
        isNull(bePaymentHistoryEvents.platformUserId),
      ),
    )
    .orderBy(desc(bePaymentHistoryEvents.occurredAt))
    .limit(fetchLimit);

  return orphanRows.filter((row) => {
    const payload = row.payloadJson as Record<string, unknown>;
    const productRef = typeof payload.productRef === "string" ? payload.productRef : null;
    return productRef != null && refs.includes(productRef);
  });
}

function mergePaymentHistoryRows(primaryRows: PaymentHistoryRow[], extraRows: PaymentHistoryRow[], fetchLimit: number) {
  const seenIds = new Set<string>();
  const rows = [...primaryRows, ...extraRows].filter((row) => {
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });
  rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return rows.slice(0, fetchLimit);
}

export function createPgClientHistoryPort(): ClientHistoryPort {
  return {
    async listTimeline(organizationId, platformUserId, limit = 100) {
      const db = getDrizzle();
      const fetchLimit = sourceFetchLimit(limit);
      const userPhone = await resolveUserPhone(platformUserId);

      const [
        timelineRows,
        primaryPaymentRows,
        packageHistoryRows,
        productHistoryRows,
        productRows,
        packageUsageRows,
        rescheduleRows,
        cancelRows,
        noteRows,
        commentRows,
      ] = await Promise.all([
        db
          .select()
          .from(bePatientTimelineEvents)
          .where(
            and(
              eq(bePatientTimelineEvents.organizationId, organizationId),
              eq(bePatientTimelineEvents.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(bePatientTimelineEvents.occurredAt))
          .limit(fetchLimit),
        db
          .select()
          .from(bePaymentHistoryEvents)
          .where(
            and(
              eq(bePaymentHistoryEvents.organizationId, organizationId),
              eq(bePaymentHistoryEvents.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(bePaymentHistoryEvents.occurredAt))
          .limit(fetchLimit),
        db
          .select({
            id: bePackageHistoryEvents.id,
            eventType: bePackageHistoryEvents.eventType,
            occurredAt: bePackageHistoryEvents.occurredAt,
            payloadJson: bePackageHistoryEvents.payloadJson,
            packageTitle: bePatientPackages.title,
            patientPackageId: bePackageHistoryEvents.patientPackageId,
          })
          .from(bePackageHistoryEvents)
          .innerJoin(bePatientPackages, eq(bePackageHistoryEvents.patientPackageId, bePatientPackages.id))
          .where(
            and(
              eq(bePackageHistoryEvents.organizationId, organizationId),
              eq(bePatientPackages.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(bePackageHistoryEvents.occurredAt))
          .limit(fetchLimit),
        db
          .select({
            id: beProductHistoryEvents.id,
            eventType: beProductHistoryEvents.eventType,
            occurredAt: beProductHistoryEvents.occurredAt,
            payloadJson: beProductHistoryEvents.payloadJson,
            productPurchaseId: beProductHistoryEvents.productPurchaseId,
            purchaseTitle: beProductPurchases.title,
          })
          .from(beProductHistoryEvents)
          .innerJoin(beProductPurchases, eq(beProductHistoryEvents.productPurchaseId, beProductPurchases.id))
          .where(
            and(
              eq(beProductHistoryEvents.organizationId, organizationId),
              productPurchaseScope(organizationId, platformUserId, userPhone),
            ),
          )
          .orderBy(desc(beProductHistoryEvents.occurredAt))
          .limit(fetchLimit),
        db
          .select()
          .from(beProductPurchases)
          .where(productPurchaseScope(organizationId, platformUserId, userPhone))
          .orderBy(desc(beProductPurchases.createdAt))
          .limit(fetchLimit),
        db
          .select({
            id: bePackageUsages.id,
            usageKind: bePackageUsages.usageKind,
            occurredAt: bePackageUsages.occurredAt,
            comment: bePackageUsages.comment,
            appointmentId: bePackageUsages.appointmentId,
            packageTitle: bePatientPackages.title,
            serviceTitle: beClinicServices.title,
          })
          .from(bePackageUsages)
          .innerJoin(bePatientPackages, eq(bePackageUsages.patientPackageId, bePatientPackages.id))
          .innerJoin(bePatientPackageItems, eq(bePackageUsages.patientPackageItemId, bePatientPackageItems.id))
          .innerJoin(beClinicServices, eq(bePatientPackageItems.serviceId, beClinicServices.id))
          .where(
            and(
              eq(bePackageUsages.organizationId, organizationId),
              eq(bePatientPackages.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(bePackageUsages.occurredAt))
          .limit(fetchLimit),
        db
          .select({
            id: beAppointmentReschedules.id,
            appointmentId: beAppointmentReschedules.appointmentId,
            fromStartAt: beAppointmentReschedules.fromStartAt,
            toStartAt: beAppointmentReschedules.toStartAt,
            reason: beAppointmentReschedules.reason,
            staffComment: beAppointmentReschedules.staffComment,
            createdAt: beAppointmentReschedules.createdAt,
          })
          .from(beAppointmentReschedules)
          .innerJoin(beAppointments, eq(beAppointmentReschedules.appointmentId, beAppointments.id))
          .where(
            and(
              eq(beAppointmentReschedules.organizationId, organizationId),
              eq(beAppointments.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(beAppointmentReschedules.createdAt))
          .limit(fetchLimit),
        db
          .select({
            id: beAppointmentCancellations.id,
            appointmentId: beAppointmentCancellations.appointmentId,
            cancellationType: beAppointmentCancellations.cancellationType,
            reason: beAppointmentCancellations.reason,
            staffComment: beAppointmentCancellations.staffComment,
            wasFree: beAppointmentCancellations.wasFree,
            wasPenalized: beAppointmentCancellations.wasPenalized,
            createdAt: beAppointmentCancellations.createdAt,
          })
          .from(beAppointmentCancellations)
          .innerJoin(beAppointments, eq(beAppointmentCancellations.appointmentId, beAppointments.id))
          .where(
            and(
              eq(beAppointmentCancellations.organizationId, organizationId),
              eq(beAppointments.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(beAppointmentCancellations.createdAt))
          .limit(fetchLimit),
        db
          .select()
          .from(doctorNotes)
          .where(eq(doctorNotes.userId, platformUserId))
          .orderBy(desc(doctorNotes.createdAt))
          .limit(fetchLimit),
        db
          .select()
          .from(beAppointmentStaffComments)
          .where(
            and(
              eq(beAppointmentStaffComments.organizationId, organizationId),
              eq(beAppointmentStaffComments.platformUserId, platformUserId),
            ),
          )
          .orderBy(desc(beAppointmentStaffComments.createdAt))
          .limit(fetchLimit),
      ]);

      const phonePaymentRows = await fetchPhoneMatchedOrphanPaymentRows(organizationId, userPhone, fetchLimit);
      const paymentRows = mergePaymentHistoryRows(
        primaryPaymentRows,
        phonePaymentRows,
        fetchLimit,
      );

      const items: ClientTimelineItem[] = [];

      for (const row of timelineRows) {
        const category =
          row.domain === "payment"
            ? "payment"
            : row.domain === "package"
              ? "package"
              : "appointment";
        items.push({
          id: row.id,
          category,
          eventType: row.eventType,
          title: timelineEventTitle(row.eventType),
          summary: null,
          occurredAt: row.occurredAt,
          linkedObjectType: row.linkedObjectType,
          linkedObjectId: row.linkedObjectId,
          appointmentId: row.linkedObjectType === "appointment" ? row.linkedObjectId : null,
          payload: row.payload ?? {},
        });
      }

      for (const row of paymentRows) {
        const amount = formatAmountMinor(row.amountMinor, row.currency);
        items.push({
          id: row.id,
          category: "payment",
          eventType: row.eventType,
          title: timelineEventTitle(row.eventType),
          summary: amount,
          occurredAt: row.occurredAt,
          linkedObjectType: "payment_history_event",
          linkedObjectId: row.id,
          appointmentId: row.appointmentId,
          payload: {
            amountMinor: row.amountMinor,
            currency: row.currency,
            providerId: row.providerId,
            status: row.status,
            purpose: row.purpose,
            comment: row.comment,
            ...(row.payloadJson as Record<string, unknown>),
          },
        });
      }

      for (const row of packageHistoryRows) {
        items.push({
          id: row.id,
          category: "package",
          eventType: row.eventType,
          title: timelineEventTitle(row.eventType),
          summary: row.packageTitle,
          occurredAt: row.occurredAt,
          linkedObjectType: "patient_package",
          linkedObjectId: row.patientPackageId,
          appointmentId: null,
          payload: (row.payloadJson as Record<string, unknown>) ?? {},
        });
      }

      for (const row of productHistoryRows) {
        items.push({
          id: row.id,
          category: "product",
          eventType: row.eventType,
          title: timelineEventTitle(row.eventType),
          summary: row.purchaseTitle,
          occurredAt: row.occurredAt,
          linkedObjectType: "product_history_event",
          linkedObjectId: row.id,
          appointmentId: null,
          payload: {
            productPurchaseId: row.productPurchaseId,
            ...((row.payloadJson as Record<string, unknown>) ?? {}),
          },
        });
      }

      for (const row of productRows) {
        items.push({
          id: row.id,
          category: "product",
          eventType: "product_purchased",
          title: timelineEventTitle("product_purchased"),
          summary: row.title,
          occurredAt: row.createdAt,
          linkedObjectType: "product_purchase",
          linkedObjectId: row.id,
          appointmentId: null,
          payload: {
            productPurchaseId: row.id,
            productType: row.productType,
            status: row.status,
            priceMinor: row.priceMinor,
            currency: row.currency,
          },
        });
      }

      for (const row of packageUsageRows) {
        if (row.usageKind === "reserve" || row.usageKind === "release") continue;
        const summary = row.serviceTitle
          ? `${row.packageTitle}: ${row.serviceTitle}`
          : row.packageTitle;
        items.push({
          id: row.id,
          category: "package",
          eventType: row.usageKind === "consume" || row.usageKind === "penalty" ? row.usageKind : "package_usage",
          title: timelineEventTitle(
            row.usageKind === "manual_adjust"
              ? "manual_adjust"
              : row.usageKind === "penalty"
                ? "penalty_consumed"
                : row.usageKind,
          ),
          summary,
          occurredAt: row.occurredAt,
          linkedObjectType: "package_usage",
          linkedObjectId: row.id,
          appointmentId: row.appointmentId,
          payload: {
            usageId: row.id,
            usageKind: row.usageKind,
            comment: row.comment,
          },
        });
      }

      for (const row of rescheduleRows) {
        items.push({
          id: row.id,
          category: "reschedule",
          eventType: "reschedule",
          title: timelineEventTitle("reschedule"),
          summary: row.reason ?? null,
          occurredAt: row.createdAt,
          linkedObjectType: "appointment_reschedule",
          linkedObjectId: row.id,
          appointmentId: row.appointmentId,
          payload: {
            fromStartAt: row.fromStartAt,
            toStartAt: row.toStartAt,
            staffComment: row.staffComment,
          },
        });
      }

      for (const row of cancelRows) {
        items.push({
          id: row.id,
          category: "cancellation",
          eventType: "cancellation",
          title: timelineEventTitle("cancellation"),
          summary: row.reason ?? row.cancellationType,
          occurredAt: row.createdAt,
          linkedObjectType: "appointment_cancellation",
          linkedObjectId: row.id,
          appointmentId: row.appointmentId,
          payload: {
            cancellationType: row.cancellationType,
            wasFree: row.wasFree,
            wasPenalized: row.wasPenalized,
            staffComment: row.staffComment,
          },
        });
      }

      for (const row of noteRows) {
        items.push({
          id: row.id,
          category: "comment",
          eventType: "doctor_note",
          title: timelineEventTitle("doctor_note"),
          summary: row.text.slice(0, 120),
          occurredAt: row.createdAt,
          linkedObjectType: "doctor_note",
          linkedObjectId: row.id,
          appointmentId: null,
          payload: { text: row.text },
        });
      }

      for (const row of commentRows) {
        items.push({
          id: row.id,
          category: "comment",
          eventType: "staff_comment",
          title: timelineEventTitle("staff_comment"),
          summary: row.body.slice(0, 120),
          occurredAt: row.createdAt,
          linkedObjectType: "appointment_staff_comment",
          linkedObjectId: row.id,
          appointmentId: row.appointmentId,
          payload: { body: row.body },
        });
      }

      return dedupeTimelineItems(items).slice(0, limit);
    },

    async listPaymentHistory(organizationId, platformUserId, limit = 100) {
      const db = getDrizzle();
      const fetchLimit = sourceFetchLimit(limit);
      const userPhone = await resolveUserPhone(platformUserId);

      const primaryRows = await db
        .select()
        .from(bePaymentHistoryEvents)
        .where(
          and(
            eq(bePaymentHistoryEvents.organizationId, organizationId),
            eq(bePaymentHistoryEvents.platformUserId, platformUserId),
          ),
        )
        .orderBy(desc(bePaymentHistoryEvents.occurredAt))
        .limit(fetchLimit);

      const phoneMatchedRows = await fetchPhoneMatchedOrphanPaymentRows(organizationId, userPhone, fetchLimit);
      const limitedRows = mergePaymentHistoryRows(primaryRows, phoneMatchedRows, fetchLimit);

      const appointmentIds = [...new Set(limitedRows.map((r) => r.appointmentId).filter(Boolean))] as string[];
      const serviceByAppt = new Map<string, string>();
      if (appointmentIds.length > 0) {
        const appts = await db
          .select({
            id: beAppointments.id,
            serviceTitle: beClinicServices.title,
          })
          .from(beAppointments)
          .leftJoin(beClinicServices, eq(beAppointments.serviceId, beClinicServices.id))
          .where(inArray(beAppointments.id, appointmentIds));
        for (const a of appts) {
          if (a.serviceTitle) serviceByAppt.set(a.id, a.serviceTitle);
        }
      }

      const packageIds = new Set<string>();
      const productPurchaseIds = new Set<string>();
      for (const row of limitedRows) {
        const refs = parsePaymentPayloadRefs(row.payloadJson as Record<string, unknown>);
        if (refs.patientPackageId) packageIds.add(refs.patientPackageId);
        if (refs.productPurchaseId) productPurchaseIds.add(refs.productPurchaseId);
      }

      const packageTitles = new Map<string, string>();
      if (packageIds.size > 0) {
        const pkgs = await db
          .select({ id: bePatientPackages.id, title: bePatientPackages.title })
          .from(bePatientPackages)
          .where(inArray(bePatientPackages.id, [...packageIds]));
        for (const p of pkgs) packageTitles.set(p.id, p.title);
      }

      const productTitles = new Map<string, string>();
      if (productPurchaseIds.size > 0) {
        const prods = await db
          .select({ id: beProductPurchases.id, title: beProductPurchases.title })
          .from(beProductPurchases)
          .where(inArray(beProductPurchases.id, [...productPurchaseIds]));
        for (const p of prods) productTitles.set(p.id, p.title);
      }

      return limitedRows
        .slice(0, limit)
        .map((row) =>
          enrichPaymentHistoryRow(
            {
              id: row.id,
              occurredAt: row.occurredAt,
              eventType: row.eventType,
              amountMinor: row.amountMinor,
              currency: row.currency,
              providerId: row.providerId,
              status: row.status,
              purpose: row.purpose,
              appointmentId: row.appointmentId,
              paymentId: row.paymentId,
              refundId: row.refundId,
              comment: row.comment,
              payloadJson: row.payloadJson as Record<string, unknown>,
            },
            {
              serviceByAppt,
              packageTitles,
              productTitles,
              paymentMethodLabel,
            },
          ),
        );
    },

    async listVisitHistory(organizationId, platformUserId, limit = 100) {
      const db = getDrizzle();
      const appts = await db
        .select({
          id: beAppointments.id,
          startAt: beAppointments.startAt,
          endAt: beAppointments.endAt,
          durationMinutes: beAppointments.durationMinutes,
          status: beAppointments.status,
          specialistName: beSpecialists.fullName,
          branchTitle: beBranches.title,
          roomTitle: beRooms.title,
          serviceTitle: beClinicServices.title,
          packageUsageRef: beAppointments.packageUsageRef,
        })
        .from(beAppointments)
        .leftJoin(beSpecialists, eq(beAppointments.specialistId, beSpecialists.id))
        .leftJoin(beBranches, eq(beAppointments.branchId, beBranches.id))
        .leftJoin(beRooms, eq(beAppointments.roomId, beRooms.id))
        .leftJoin(beClinicServices, eq(beAppointments.serviceId, beClinicServices.id))
        .where(
          and(
            eq(beAppointments.organizationId, organizationId),
            eq(beAppointments.platformUserId, platformUserId),
          ),
        )
        .orderBy(desc(beAppointments.startAt))
        .limit(limit);

      if (appts.length === 0) return [];

      const apptIds = appts.map((a) => a.id);

      const [usages, payments, cancelComments, rescheduleComments, staffComments] = await Promise.all([
        db
          .select({
            appointmentId: bePackageUsages.appointmentId,
            serviceTitle: beClinicServices.title,
            packageTitle: bePatientPackages.title,
          })
          .from(bePackageUsages)
          .innerJoin(bePatientPackageItems, eq(bePackageUsages.patientPackageItemId, bePatientPackageItems.id))
          .innerJoin(beClinicServices, eq(bePatientPackageItems.serviceId, beClinicServices.id))
          .innerJoin(bePatientPackages, eq(bePackageUsages.patientPackageId, bePatientPackages.id))
          .where(
            and(
              eq(bePackageUsages.organizationId, organizationId),
              inArray(bePackageUsages.appointmentId, apptIds),
            ),
          ),
        db
          .select({
            appointmentId: bePaymentHistoryEvents.appointmentId,
            eventType: bePaymentHistoryEvents.eventType,
            amountMinor: bePaymentHistoryEvents.amountMinor,
            currency: bePaymentHistoryEvents.currency,
          })
          .from(bePaymentHistoryEvents)
          .where(
            and(
              eq(bePaymentHistoryEvents.organizationId, organizationId),
              inArray(bePaymentHistoryEvents.appointmentId, apptIds),
            ),
          ),
        db
          .select({
            appointmentId: beAppointmentCancellations.appointmentId,
            staffComment: beAppointmentCancellations.staffComment,
            createdAt: beAppointmentCancellations.createdAt,
          })
          .from(beAppointmentCancellations)
          .where(
            and(
              eq(beAppointmentCancellations.organizationId, organizationId),
              inArray(beAppointmentCancellations.appointmentId, apptIds),
            ),
          )
          .orderBy(desc(beAppointmentCancellations.createdAt)),
        db
          .select({
            appointmentId: beAppointmentReschedules.appointmentId,
            staffComment: beAppointmentReschedules.staffComment,
            createdAt: beAppointmentReschedules.createdAt,
          })
          .from(beAppointmentReschedules)
          .where(
            and(
              eq(beAppointmentReschedules.organizationId, organizationId),
              inArray(beAppointmentReschedules.appointmentId, apptIds),
            ),
          )
          .orderBy(desc(beAppointmentReschedules.createdAt)),
        db
          .select({
            appointmentId: beAppointmentStaffComments.appointmentId,
            body: beAppointmentStaffComments.body,
            createdAt: beAppointmentStaffComments.createdAt,
          })
          .from(beAppointmentStaffComments)
          .where(
            and(
              eq(beAppointmentStaffComments.organizationId, organizationId),
              inArray(beAppointmentStaffComments.appointmentId, apptIds),
            ),
          )
          .orderBy(desc(beAppointmentStaffComments.createdAt)),
      ]);

      const usageByAppt = new Map<string, string>();
      for (const u of usages) {
        if (!u.appointmentId) continue;
        usageByAppt.set(u.appointmentId, `${u.packageTitle}: ${u.serviceTitle}`);
      }

      const prepayByAppt = new Map<string, { amountMinor: number; currency: string | null }>();
      const finalPayByAppt = new Map<string, { amountMinor: number; currency: string | null }>();
      for (const p of payments) {
        if (!p.appointmentId || p.amountMinor == null) continue;
        if (isPrepaymentEventType(p.eventType)) {
          prepayByAppt.set(p.appointmentId, { amountMinor: p.amountMinor, currency: p.currency });
        } else if (isFinalPaymentEventType(p.eventType)) {
          finalPayByAppt.set(p.appointmentId, { amountMinor: p.amountMinor, currency: p.currency });
        }
      }

      const commentByAppt = new Map<string, string>();
      for (const c of staffComments) {
        if (!commentByAppt.has(c.appointmentId)) {
          commentByAppt.set(c.appointmentId, c.body);
        }
      }
      for (const c of rescheduleComments) {
        if (c.staffComment && !commentByAppt.has(c.appointmentId)) {
          commentByAppt.set(c.appointmentId, c.staffComment);
        }
      }
      for (const c of cancelComments) {
        if (c.staffComment && !commentByAppt.has(c.appointmentId)) {
          commentByAppt.set(c.appointmentId, c.staffComment);
        }
      }

      return appts.map(
        (a): ClientVisitHistoryRow => ({
          appointmentId: a.id,
          startAt: a.startAt,
          endAt: a.endAt,
          durationMinutes: a.durationMinutes,
          status: a.status,
          specialistName: a.specialistName,
          branchTitle: a.branchTitle,
          roomTitle: a.roomTitle,
          serviceTitle: a.serviceTitle,
          wasViaPackage: Boolean(a.packageUsageRef) || usageByAppt.has(a.id),
          packageUsageSummary: usageByAppt.get(a.id) ?? null,
          prepaymentAmountMinor: prepayByAppt.get(a.id)?.amountMinor ?? null,
          prepaymentCurrency: prepayByAppt.get(a.id)?.currency ?? null,
          finalPaymentAmountMinor: finalPayByAppt.get(a.id)?.amountMinor ?? null,
          finalPaymentCurrency: finalPayByAppt.get(a.id)?.currency ?? null,
          staffComment: commentByAppt.get(a.id) ?? null,
        }),
      );
    },

    async getBookingProfile(organizationId, platformUserId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePatientBookingProfiles)
        .where(
          and(
            eq(bePatientBookingProfiles.organizationId, organizationId),
            eq(bePatientBookingProfiles.platformUserId, platformUserId),
          ),
        )
        .limit(1);
      return rows[0] ? mapProfile(rows[0]) : null;
    },

    async upsertBookingProfile(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const existing = await this.getBookingProfile(input.organizationId, input.platformUserId);
      if (existing) {
        const rows = await db
          .update(bePatientBookingProfiles)
          .set({
            isProblematic: input.isProblematic ?? existing.isProblematic,
            bookingBlocked: input.bookingBlocked ?? existing.bookingBlocked,
            problematicNote:
              input.problematicNote !== undefined ? input.problematicNote : existing.problematicNote,
            updatedAt: now,
            updatedBy: input.updatedBy,
          })
          .where(
            and(
              eq(bePatientBookingProfiles.organizationId, input.organizationId),
              eq(bePatientBookingProfiles.platformUserId, input.platformUserId),
            ),
          )
          .returning();
        return mapProfile(rows[0]!);
      }

      const rows = await db
        .insert(bePatientBookingProfiles)
        .values({
          organizationId: input.organizationId,
          platformUserId: input.platformUserId,
          isProblematic: input.isProblematic ?? false,
          bookingBlocked: input.bookingBlocked ?? false,
          problematicNote: input.problematicNote ?? null,
          updatedAt: now,
          updatedBy: input.updatedBy,
        })
        .returning();
      return mapProfile(rows[0]!);
    },

    async isBookingBlocked(organizationId, platformUserId) {
      const profile = await this.getBookingProfile(organizationId, platformUserId);
      return profile?.bookingBlocked ?? false;
    },

    async listAppointmentComments(organizationId, appointmentId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beAppointmentStaffComments)
        .where(
          and(
            eq(beAppointmentStaffComments.organizationId, organizationId),
            eq(beAppointmentStaffComments.appointmentId, appointmentId),
          ),
        )
        .orderBy(desc(beAppointmentStaffComments.createdAt));
      return rows.map(mapStaffComment);
    },

    async createAppointmentComment(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const rows = await db
        .insert(beAppointmentStaffComments)
        .values({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          platformUserId: input.platformUserId,
          authorId: input.authorId,
          body: input.body,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapStaffComment(rows[0]!);
    },
  };
}
