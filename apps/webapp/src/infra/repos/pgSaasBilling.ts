import { and, desc, eq } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type {
  SaasBillingInvoice,
  SaasBillingInvoiceReadRow,
  SaasBillingRepositoryPort,
  SaasBillingSubscriptionReadRow,
} from '@/modules/saas-billing/ports';
import type { SaasBillingPeriod } from '@/modules/saas-billing/paidPeriod';
import { sanitizeSaasBillingProviderEventEnvelope } from '@/modules/saas-billing/providerEventEnvelope';
import { beOrganizations } from '../../../db/schema/bookingEngine';
import {
  saasBillingAccounts,
  saasBillingInvoices,
  saasBillingProviderEvents,
  saasBillingSubscriptions,
} from '../../../db/schema/saasBilling';
import { saasOrganizationTrials, saasTariffs } from '../../../db/schema/saasEntitlements';
import { adminAuditLog } from '../../../db/schema/schema';

type Db = ReturnType<typeof getDrizzle>;
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

function toSaasBillingInvoice(row: typeof saasBillingInvoices.$inferSelect): SaasBillingInvoice {
  return {
    ...row,
    tariffBillingPeriod: row.tariffBillingPeriod as SaasBillingInvoice['tariffBillingPeriod'],
  };
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
  if (!row) throw new Error('saas_billing_account_upsert_failed');
  return row;
}

export function createPgSaasBillingRepository(): SaasBillingRepositoryPort {
  return {
    async getOrganizationBillingOverview(organizationId) {
      const db = getDrizzle();
      const [subscriptionRows, invoiceRows, providerEvents] = await Promise.all([
        db
          .select()
          .from(saasBillingSubscriptions)
          .where(eq(saasBillingSubscriptions.organizationId, organizationId))
          .orderBy(desc(saasBillingSubscriptions.updatedAt)),
        db
          .select()
          .from(saasBillingInvoices)
          .where(eq(saasBillingInvoices.organizationId, organizationId))
          .orderBy(desc(saasBillingInvoices.createdAt)),
        db
          .select({
            id: saasBillingProviderEvents.id,
            organizationId: saasBillingProviderEvents.organizationId,
            saasBillingInvoiceId: saasBillingProviderEvents.saasBillingInvoiceId,
            providerId: saasBillingProviderEvents.providerId,
            providerEventId: saasBillingProviderEvents.providerEventId,
            eventType: saasBillingProviderEvents.eventType,
            processedAt: saasBillingProviderEvents.processedAt,
            createdAt: saasBillingProviderEvents.createdAt,
          })
          .from(saasBillingProviderEvents)
          .where(eq(saasBillingProviderEvents.organizationId, organizationId))
          .orderBy(desc(saasBillingProviderEvents.createdAt)),
      ]);

      return {
        organizationId,
        subscriptions: subscriptionRows as SaasBillingSubscriptionReadRow[],
        invoices: invoiceRows.map(
          (row): SaasBillingInvoiceReadRow => ({
            ...toSaasBillingInvoice(row),
            paidAt: row.paidAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }),
        ),
        providerEvents,
      };
    },

    async runManualAssignmentTransaction(work) {
      return getDrizzle().transaction(async (tx) => {
        return work({
          async loadManualAssignmentState(organizationId) {
            const [organization] = await tx
              .select({
                tariffId: beOrganizations.tariffId,
                commercialAccessState: beOrganizations.commercialAccessState,
              })
              .from(beOrganizations)
              .where(eq(beOrganizations.id, organizationId))
              .limit(1);
            if (!organization) throw new Error('organization_not_found');
            const [activeTrial] = await tx
              .select()
              .from(saasOrganizationTrials)
              .where(
                and(
                  eq(saasOrganizationTrials.organizationId, organizationId),
                  eq(saasOrganizationTrials.status, 'active'),
                ),
              )
              .limit(1);
            const [manualSaasBillingSubscription] = await tx
              .select({
                id: saasBillingSubscriptions.id,
                tariffId: saasBillingSubscriptions.tariffId,
                status: saasBillingSubscriptions.status,
              })
              .from(saasBillingSubscriptions)
              .where(
                and(
                  eq(saasBillingSubscriptions.organizationId, organizationId),
                  eq(saasBillingSubscriptions.source, 'manual'),
                ),
              )
              .limit(1);
            return {
              organization,
              activeTrial: activeTrial ?? null,
              manualSaasBillingSubscription: manualSaasBillingSubscription ?? null,
            };
          },
          async requireActiveTariff(tariffId) {
            const [tariff] = await tx
              .select({ id: saasTariffs.id, billingPeriod: saasTariffs.billingPeriod })
              .from(saasTariffs)
              .where(and(eq(saasTariffs.id, tariffId), eq(saasTariffs.isActive, true)))
              .limit(1);
            if (!tariff) throw new Error('active_tariff_not_found');
            return { billingPeriod: tariff.billingPeriod as SaasBillingPeriod };
          },
          async setManualSaasBillingSubscription({ organizationId, tariffId, period }) {
            if (tariffId === null) {
              await tx
                .update(saasBillingSubscriptions)
                .set({
                  status: 'cancelled',
                  cancelledAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  // Unassigning ends the paid period; leaving it behind would keep feeding the
                  // ladder an anchor for a tariff the organization no longer has.
                  currentPeriodStartsAt: null,
                  currentPeriodEndsAt: null,
                })
                .where(
                  and(
                    eq(saasBillingSubscriptions.organizationId, organizationId),
                    eq(saasBillingSubscriptions.source, 'manual'),
                  ),
                );
              return;
            }
            const account = await upsertSaasBillingAccount(tx, organizationId);
            const [row] = await tx
              .insert(saasBillingSubscriptions)
              .values({
                organizationId,
                saasBillingAccountId: account.id,
                tariffId,
                source: 'manual',
                status: 'active',
                lifecycleState: 'active',
                currentPeriodStartsAt: period?.startsAt ?? null,
                currentPeriodEndsAt: period?.endsAt ?? null,
              })
              .onConflictDoUpdate({
                target: [saasBillingSubscriptions.organizationId, saasBillingSubscriptions.source],
                set: {
                  tariffId,
                  status: 'active',
                  lifecycleState: 'active',
                  cancelledAt: null,
                  updatedAt: new Date().toISOString(),
                  currentPeriodStartsAt: period?.startsAt ?? null,
                  currentPeriodEndsAt: period?.endsAt ?? null,
                },
              })
              .returning({ id: saasBillingSubscriptions.id });
            if (!row) throw new Error('saas_billing_manual_assignment_failed');
          },
          async updateCompatibilityProjection({ organizationId, tariffId }) {
            const [organization] = await tx
              .update(beOrganizations)
              .set({
                tariffId,
                commercialAccessState: tariffId ? 'active' : 'no_trial',
              })
              .where(eq(beOrganizations.id, organizationId))
              .returning({
                tariffId: beOrganizations.tariffId,
                commercialAccessState: beOrganizations.commercialAccessState,
              });
            if (!organization) throw new Error('organization_not_found');
            return organization;
          },
          async endActiveTrial(trialId) {
            const [trial] = await tx
              .update(saasOrganizationTrials)
              .set({ status: 'ended', updatedAt: new Date().toISOString() })
              .where(
                and(
                  eq(saasOrganizationTrials.id, trialId),
                  eq(saasOrganizationTrials.status, 'active'),
                ),
              )
              .returning();
            if (!trial) throw new Error('trial_conversion_conflict');
            return trial;
          },
          async appendManualAssignmentAudit(input) {
            await tx.insert(adminAuditLog).values({
              organizationId: input.organizationId,
              actorId: input.actorId,
              action: input.action,
              targetId: input.targetId,
              details: {
                reason: input.reason,
                before: input.before,
                after: input.after,
              },
              status: 'ok',
            });
          },
        });
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
          .innerJoin(saasTariffs, eq(saasTariffs.id, saasBillingSubscriptions.tariffId))
          .where(
            and(
              eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
              eq(saasBillingSubscriptions.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!authority) throw new Error('saas_billing_subscription_not_found');
        if (authority.amountMinor === null || authority.currency === null) {
          throw new Error('saas_billing_tariff_not_billable');
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
            status: 'draft',
            providerId: input.providerId,
            providerIdempotencyKey: input.providerIdempotencyKey,
          })
          .returning();
        if (!row) throw new Error('saas_billing_invoice_create_failed');
        return toSaasBillingInvoice(row);
      });
    },

    async attachSaasBillingInvoiceProviderIntent(input) {
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({
          providerInvoiceRef: input.providerInvoiceRef,
          providerCheckoutUrl: input.providerCheckoutUrl,
          status: 'pending',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(saasBillingInvoices.id, input.saasBillingInvoiceId))
        .returning();
      if (!row) throw new Error('saas_billing_invoice_not_found');
      return toSaasBillingInvoice(row);
    },

    async recordSaasBillingProviderEvent(input) {
      const event = sanitizeSaasBillingProviderEventEnvelope(input.event);
      const [row] = await getDrizzle()
        .insert(saasBillingProviderEvents)
        .values({
          organizationId: input.organizationId,
          saasBillingInvoiceId: input.saasBillingInvoiceId,
          providerId: event.providerId,
          providerEventId: event.providerEventId,
          eventType: event.type,
          rawPayload: event,
        })
        .onConflictDoNothing({
          target: [saasBillingProviderEvents.providerId, saasBillingProviderEvents.providerEventId],
        })
        .returning({ id: saasBillingProviderEvents.id });
      return { created: Boolean(row) };
    },

    async findSaasBillingInvoiceByProviderRef({ providerId, providerInvoiceRef }) {
      const [row] = await getDrizzle()
        .select()
        .from(saasBillingInvoices)
        .where(
          and(
            eq(saasBillingInvoices.providerId, providerId),
            eq(saasBillingInvoices.providerInvoiceRef, providerInvoiceRef),
          ),
        )
        .limit(1);
      return row ? toSaasBillingInvoice(row) : null;
    },

    async markSaasBillingInvoicePaid({ saasBillingInvoiceId, organizationId, paidAt }) {
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({ status: 'paid', paidAt, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(saasBillingInvoices.id, saasBillingInvoiceId),
            eq(saasBillingInvoices.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new Error('saas_billing_invoice_not_found');
      return toSaasBillingInvoice(row);
    },

    async requireOwnTariffBillingSubscription(organizationId) {
      return getDrizzle().transaction(async (tx) => {
        const [organization] = await tx
          .select({ tariffId: beOrganizations.tariffId })
          .from(beOrganizations)
          .where(eq(beOrganizations.id, organizationId))
          .limit(1);
        if (!organization) throw new Error('organization_not_found');
        if (!organization.tariffId) throw new Error('saas_billing_no_tariff_assigned');

        const [tariff] = await tx
          .select({ id: saasTariffs.id, billingPeriod: saasTariffs.billingPeriod })
          .from(saasTariffs)
          .where(and(eq(saasTariffs.id, organization.tariffId), eq(saasTariffs.isActive, true)))
          .limit(1);
        if (!tariff) throw new Error('saas_billing_tariff_not_billable');

        const account = await upsertSaasBillingAccount(tx, organizationId);
        const [row] = await tx
          .insert(saasBillingSubscriptions)
          .values({
            organizationId,
            saasBillingAccountId: account.id,
            tariffId: tariff.id,
            source: 'paid_subscription',
            status: 'pending_payment',
            lifecycleState: 'active',
          })
          .onConflictDoUpdate({
            target: [saasBillingSubscriptions.organizationId, saasBillingSubscriptions.source],
            set: { tariffId: tariff.id, updatedAt: new Date().toISOString() },
          })
          .returning({ id: saasBillingSubscriptions.id });
        if (!row) throw new Error('saas_billing_subscription_upsert_failed');

        return {
          saasBillingSubscriptionId: row.id,
          tariffId: tariff.id,
          billingPeriod: tariff.billingPeriod as SaasBillingPeriod,
        };
      });
    },

    async activateSaasBillingSubscriptionPeriod(input) {
      const [row] = await getDrizzle()
        .update(saasBillingSubscriptions)
        .set({
          status: 'active',
          lifecycleState: 'active',
          cancelledAt: null,
          currentPeriodStartsAt: input.periodStartsAt,
          currentPeriodEndsAt: input.periodEndsAt,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
            eq(saasBillingSubscriptions.organizationId, input.organizationId),
          ),
        )
        .returning({ id: saasBillingSubscriptions.id });
      if (!row) throw new Error('saas_billing_subscription_not_found');
    },
  };
}
