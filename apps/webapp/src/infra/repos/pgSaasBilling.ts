import { and, desc, eq, gte, ilike, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type {
  SaasBillingInvoice,
  SaasBillingInvoiceReadRow,
  SaasBillingPlatformBreakdownRow,
  SaasBillingPlatformInvoiceRow,
  SaasBillingPlatformSummary,
  SaasBillingPlatformSummaryFilter,
  SaasBillingRefund,
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
  saasBillingRefunds,
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

function toSaasBillingRefund(row: typeof saasBillingRefunds.$inferSelect): SaasBillingRefund {
  return { ...row, status: row.status as SaasBillingRefund['status'] };
}

/** Refunds that count against an invoice's remaining refundable amount — a `failed` attempt does not. */
const OPEN_REFUND_STATUSES = ['pending', 'succeeded'] as const;

/** Shared by К3 summary/breakdown queries — period + payer, no status (see `SaasBillingPlatformSummaryFilter`). */
function platformSummaryFilterConds(filter: SaasBillingPlatformSummaryFilter) {
  const conds = [];
  if (filter.periodFrom) conds.push(gte(saasBillingInvoices.createdAt, filter.periodFrom));
  if (filter.periodTo) conds.push(lte(saasBillingInvoices.createdAt, filter.periodTo));
  const payerSearch = filter.payerSearch?.trim();
  if (payerSearch) conds.push(ilike(beOrganizations.title, `%${payerSearch}%`));
  return conds;
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

    async listPlatformInvoices(filter): Promise<SaasBillingPlatformInvoiceRow[]> {
      const db = getDrizzle();
      const conds = [];
      if (filter.periodFrom) conds.push(gte(saasBillingInvoices.createdAt, filter.periodFrom));
      if (filter.periodTo) conds.push(lte(saasBillingInvoices.createdAt, filter.periodTo));
      if (filter.status) conds.push(eq(saasBillingInvoices.status, filter.status));
      const payerSearch = filter.payerSearch?.trim();
      if (payerSearch) conds.push(ilike(beOrganizations.title, `%${payerSearch}%`));

      const rows = await db
        .select({
          invoice: saasBillingInvoices,
          organizationTitle: beOrganizations.title,
        })
        .from(saasBillingInvoices)
        .innerJoin(beOrganizations, eq(beOrganizations.id, saasBillingInvoices.organizationId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(saasBillingInvoices.createdAt));

      const invoiceIds = rows.map(({ invoice }) => invoice.id);
      const refundSums = invoiceIds.length
        ? await db
            .select({
              saasBillingInvoiceId: saasBillingRefunds.saasBillingInvoiceId,
              status: saasBillingRefunds.status,
              totalMinor: sql<string>`sum(${saasBillingRefunds.amountMinor})`,
            })
            .from(saasBillingRefunds)
            .where(
              and(
                inArray(saasBillingRefunds.saasBillingInvoiceId, invoiceIds),
                inArray(saasBillingRefunds.status, OPEN_REFUND_STATUSES),
              ),
            )
            .groupBy(saasBillingRefunds.saasBillingInvoiceId, saasBillingRefunds.status)
        : [];
      const refundedByInvoice = new Map<string, number>();
      const pendingByInvoice = new Map<string, number>();
      for (const sum of refundSums) {
        const totalMinor = Number(sum.totalMinor);
        if (sum.status === 'succeeded') refundedByInvoice.set(sum.saasBillingInvoiceId, totalMinor);
        else if (sum.status === 'pending')
          pendingByInvoice.set(sum.saasBillingInvoiceId, totalMinor);
      }

      return rows.map(
        ({ invoice, organizationTitle }): SaasBillingPlatformInvoiceRow => ({
          ...toSaasBillingInvoice(invoice),
          paidAt: invoice.paidAt,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
          organizationId: invoice.organizationId,
          organizationTitle,
          refundedMinor: refundedByInvoice.get(invoice.id) ?? 0,
          pendingRefundMinor: pendingByInvoice.get(invoice.id) ?? 0,
        }),
      );
    },

    async getPlatformPaymentsSummary(filter): Promise<SaasBillingPlatformSummary> {
      const db = getDrizzle();
      const conds = platformSummaryFilterConds(filter);

      const statusRows = await db
        .select({
          currency: saasBillingInvoices.currency,
          status: saasBillingInvoices.status,
          count: sql<string>`count(*)`,
          totalMinor: sql<string>`coalesce(sum(${saasBillingInvoices.amountMinor}), 0)`,
        })
        .from(saasBillingInvoices)
        .innerJoin(beOrganizations, eq(beOrganizations.id, saasBillingInvoices.organizationId))
        .where(conds.length ? and(...conds) : undefined)
        .groupBy(saasBillingInvoices.currency, saasBillingInvoices.status);

      const refundRows = await db
        .select({
          currency: saasBillingRefunds.currency,
          count: sql<string>`count(*)`,
          totalMinor: sql<string>`coalesce(sum(${saasBillingRefunds.amountMinor}), 0)`,
        })
        .from(saasBillingRefunds)
        .innerJoin(
          saasBillingInvoices,
          eq(saasBillingInvoices.id, saasBillingRefunds.saasBillingInvoiceId),
        )
        .innerJoin(beOrganizations, eq(beOrganizations.id, saasBillingInvoices.organizationId))
        .where(and(eq(saasBillingRefunds.status, 'succeeded'), ...conds))
        .groupBy(saasBillingRefunds.currency);

      const currencies = new Set<string>();
      for (const row of statusRows) currencies.add(row.currency);
      for (const row of refundRows) currencies.add(row.currency);

      const zeroBucket = () => ({ count: 0, amountMinor: 0 });

      return {
        byCurrency: [...currencies].map((currency) => {
          const received = zeroBucket();
          const inProcess = zeroBucket();
          const unpaid = zeroBucket();
          for (const row of statusRows) {
            if (row.currency !== currency) continue;
            const count = Number(row.count);
            const amountMinor = Number(row.totalMinor);
            if (row.status === 'paid') {
              received.count += count;
              received.amountMinor += amountMinor;
            } else if (row.status === 'draft' || row.status === 'pending') {
              inProcess.count += count;
              inProcess.amountMinor += amountMinor;
            } else if (row.status === 'failed' || row.status === 'void') {
              unpaid.count += count;
              unpaid.amountMinor += amountMinor;
            }
          }
          const refundRow = refundRows.find((row) => row.currency === currency);
          const refunded = refundRow
            ? { count: Number(refundRow.count), amountMinor: Number(refundRow.totalMinor) }
            : zeroBucket();
          return { currency, received, refunded, inProcess, unpaid };
        }),
      };
    },

    async getPlatformPaymentsBreakdown(filter): Promise<SaasBillingPlatformBreakdownRow[]> {
      const db = getDrizzle();
      const conds = platformSummaryFilterConds(filter);

      const rows = await db
        .select({
          tariffId: saasBillingInvoices.tariffId,
          tariffName: saasBillingInvoices.tariffName,
          tariffBillingPeriod: saasBillingInvoices.tariffBillingPeriod,
          currency: saasBillingInvoices.currency,
          count: sql<string>`count(*)`,
          totalMinor: sql<string>`coalesce(sum(${saasBillingInvoices.amountMinor}), 0)`,
        })
        .from(saasBillingInvoices)
        .innerJoin(beOrganizations, eq(beOrganizations.id, saasBillingInvoices.organizationId))
        .where(and(eq(saasBillingInvoices.status, 'paid'), ...conds))
        .groupBy(
          saasBillingInvoices.tariffId,
          saasBillingInvoices.tariffName,
          saasBillingInvoices.tariffBillingPeriod,
          saasBillingInvoices.currency,
        )
        .orderBy(desc(sql`sum(${saasBillingInvoices.amountMinor})`));

      return rows.map((row) => ({
        tariffId: row.tariffId,
        tariffName: row.tariffName,
        tariffBillingPeriod:
          row.tariffBillingPeriod as SaasBillingPlatformBreakdownRow['tariffBillingPeriod'],
        currency: row.currency,
        count: Number(row.count),
        amountMinor: Number(row.totalMinor),
      }));
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
      // К4 — CAS on status: only a `draft`/`pending` invoice can transition to `paid`. Excludes an
      // already-`paid` row (replay under a different event id) and a `void` one (cancelled by a
      // platform admin) — a late webhook must never resurrect a cancelled invoice.
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({ status: 'paid', paidAt, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(saasBillingInvoices.id, saasBillingInvoiceId),
            eq(saasBillingInvoices.organizationId, organizationId),
            inArray(saasBillingInvoices.status, ['draft', 'pending']),
          ),
        )
        .returning();
      return row ? toSaasBillingInvoice(row) : null;
    },

    /** К4 — same join as `createSaasBillingInvoice`; amount/description/expiry are admin input, not derived. */
    async createManualSaasBillingInvoice(input) {
      const [authority] = await getDrizzle()
        .select({
          organizationId: saasBillingSubscriptions.organizationId,
          saasBillingAccountId: saasBillingSubscriptions.saasBillingAccountId,
          tariffId: saasTariffs.id,
          tariffName: saasTariffs.name,
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

      const [row] = await getDrizzle()
        .insert(saasBillingInvoices)
        .values({
          organizationId: authority.organizationId,
          saasBillingAccountId: authority.saasBillingAccountId,
          saasBillingSubscriptionId: input.saasBillingSubscriptionId,
          tariffId: authority.tariffId,
          tariffName: authority.tariffName,
          description: input.description,
          amountMinor: input.amountMinor,
          currency: input.currency,
          tariffBillingPeriod: authority.tariffBillingPeriod,
          servicePeriodStartsAt: input.servicePeriodStartsAt,
          servicePeriodEndsAt: input.servicePeriodEndsAt,
          expiresAt: input.expiresAt,
          status: 'draft',
          providerId: input.providerId,
          providerIdempotencyKey: input.providerIdempotencyKey,
        })
        .returning();
      if (!row) throw new Error('saas_billing_invoice_create_failed');
      return toSaasBillingInvoice(row);
    },

    /** К4 — platform-wide lookup by invoice id alone, same shape as `reserveSaasBillingRefund`. */
    async cancelSaasBillingInvoice(input) {
      return getDrizzle().transaction(async (tx) => {
        const [invoiceRow] = await tx
          .select()
          .from(saasBillingInvoices)
          .where(eq(saasBillingInvoices.id, input.saasBillingInvoiceId))
          .limit(1)
          .for('update');
        if (!invoiceRow) return { outcome: 'invoice_not_found' as const };
        const invoice = toSaasBillingInvoice(invoiceRow);
        if (invoice.status !== 'draft' && invoice.status !== 'pending') {
          return { outcome: 'invoice_not_cancellable' as const, status: invoice.status };
        }

        const [updated] = await tx
          .update(saasBillingInvoices)
          .set({ status: 'void', updatedAt: new Date().toISOString() })
          .where(eq(saasBillingInvoices.id, invoice.id))
          .returning();
        if (!updated) throw new Error('saas_billing_invoice_cancel_failed');

        await tx.insert(adminAuditLog).values({
          organizationId: invoice.organizationId,
          actorId: input.actorId,
          action: 'saas_billing_invoice_cancelled',
          targetId: invoice.id,
          details: {
            reason: input.reason,
            amountMinor: invoice.amountMinor,
            currency: invoice.currency,
          },
          status: 'ok',
        });

        return { outcome: 'cancelled' as const, invoice: toSaasBillingInvoice(updated) };
      });
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

    async listSaasBillingSubscriptionsDueForRenewal({ asOf, limit }) {
      const rows = await getDrizzle()
        .select({
          saasBillingSubscriptionId: saasBillingSubscriptions.id,
          organizationId: saasBillingSubscriptions.organizationId,
          tariffId: saasTariffs.id,
          billingPeriod: saasTariffs.billingPeriod,
          currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
        })
        .from(saasBillingSubscriptions)
        .innerJoin(saasTariffs, eq(saasTariffs.id, saasBillingSubscriptions.tariffId))
        .where(
          and(
            eq(saasBillingSubscriptions.source, 'paid_subscription'),
            eq(saasBillingSubscriptions.status, 'active'),
            isNotNull(saasBillingSubscriptions.currentPeriodEndsAt),
            lte(saasBillingSubscriptions.currentPeriodEndsAt, asOf),
          ),
        )
        .orderBy(saasBillingSubscriptions.currentPeriodEndsAt)
        .limit(limit);
      return rows.map((row) => ({
        ...row,
        billingPeriod: row.billingPeriod as SaasBillingPeriod,
        // `IS NOT NULL` filtered above; the column type stays nullable at the schema level.
        currentPeriodEndsAt: row.currentPeriodEndsAt as string,
      }));
    },

    async createSaasBillingRenewalInvoiceIfAbsent(input) {
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

        const [inserted] = await tx
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
          .onConflictDoNothing({
            target: [
              saasBillingInvoices.saasBillingSubscriptionId,
              saasBillingInvoices.servicePeriodStartsAt,
              saasBillingInvoices.servicePeriodEndsAt,
            ],
          })
          .returning();
        if (inserted) {
          return { invoice: toSaasBillingInvoice(inserted), created: true };
        }

        // Conflict: a previous tick (or this one, retried) already raised the invoice for this
        // exact subscription+period — the DB constraint is the source of truth, not a pre-check.
        const [existing] = await tx
          .select()
          .from(saasBillingInvoices)
          .where(
            and(
              eq(saasBillingInvoices.saasBillingSubscriptionId, input.saasBillingSubscriptionId),
              eq(saasBillingInvoices.servicePeriodStartsAt, input.servicePeriodStartsAt),
              eq(saasBillingInvoices.servicePeriodEndsAt, input.servicePeriodEndsAt),
            ),
          )
          .limit(1);
        if (!existing) throw new Error('saas_billing_renewal_invoice_conflict_not_found');
        return { invoice: toSaasBillingInvoice(existing), created: false };
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

    async reserveSaasBillingRefund(input) {
      return getDrizzle().transaction(async (tx) => {
        // Locks the invoice for the duration of this transaction, so two reservation attempts
        // against the SAME invoice (whatever their idempotency key) serialize here — the second
        // one only proceeds once the first has committed (or rolled back) its refund row.
        const [invoiceRow] = await tx
          .select()
          .from(saasBillingInvoices)
          .where(eq(saasBillingInvoices.id, input.saasBillingInvoiceId))
          .limit(1)
          .for('update');
        if (!invoiceRow) return { outcome: 'invoice_not_found' as const };
        const invoice = toSaasBillingInvoice(invoiceRow);
        if (invoice.status !== 'paid') {
          return { outcome: 'invoice_not_refundable' as const, status: invoice.status };
        }

        const [{ refundedMinor }] = await tx
          .select({
            refundedMinor: sql<string>`coalesce(sum(${saasBillingRefunds.amountMinor}), 0)`,
          })
          .from(saasBillingRefunds)
          .where(
            and(
              eq(saasBillingRefunds.saasBillingInvoiceId, invoice.id),
              inArray(saasBillingRefunds.status, OPEN_REFUND_STATUSES),
            ),
          );
        const remainingMinor = invoice.amountMinor - Number(refundedMinor);
        if (input.amountMinor > remainingMinor) {
          return { outcome: 'amount_exceeds_remaining' as const, remainingMinor };
        }

        const [existing] = await tx
          .select()
          .from(saasBillingRefunds)
          .where(
            and(
              eq(saasBillingRefunds.providerId, invoice.providerId),
              eq(saasBillingRefunds.providerIdempotencyKey, input.providerIdempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          return { outcome: 'duplicate' as const, refund: toSaasBillingRefund(existing) };
        }

        const [row] = await tx
          .insert(saasBillingRefunds)
          .values({
            organizationId: invoice.organizationId,
            saasBillingInvoiceId: invoice.id,
            amountMinor: input.amountMinor,
            currency: invoice.currency,
            status: 'pending',
            providerId: invoice.providerId,
            providerIdempotencyKey: input.providerIdempotencyKey,
          })
          .onConflictDoNothing({
            target: [saasBillingRefunds.providerId, saasBillingRefunds.providerIdempotencyKey],
          })
          .returning();
        if (!row) throw new Error('saas_billing_refund_reservation_failed');

        await tx.insert(adminAuditLog).values({
          organizationId: invoice.organizationId,
          actorId: input.audit.actorId,
          action: 'saas_billing_refund_requested',
          targetId: row.id,
          details: {
            reason: input.audit.reason,
            saasBillingInvoiceId: invoice.id,
            amountMinor: input.amountMinor,
            currency: invoice.currency,
          },
          status: 'ok',
        });

        return { outcome: 'reserved' as const, refund: toSaasBillingRefund(row), invoice };
      });
    },

    async attachSaasBillingRefundProviderRef(input) {
      const [row] = await getDrizzle()
        .update(saasBillingRefunds)
        .set({ providerRefundRef: input.providerRefundRef, updatedAt: new Date().toISOString() })
        .where(eq(saasBillingRefunds.id, input.saasBillingRefundId))
        .returning();
      if (!row) throw new Error('saas_billing_refund_not_found');
      return toSaasBillingRefund(row);
    },

    async markSaasBillingRefundFailed(input) {
      const [row] = await getDrizzle()
        .update(saasBillingRefunds)
        .set({ status: 'failed', updatedAt: new Date().toISOString() })
        .where(eq(saasBillingRefunds.id, input.saasBillingRefundId))
        .returning();
      if (!row) throw new Error('saas_billing_refund_not_found');
      return toSaasBillingRefund(row);
    },

    async findSaasBillingRefundByProviderRef({ providerId, providerRefundRef }) {
      const [row] = await getDrizzle()
        .select()
        .from(saasBillingRefunds)
        .where(
          and(
            eq(saasBillingRefunds.providerId, providerId),
            eq(saasBillingRefunds.providerRefundRef, providerRefundRef),
          ),
        )
        .limit(1);
      return row ? toSaasBillingRefund(row) : null;
    },

    async confirmSaasBillingRefund({ saasBillingRefundId, organizationId, status, confirmedAt }) {
      const [row] = await getDrizzle()
        .update(saasBillingRefunds)
        .set({ status, confirmedAt, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(saasBillingRefunds.id, saasBillingRefundId),
            eq(saasBillingRefunds.organizationId, organizationId),
          ),
        )
        .returning();
      if (!row) throw new Error('saas_billing_refund_not_found');
      return toSaasBillingRefund(row);
    },
  };
}
