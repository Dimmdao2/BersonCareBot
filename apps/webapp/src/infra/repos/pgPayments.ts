import { and, desc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  bePaymentHistoryEvents,
  bePaymentIntents,
  bePaymentProviderEvents,
  bePayments,
  bePrepaymentPolicies,
  beRefunds,
} from "../../../db/schema/bookingPayments";
import { beAppointments } from "../../../db/schema/bookingEngine";
import type { PaymentsPort, UpsertPrepaymentPolicyInput } from "@/modules/payments/ports";
import type {
  PaymentHistoryEventRecord,
  PaymentIntentRecord,
  PaymentRecord,
  PrepaymentPolicyRecord,
} from "@/modules/payments/types";

function mapPolicy(row: typeof bePrepaymentPolicies.$inferSelect): PrepaymentPolicyRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    serviceId: row.serviceId,
    onlineCategory: row.onlineCategory,
    mode: row.mode as PrepaymentPolicyRecord["mode"],
    amountMinor: row.amountMinor,
    percentBps: row.percentBps,
    currency: row.currency,
    isActive: row.isActive,
  };
}

function mapIntent(row: typeof bePaymentIntents.$inferSelect): PaymentIntentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    idempotencyKey: row.idempotencyKey,
    providerId: row.providerId,
    appointmentId: row.appointmentId,
    platformUserId: row.platformUserId,
    productRef: row.productRef,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    purpose: row.purpose,
    providerIntentRef: row.providerIntentRef,
  };
}

function mapPayment(row: typeof bePayments.$inferSelect): PaymentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentIntentId: row.paymentIntentId,
    appointmentId: row.appointmentId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status,
    providerId: row.providerId,
    purpose: row.purpose,
  };
}

function mapHistory(row: typeof bePaymentHistoryEvents.$inferSelect): PaymentHistoryEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appointmentId: row.appointmentId,
    platformUserId: row.platformUserId,
    paymentId: row.paymentId,
    refundId: row.refundId,
    eventType: row.eventType,
    amountMinor: row.amountMinor,
    currency: row.currency,
    providerId: row.providerId,
    status: row.status,
    purpose: row.purpose,
    comment: row.comment,
    occurredAt: row.occurredAt,
  };
}

export function createPgPaymentsPort(): PaymentsPort {
  return {
    async getPrepaymentPolicyForService(organizationId, serviceId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePrepaymentPolicies)
        .where(
          and(
            eq(bePrepaymentPolicies.organizationId, organizationId),
            eq(bePrepaymentPolicies.serviceId, serviceId),
          ),
        )
        .limit(1);
      return rows[0] ? mapPolicy(rows[0]) : null;
    },

    async getPrepaymentPolicyForOnlineCategory(organizationId, onlineCategory) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePrepaymentPolicies)
        .where(
          and(
            eq(bePrepaymentPolicies.organizationId, organizationId),
            eq(bePrepaymentPolicies.onlineCategory, onlineCategory),
          ),
        )
        .limit(1);
      return rows[0] ? mapPolicy(rows[0]) : null;
    },

    async listPrepaymentPolicies(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePrepaymentPolicies)
        .where(eq(bePrepaymentPolicies.organizationId, organizationId));
      return rows.map(mapPolicy);
    },

    async upsertPrepaymentPolicy(input: UpsertPrepaymentPolicyInput) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const serviceId = input.serviceId?.trim() || null;
      const onlineCategory = input.onlineCategory?.trim() || null;
      if (!serviceId && !onlineCategory) throw new Error("policy_scope_required");

      const existing = serviceId
        ? await this.getPrepaymentPolicyForService(input.organizationId, serviceId)
        : await this.getPrepaymentPolicyForOnlineCategory(input.organizationId, onlineCategory!);

      if (existing) {
        await db
          .update(bePrepaymentPolicies)
          .set({
            mode: input.mode,
            amountMinor: input.amountMinor ?? null,
            percentBps: input.percentBps ?? null,
            currency: input.currency ?? "RUB",
            isActive: input.isActive ?? true,
            updatedAt: now,
          })
          .where(eq(bePrepaymentPolicies.id, existing.id));
      } else {
        await db.insert(bePrepaymentPolicies).values({
          organizationId: input.organizationId,
          serviceId,
          onlineCategory,
          mode: input.mode,
          amountMinor: input.amountMinor ?? null,
          percentBps: input.percentBps ?? null,
          currency: input.currency ?? "RUB",
          isActive: input.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        });
      }

      const row = serviceId
        ? await this.getPrepaymentPolicyForService(input.organizationId, serviceId)
        : await this.getPrepaymentPolicyForOnlineCategory(input.organizationId, onlineCategory!);
      if (!row) throw new Error("policy_upsert_failed");
      return row;
    },

    async findIntentByIdempotency(organizationId, idempotencyKey) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePaymentIntents)
        .where(
          and(
            eq(bePaymentIntents.organizationId, organizationId),
            eq(bePaymentIntents.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return rows[0] ? mapIntent(rows[0]) : null;
    },

    async findIntentById(id) {
      const db = getDrizzle();
      const rows = await db.select().from(bePaymentIntents).where(eq(bePaymentIntents.id, id)).limit(1);
      return rows[0] ? mapIntent(rows[0]) : null;
    },

    async findIntentByProviderRef(organizationId, providerIntentRef) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePaymentIntents)
        .where(
          and(
            eq(bePaymentIntents.organizationId, organizationId),
            eq(bePaymentIntents.providerIntentRef, providerIntentRef),
          ),
        )
        .limit(1);
      return rows[0] ? mapIntent(rows[0]) : null;
    },

    async findLatestIntentByAppointment(appointmentId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePaymentIntents)
        .where(eq(bePaymentIntents.appointmentId, appointmentId))
        .orderBy(desc(bePaymentIntents.createdAt))
        .limit(1);
      return rows[0] ? mapIntent(rows[0]) : null;
    },

    async createPaymentIntent(input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const inserted = await db
        .insert(bePaymentIntents)
        .values({
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
          providerId: input.providerId,
          appointmentId: input.appointmentId ?? null,
          platformUserId: input.platformUserId,
          productRef: input.productRef ?? null,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "pending",
          purpose: input.purpose ?? "appointment_prepayment",
          providerIntentRef: input.providerIntentRef,
          metadataJson: input.metadataJson ?? {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return mapIntent(inserted[0]!);
    },

    async updateIntentStatus(intentId, status) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const rows = await db
        .update(bePaymentIntents)
        .set({ status, updatedAt: now })
        .where(eq(bePaymentIntents.id, intentId))
        .returning();
      return rows[0] ? mapIntent(rows[0]) : null;
    },

    async findPaymentByIntent(intentId) {
      const db = getDrizzle();
      const rows = await db.select().from(bePayments).where(eq(bePayments.paymentIntentId, intentId)).limit(1);
      return rows[0] ? mapPayment(rows[0]) : null;
    },

    async findPaymentByAppointment(appointmentId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePayments)
        .where(eq(bePayments.appointmentId, appointmentId))
        .limit(1);
      return rows[0] ? mapPayment(rows[0]) : null;
    },

    async createPaymentFromIntent(intent) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      const inserted = await db
        .insert(bePayments)
        .values({
          organizationId: intent.organizationId,
          paymentIntentId: intent.id,
          appointmentId: intent.appointmentId,
          platformUserId: intent.platformUserId,
          providerId: intent.providerId,
          amountMinor: intent.amountMinor,
          currency: intent.currency,
          status: "captured",
          purpose: intent.purpose,
          capturedAt: now,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return mapPayment(inserted[0]);
      const existing = await this.findPaymentByIntent(intent.id);
      if (!existing) throw new Error("payment_create_failed");
      return existing;
    },

    async updatePaymentStatus(paymentId, status) {
      const db = getDrizzle();
      await db.update(bePayments).set({ status }).where(eq(bePayments.id, paymentId));
    },

    async createRefund(input) {
      const db = getDrizzle();
      const inserted = await db
        .insert(beRefunds)
        .values({
          organizationId: input.organizationId,
          paymentId: input.paymentId,
          appointmentId: input.appointmentId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: input.status,
          reason: input.reason ?? null,
          providerRefundRef: input.providerRefundRef ?? null,
        })
        .returning({ id: beRefunds.id });
      return { id: inserted[0]!.id };
    },

    async recordProviderEvent(input) {
      const db = getDrizzle();
      try {
        const inserted = await db
          .insert(bePaymentProviderEvents)
          .values({
            organizationId: input.organizationId,
            providerId: input.providerId,
            idempotencyKey: input.idempotencyKey,
            eventType: input.eventType,
            payloadJson: input.payloadJson,
          })
          .returning({ id: bePaymentProviderEvents.id });
        return { inserted: true, id: inserted[0]!.id };
      } catch {
        const rows = await db
          .select({ id: bePaymentProviderEvents.id })
          .from(bePaymentProviderEvents)
          .where(
            and(
              eq(bePaymentProviderEvents.organizationId, input.organizationId),
              eq(bePaymentProviderEvents.providerId, input.providerId),
              eq(bePaymentProviderEvents.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        return { inserted: false, id: rows[0]?.id ?? "" };
      }
    },

    async markProviderEventProcessed(id) {
      const db = getDrizzle();
      await db
        .update(bePaymentProviderEvents)
        .set({ processedAt: new Date().toISOString() })
        .where(eq(bePaymentProviderEvents.id, id));
    },

    async appendHistoryEvent(input) {
      const db = getDrizzle();
      await db.insert(bePaymentHistoryEvents).values({
        organizationId: input.organizationId,
        appointmentId: input.appointmentId ?? null,
        platformUserId: input.platformUserId ?? null,
        paymentId: input.paymentId ?? null,
        refundId: input.refundId ?? null,
        eventType: input.eventType,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency ?? null,
        providerId: input.providerId ?? null,
        status: input.status ?? null,
        purpose: input.purpose ?? null,
        comment: input.comment ?? null,
        payloadJson: input.payloadJson ?? {},
      });
    },

    async listHistoryForAppointment(appointmentId, organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePaymentHistoryEvents)
        .where(
          and(
            eq(bePaymentHistoryEvents.appointmentId, appointmentId),
            eq(bePaymentHistoryEvents.organizationId, organizationId),
          ),
        )
        .orderBy(desc(bePaymentHistoryEvents.occurredAt));
      return rows.map(mapHistory);
    },

    async listHistoryForUser(platformUserId, organizationId, limit = 50) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(bePaymentHistoryEvents)
        .where(
          and(
            eq(bePaymentHistoryEvents.platformUserId, platformUserId),
            eq(bePaymentHistoryEvents.organizationId, organizationId),
          ),
        )
        .orderBy(desc(bePaymentHistoryEvents.occurredAt))
        .limit(limit);
      return rows.map(mapHistory);
    },

    async setAppointmentPaymentRef(appointmentId, paymentId) {
      const db = getDrizzle();
      await db
        .update(beAppointments)
        .set({ paymentRef: paymentId, updatedAt: new Date().toISOString() })
        .where(eq(beAppointments.id, appointmentId));
    },
  };
}
