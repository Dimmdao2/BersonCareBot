import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  SaasBillingInvoice,
  SaasBillingRepositoryPort,
  SaasBillingSubscription,
} from "@/modules/saas-billing/ports";
import { beOrganizations } from "../../../db/schema/bookingEngine";
import {
  saasBillingAccounts,
  saasBillingInvoices,
  saasBillingProviderEvents,
  saasBillingSubscriptions,
} from "../../../db/schema/saasBilling";
import { saasTariffs } from "../../../db/schema/saasEntitlements";

type Db = ReturnType<typeof getDrizzle>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

function toSaasBillingSubscription(
  row: typeof saasBillingSubscriptions.$inferSelect,
): SaasBillingSubscription {
  return row;
}

function toSaasBillingInvoice(
  row: typeof saasBillingInvoices.$inferSelect,
): SaasBillingInvoice {
  return {
    ...row,
    tariffBillingPeriod: row.tariffBillingPeriod as SaasBillingInvoice["tariffBillingPeriod"],
  };
}

async function requireOrganization(tx: Transaction, organizationId: string): Promise<void> {
  const [row] = await tx
    .select({ id: beOrganizations.id })
    .from(beOrganizations)
    .where(eq(beOrganizations.id, organizationId))
    .limit(1);
  if (!row) throw new Error("organization_not_found");
}

async function upsertSaasBillingAccount(
  tx: Transaction,
  organizationId: string,
): Promise<typeof saasBillingAccounts.$inferSelect> {
  const [row] = await tx
    .insert(saasBillingAccounts)
    .values({ organizationId })
    .onConflictDoUpdate({
      target: saasBillingAccounts.organizationId,
      set: { updatedAt: new Date().toISOString() },
    })
    .returning();
  if (!row) throw new Error("saas_billing_account_upsert_failed");
  return row;
}

export function createPgSaasBillingRepository(): SaasBillingRepositoryPort {
  return {
    async upsertManualSaasBillingSubscription({ organizationId, tariffId }) {
      return getDrizzle().transaction(async (tx) => {
        await requireOrganization(tx, organizationId);
        if (tariffId === null) {
          await tx
            .update(saasBillingSubscriptions)
            .set({
              status: "cancelled",
              cancelledAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(saasBillingSubscriptions.organizationId, organizationId),
                eq(saasBillingSubscriptions.source, "manual"),
              ),
            );
          await tx
            .update(beOrganizations)
            .set({ tariffId: null, commercialAccessState: "no_trial" })
            .where(eq(beOrganizations.id, organizationId));
          return null;
        }

        const [tariff] = await tx
          .select({ id: saasTariffs.id })
          .from(saasTariffs)
          .where(and(eq(saasTariffs.id, tariffId), eq(saasTariffs.isActive, true)))
          .limit(1);
        if (!tariff) throw new Error("active_tariff_not_found");

        const account = await upsertSaasBillingAccount(tx, organizationId);
        const [row] = await tx
          .insert(saasBillingSubscriptions)
          .values({
            organizationId,
            saasBillingAccountId: account.id,
            tariffId,
            source: "manual",
            status: "active",
            lifecycleState: "active",
          })
          .onConflictDoUpdate({
            target: [
              saasBillingSubscriptions.organizationId,
              saasBillingSubscriptions.source,
            ],
            set: {
              tariffId,
              status: "active",
              lifecycleState: "active",
              cancelledAt: null,
              updatedAt: new Date().toISOString(),
            },
          })
          .returning();
        if (!row) throw new Error("saas_billing_manual_assignment_failed");

        await tx
          .update(beOrganizations)
          .set({ tariffId, commercialAccessState: "active" })
          .where(eq(beOrganizations.id, organizationId));
        return toSaasBillingSubscription(row);
      });
    },

    async createSaasBillingInvoice(input) {
      return getDrizzle().transaction(async (tx) => {
        const [authority] = await tx
          .select({
            organizationId: saasBillingSubscriptions.organizationId,
            saasBillingAccountId: saasBillingSubscriptions.saasBillingAccountId,
            tariffId: saasTariffs.id,
            tariffName: saasTariffs.name,
            amountMinor: saasTariffs.priceMinor,
            currency: saasTariffs.currency,
            tariffBillingPeriod: saasTariffs.billingPeriod,
          })
          .from(saasBillingSubscriptions)
          .innerJoin(
            saasTariffs,
            eq(saasTariffs.id, saasBillingSubscriptions.tariffId),
          )
          .where(
            and(
              eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
              eq(saasBillingSubscriptions.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!authority) throw new Error("saas_billing_subscription_not_found");
        if (authority.amountMinor === null || authority.currency === null) {
          throw new Error("saas_billing_tariff_not_billable");
        }

        const [row] = await tx
          .insert(saasBillingInvoices)
          .values({
            organizationId: authority.organizationId,
            saasBillingAccountId: authority.saasBillingAccountId,
            saasBillingSubscriptionId: input.saasBillingSubscriptionId,
            tariffId: authority.tariffId,
            tariffName: authority.tariffName,
            amountMinor: authority.amountMinor,
            currency: authority.currency,
            tariffBillingPeriod: authority.tariffBillingPeriod,
            servicePeriodStartsAt: input.servicePeriodStartsAt,
            servicePeriodEndsAt: input.servicePeriodEndsAt,
            status: "draft",
            providerId: input.providerId,
            providerIdempotencyKey: input.providerIdempotencyKey,
          })
          .returning();
        if (!row) throw new Error("saas_billing_invoice_create_failed");
        return toSaasBillingInvoice(row);
      });
    },

    async attachSaasBillingInvoiceProviderIntent(input) {
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({
          providerInvoiceRef: input.providerInvoiceRef,
          providerCheckoutUrl: input.providerCheckoutUrl,
          status: "pending",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(saasBillingInvoices.id, input.saasBillingInvoiceId))
        .returning();
      if (!row) throw new Error("saas_billing_invoice_not_found");
      return toSaasBillingInvoice(row);
    },

    async recordSaasBillingProviderEvent(input) {
      const [row] = await getDrizzle()
        .insert(saasBillingProviderEvents)
        .values(input)
        .onConflictDoNothing({
          target: [
            saasBillingProviderEvents.providerId,
            saasBillingProviderEvents.providerEventId,
          ],
        })
        .returning({ id: saasBillingProviderEvents.id });
      return { created: Boolean(row) };
    },
  };
}
