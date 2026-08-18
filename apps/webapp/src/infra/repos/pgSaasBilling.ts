import { and, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot, runWebappPgText } from '@/infra/db/runWebappSql';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
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
import { purchasedTariffId } from '@/modules/saas-billing/payableTariff';
import { proratedTariffUpgradeAmountMinor } from '@/modules/saas-billing/proration';
import { SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION } from '@/modules/saas-billing/ports';
import { sanitizeSaasBillingProviderEventEnvelope } from '@/modules/saas-billing/providerEventEnvelope';
import { withReceiptSnapshot } from '@/modules/saas-billing/fiscalReceipt';
import { beOrganizations } from '../../../db/schema/bookingEngine';
import { transactionQuotaPort } from '@/infra/repos/transactionQuotaPort';
import {
  saasBillingAccounts,
  saasBillingInvoices,
  saasBillingProviderEvents,
  saasBillingRefunds,
  saasBillingSubscriptions,
} from '../../../db/schema/saasBilling';
import { saasOrganizationTrials, saasTariffs, saasTrialPolicy } from '../../../db/schema/saasEntitlements';
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

/**
 * К4 round 2 — the ONE place `createSaasBillingInvoice` and `createManualSaasBillingInvoice` both
 * insert through, instead of each doing a plain insert that a same-key repeat would either throw
 * on or (worse, per the К4 round-1 bug) never even collide with. `onConflictDoNothing` on the
 * unique `(provider_id, provider_idempotency_key)` index makes the second call a no-op at the DB
 * level; the reselect below is what turns that no-op into "hand back the invoice already raised."
 */
async function insertSaasBillingInvoiceIdempotent(
  db: Db | Transaction,
  values: typeof saasBillingInvoices.$inferInsert,
): Promise<{ invoice: SaasBillingInvoice; created: boolean }> {
  const [inserted] = await db
    .insert(saasBillingInvoices)
    .values(values)
    .onConflictDoNothing({
      target: [saasBillingInvoices.providerId, saasBillingInvoices.providerIdempotencyKey],
    })
    .returning();
  if (inserted) return { invoice: toSaasBillingInvoice(inserted), created: true };

  const [existing] = await db
    .select()
    .from(saasBillingInvoices)
    .where(
      and(
        eq(saasBillingInvoices.providerId, values.providerId),
        eq(saasBillingInvoices.providerIdempotencyKey, values.providerIdempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error('saas_billing_invoice_conflict_not_found');
  return { invoice: toSaasBillingInvoice(existing), created: false };
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

/**
 * §2.12 — the content a paid period freezes: a COPY of the WHOLE live `saas_tariffs` row
 * (`to_jsonb`), taken at the moment the period starts (first payment, renewal payment, or manual
 * assignment — every write site below). Never a chosen list of fields: `to_jsonb` serializes
 * whatever columns the row has right now, so a tariff column added later is captured automatically,
 * with no field list to keep in sync here.
 */
async function readTariffSnapshotForPeriod(
  tx: Transaction,
  tariffId: string,
): Promise<Record<string, unknown>> {
  const result = await tx.execute(
    sql`SELECT to_jsonb(tariff) AS snapshot FROM public.saas_tariffs AS tariff WHERE tariff.id = ${tariffId}::uuid`,
  );
  const row = result.rows[0] as { snapshot: Record<string, unknown> } | undefined;
  if (!row) throw new Error('saas_billing_tariff_not_found');
  return row.snapshot;
}

// B0.3 (#1057): `promotePaidInvoice` and the tariff-upgrade branch of `captureSaasBillingPaymentSucceeded`
// run under `SET ROLE app_staff` (`runWithDbOrganizationPrincipal`), where the guard trigger
// `app.reject_staff_commercial_organization_update()` unconditionally rejects a direct
// `be_organizations.tariff_id` write. Route it through the narrow SECURITY DEFINER accessor instead
// (`0346`): it re-derives the tariff from the invoice row itself and refuses anything not paid/matching.
async function applyPaidSaasBillingTariff(
  tx: Transaction,
  saasBillingInvoiceId: string,
  organizationId: string,
): Promise<void> {
  const result = await tx.execute(
    sql`SELECT app.apply_paid_saas_billing_tariff(${saasBillingInvoiceId}::uuid, ${organizationId}::uuid) AS applied`,
  );
  const row = result.rows[0] as { applied: boolean } | undefined;
  if (!row?.applied) throw new Error('saas_billing_tariff_apply_failed');
}

// L-10 (0023): refreshing an unclaimed period draft rewrites `amount_minor` — the one column a
// tenant role must never be able to write, because the worst a coerced `app_clinic_billing` call
// site could then do is change what a clinic owes instead of merely failing. The role therefore
// holds no UPDATE on it; the narrow accessor below re-derives the amount from the subscription's own
// tariff row and never takes it from the caller. `tariffId` is not «how much» but «which of this
// subscription's two tariffs» — the seam refuses anything that is neither the current nor the
// pending one, and refuses (returns false) exactly where this repository refuses: a draft the
// provider already holds an order for is never rewritten.
async function refreshSaasBillingInvoicePurchasedTariff(
  tx: Transaction,
  saasBillingInvoiceId: string,
  organizationId: string,
  tariffId: string,
): Promise<boolean> {
  const result = await tx.execute(
    sql`SELECT app.refresh_saas_billing_invoice_purchased_tariff(${saasBillingInvoiceId}::uuid, ${organizationId}::uuid, ${tariffId}::uuid) AS refreshed`,
  );
  const row = result.rows[0] as { refreshed: boolean } | undefined;
  return row?.refreshed === true;
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

async function promotePaidInvoice(
  tx: Transaction,
  invoice: typeof saasBillingInvoices.$inferSelect,
  organizationId: string,
): Promise<boolean> {
  const [subscription] = await tx
    .select()
    .from(saasBillingSubscriptions)
    .where(and(eq(saasBillingSubscriptions.id, invoice.saasBillingSubscriptionId), eq(saasBillingSubscriptions.organizationId, organizationId)))
    .limit(1)
    .for('update');
  // First tariff payment installs a period. Later payments can only promote exactly at the
  // already-paid boundary; a future invoice remains paid until the renewal tick reaches it.
  if (
    !subscription ||
    (subscription.currentPeriodEndsAt !== null &&
      subscription.currentPeriodEndsAt !== invoice.servicePeriodStartsAt) ||
    (subscription.currentPeriodEndsAt === null &&
      invoice.tariffId !== (subscription.pendingTariffId ?? subscription.tariffId))
  ) return false;
  const tariffSnapshot = invoice.tariffSnapshot ?? await readTariffSnapshotForPeriod(tx, invoice.tariffId);
  await tx.update(saasBillingSubscriptions).set({
    tariffId: invoice.tariffId, pendingTariffId: null, status: 'active', lifecycleState: 'active',
    cancelledAt: null, currentPeriodStartsAt: invoice.servicePeriodStartsAt,
    currentPeriodEndsAt: invoice.servicePeriodEndsAt, tariffSnapshot, updatedAt: new Date().toISOString(),
  }).where(eq(saasBillingSubscriptions.id, subscription.id));
  await applyPaidSaasBillingTariff(tx, invoice.id, organizationId);
  if (subscription.pendingTariffId !== null) {
    await tx.insert(adminAuditLog).values({
      organizationId,
      actorId: null,
      action: 'saas_tariff_change_activated',
      targetId: subscription.id,
      details: {
        previousTariffId: subscription.tariffId,
        tariffId: invoice.tariffId,
        pendingTariffId: subscription.pendingTariffId,
        servicePeriodStartsAt: invoice.servicePeriodStartsAt,
        servicePeriodEndsAt: invoice.servicePeriodEndsAt,
      },
      status: 'ok',
    });
  }
  // A first real tariff payment replaces any active trial in the same transaction as the period.
  // `applyPaidSaasBillingTariff` above (0350) already ends it -- `app_staff` (this transaction's
  // role) never held UPDATE on saas_organization_trials, so a direct write here always failed
  // 42501; folded into the same SECURITY DEFINER accessor instead of granting it.
  return true;
}

function paidPeriodSnapshotPrice(snapshot: Record<string, unknown> | null): {
  priceMinor: number;
  currency: string;
  billingPeriod: string;
} {
  const priceMinor = snapshot?.price_minor;
  const currency = snapshot?.currency;
  const billingPeriod = snapshot?.billing_period;
  if (
    typeof priceMinor !== 'number' ||
    !Number.isSafeInteger(priceMinor) ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency) ||
    typeof billingPeriod !== 'string' ||
    billingPeriod.trim().length === 0
  ) {
    throw new Error('saas_billing_paid_period_snapshot_missing');
  }
  return { priceMinor, currency, billingPeriod };
}

function paidPeriodSnapshotAdditionalSeatPrice(snapshot: Record<string, unknown> | null): number | null {
  const additionalSeatPriceMinor = snapshot?.additional_seat_price_minor;
  if (additionalSeatPriceMinor === null || additionalSeatPriceMinor === undefined) return null;
  if (
    typeof additionalSeatPriceMinor !== 'number' ||
    !Number.isSafeInteger(additionalSeatPriceMinor) ||
    additionalSeatPriceMinor < 0
  ) {
    throw new Error('saas_billing_paid_period_snapshot_missing');
  }
  return additionalSeatPriceMinor;
}

export function createPgSaasBillingRepository(): SaasBillingRepositoryPort {
  return {
    async listBillingPeriods() {
      const platformRead = getCurrentDbPrincipal()?.kind === 'platform';
      type BillingPeriodCatalogRow = {
        code: string;
        label: string;
        months: number;
        is_selectable: boolean;
        sort_order: number;
      };
      const result = platformRead
        ? await runWebappNamedRoot<BillingPeriodCatalogRow>(
            getWebappSqlDb(),
            'app.list_saas_billing_period_catalog_platform()',
            [],
            sql`SELECT * FROM app.list_saas_billing_period_catalog_platform()`,
          )
        : await runWebappNamedRoot<BillingPeriodCatalogRow>(
            getWebappSqlDb(),
            'app.list_saas_billing_period_catalog()',
            [],
            sql`SELECT * FROM app.list_saas_billing_period_catalog()`,
          );
      return result.rows.map((row) => ({
        code: row.code,
        label: row.label,
        months: row.months,
        isSelectable: row.is_selectable,
        sortOrder: row.sort_order,
      }));
    },
    async getSaasBillingAccountBillingEmail(organizationId) {
      const [account] = await getDrizzle()
        .select({ billingEmail: saasBillingAccounts.billingEmail })
        .from(saasBillingAccounts)
        .where(eq(saasBillingAccounts.organizationId, organizationId))
        .limit(1);
      return account?.billingEmail?.trim() || null;
    },
    async updateSaasBillingAccountBillingEmail({ organizationId, billingEmail }) {
      const normalizedEmail = billingEmail.trim().toLowerCase();
      const [account] = await getDrizzle()
        .insert(saasBillingAccounts)
        .values({ organizationId, billingEmail: normalizedEmail })
        .onConflictDoUpdate({
          target: saasBillingAccounts.organizationId,
          set: { billingEmail: normalizedEmail, updatedAt: new Date().toISOString() },
        })
        .returning({ billingEmail: saasBillingAccounts.billingEmail });
      if (!account?.billingEmail) throw new Error('saas_billing_account_email_update_failed');
      return account.billingEmail;
    },
    async getOrganizationBillingOverview(organizationId) {
      const db = getDrizzle();
      const [account, subscriptionRows, invoiceRows, providerEvents] = await Promise.all([
        db
          .select({ billingEmail: saasBillingAccounts.billingEmail })
          .from(saasBillingAccounts)
          .where(eq(saasBillingAccounts.organizationId, organizationId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
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
        billingEmail: account?.billingEmail?.trim() || null,
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

    async getOrganizationAssignedTariffId(organizationId) {
      const [organization] = await getDrizzle()
        .select({ tariffId: beOrganizations.tariffId })
        .from(beOrganizations)
        .where(eq(beOrganizations.id, organizationId))
        .limit(1);
      return organization?.tariffId ?? null;
    },

    async chooseOrganizationFirstTariff({ tariffId, actorId }) {
      const result = await runWebappPgText<{ payload: unknown }>(
        `SELECT app.choose_organization_first_tariff($1::uuid, $2::uuid) AS payload`,
        [tariffId, actorId],
      );
      const payload = result.rows[0]?.payload;
      if (!payload || typeof payload !== 'object' || payload === null) {
        throw new Error('choose_organization_first_tariff_failed');
      }
      const outcome = (payload as { outcome?: string }).outcome;
      if (outcome === 'trial_started') {
        const endsAt = (payload as { endsAt?: string }).endsAt;
        if (!endsAt) throw new Error('choose_organization_first_tariff_failed');
        return { outcome: 'trial_started', endsAt };
      }
      return { outcome: 'payment_required' };
    },

    async listActiveTariffChoices() {
      return getDrizzle()
        .select({ id: saasTariffs.id, name: saasTariffs.name, priceMinor: saasTariffs.priceMinor })
        .from(saasTariffs)
        .where(eq(saasTariffs.isActive, true))
        .orderBy(saasTariffs.name);
    },

    async listPlatformInvoices(filter): Promise<SaasBillingPlatformInvoiceRow[]> {
      const db = getDrizzle();
      const conds = [];
      if (filter.periodFrom) conds.push(gte(saasBillingInvoices.createdAt, filter.periodFrom));
      if (filter.periodTo) conds.push(lte(saasBillingInvoices.createdAt, filter.periodTo));
      if (filter.paidFrom) conds.push(gte(saasBillingInvoices.paidAt, filter.paidFrom));
      if (filter.paidTo) conds.push(lte(saasBillingInvoices.paidAt, filter.paidTo));
      if (filter.providerInvoiceRefs) {
        // An empty request matches nothing. `inArray` with an empty list is not a safe way to say
        // that, so the impossible predicate is written out — otherwise "look up these zero refs"
        // would silently mean "give me the whole journal".
        conds.push(
          filter.providerInvoiceRefs.length
            ? inArray(saasBillingInvoices.providerInvoiceRef, filter.providerInvoiceRefs)
            : sql`false`,
        );
      }
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
          invoiceKind: saasBillingInvoices.invoiceKind,
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
          saasBillingInvoices.invoiceKind,
          saasBillingInvoices.tariffId,
          saasBillingInvoices.tariffName,
          saasBillingInvoices.tariffBillingPeriod,
          saasBillingInvoices.currency,
        )
        .orderBy(desc(sql`sum(${saasBillingInvoices.amountMinor})`));

      return rows.map((row) => ({
        invoiceKind: row.invoiceKind,
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
            const [trialIdentity] = await tx
              .select({ id: saasOrganizationTrials.id })
              .from(saasOrganizationTrials)
              .where(eq(saasOrganizationTrials.organizationId, organizationId))
              .limit(1);
            const [manualSaasBillingSubscription] = await tx
              .select({
                id: saasBillingSubscriptions.id,
                tariffId: saasBillingSubscriptions.tariffId,
                status: saasBillingSubscriptions.status,
                currentPeriodStartsAt: saasBillingSubscriptions.currentPeriodStartsAt,
                currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
                pendingTariffId: saasBillingSubscriptions.pendingTariffId,
              })
              .from(saasBillingSubscriptions)
              .where(
                and(
                  eq(saasBillingSubscriptions.organizationId, organizationId),
                  inArray(saasBillingSubscriptions.source, ['paid_subscription', 'manual']),
                ),
              )
              // A pending payment row must not hide the active assignment that currently owns
              // the organization's tariff. Within the same lifecycle state, keep the existing
              // paid-subscription-before-manual precedence.
              .orderBy(
                desc(sql<number>`CASE WHEN ${saasBillingSubscriptions.status} = 'active' THEN 1 ELSE 0 END`),
                desc(saasBillingSubscriptions.source),
              )
              .limit(1);
            return {
              organization,
              organizationTrialConsumed: Boolean(trialIdentity),
              activeTrial: activeTrial ?? null,
              manualSaasBillingSubscription: manualSaasBillingSubscription ?? null,
            };
          },
          async getActiveTrialPolicy() {
            const [policyRow] = await tx
              .select({
                durationDays: saasTrialPolicy.durationDays,
                discountWindowDays: saasTrialPolicy.discountWindowDays,
                postTrialBehavior: saasTrialPolicy.postTrialBehavior,
                postTrialTariffId: saasTrialPolicy.postTrialTariffId,
              })
              .from(saasTrialPolicy)
              .where(and(eq(saasTrialPolicy.key, 'global'), eq(saasTrialPolicy.isActive, true)))
              .limit(1);
            return policyRow ?? null;
          },
          async startOrganizationTrial({ organizationId, tariffId, policy, audit }) {
            const startedAt = new Date();
            const endsAt = new Date(startedAt.getTime() + policy.durationDays * 86_400_000);
            const discountEndsAt = new Date(
              endsAt.getTime() + policy.discountWindowDays * 86_400_000,
            );
            const [created] = await tx
              .insert(saasOrganizationTrials)
              .values({
                organizationId,
                tariffId,
                startedAt: startedAt.toISOString(),
                endsAt: endsAt.toISOString(),
                discountEndsAt: discountEndsAt.toISOString(),
                postTrialBehavior: policy.postTrialBehavior,
                postTrialTariffId: policy.postTrialTariffId,
                createdBy: audit.actorId,
              })
              .onConflictDoNothing({ target: saasOrganizationTrials.organizationId })
              .returning({ id: saasOrganizationTrials.id, endsAt: saasOrganizationTrials.endsAt });
            if (!created) {
              const [existing] = await tx
                .select({ endsAt: saasOrganizationTrials.endsAt })
                .from(saasOrganizationTrials)
                .where(eq(saasOrganizationTrials.organizationId, organizationId))
                .limit(1);
              if (!existing) throw new Error('trial_start_conflict');
              return { created: false, endsAt: existing.endsAt };
            }
            await tx.insert(adminAuditLog).values({
              organizationId,
              actorId: audit.actorId,
              action: 'saas_trial_start',
              targetId: created.id,
              details: {
                reason: audit.reason,
                before: null,
                after: created,
              },
              status: 'ok',
            });
            return { created: true, endsAt: created.endsAt };
          },
          async requireActiveTariff(tariffId) {
            const [tariff] = await tx
              .select({ id: saasTariffs.id, billingPeriod: saasTariffs.billingPeriod })
              .from(saasTariffs)
              .where(and(eq(saasTariffs.id, tariffId), eq(saasTariffs.isActive, true)))
              .limit(1);
            if (!tariff) throw new Error('active_tariff_not_found');
            return { billingPeriod: tariff.billingPeriod };
          },
          async setManualSaasBillingSubscription({
            organizationId,
            tariffId,
            period,
            pendingTariffId = null,
            preservePeriodSnapshot = false,
          }) {
            const [effective] = await tx
              .select({
                source: saasBillingSubscriptions.source,
                tariffSnapshot: saasBillingSubscriptions.tariffSnapshot,
              })
              .from(saasBillingSubscriptions)
              .where(
                and(
                  eq(saasBillingSubscriptions.organizationId, organizationId),
                  eq(saasBillingSubscriptions.source, 'paid_subscription'),
                ),
              )
              .limit(1);
            const source = effective?.source ?? 'manual';
            if (tariffId === null) {
              await tx
                .update(saasBillingSubscriptions)
                .set({
                  status: 'cancelled',
                  cancelledAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  // Unassigning ends the paid period; leaving it behind would keep feeding the
                  // ladder an anchor for a tariff the organization no longer has. The frozen
                  // content goes with it — there is no period left for it to describe.
                  currentPeriodStartsAt: null,
                  currentPeriodEndsAt: null,
                  tariffSnapshot: null,
                  pendingTariffId: null,
                })
                .where(
                  and(
                    eq(saasBillingSubscriptions.organizationId, organizationId),
                    eq(saasBillingSubscriptions.source, source),
                  ),
                );
              return;
            }
            const account = await upsertSaasBillingAccount(tx, organizationId);
            // §2.12 — a manual platform-admin assignment always opens a paid period exactly like a
            // real payment (§5a item 7.0 already treats the two identically for the ladder anchor),
            // so it freezes the tariff's content the same way: taken now, kept until this period ends.
            const tariffSnapshot = period
              ? (preservePeriodSnapshot ? effective?.tariffSnapshot : null) ??
                (await readTariffSnapshotForPeriod(tx, tariffId))
              : null;
            const [row] = await tx
              .insert(saasBillingSubscriptions)
              .values({
                organizationId,
                saasBillingAccountId: account.id,
                tariffId,
                source,
                status: 'active',
                lifecycleState: 'active',
                currentPeriodStartsAt: period?.startsAt ?? null,
                currentPeriodEndsAt: period?.endsAt ?? null,
                tariffSnapshot,
                pendingTariffId,
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
                  tariffSnapshot,
                  pendingTariffId,
                },
              })
              .returning({ id: saasBillingSubscriptions.id });
            if (!row) throw new Error('saas_billing_manual_assignment_failed');
          },
          async updateOrganizationTariffAssignment({ organizationId, tariffId }) {
            const [organization] = await tx
              .update(beOrganizations)
              .set({ tariffId })
              .where(eq(beOrganizations.id, organizationId))
              .returning({ tariffId: beOrganizations.tariffId });
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
        // #1057 — K0 originally derived the provider key from a short clock bucket. A historical
        // empty renewal draft can therefore have a different key even though it is the same
        // subscription period. The period is authoritative for this renewal path; manual invoices
        // (description + expiry) and seat overage invoices do not participate in this lookup.
        const [existingRenewal] = await tx
          .select()
          .from(saasBillingInvoices)
          .where(
            and(
              eq(saasBillingInvoices.saasBillingSubscriptionId, input.saasBillingSubscriptionId),
              eq(saasBillingInvoices.servicePeriodStartsAt, input.servicePeriodStartsAt),
              eq(saasBillingInvoices.servicePeriodEndsAt, input.servicePeriodEndsAt),
              eq(saasBillingInvoices.invoiceKind, 'tariff_period'),
              isNull(saasBillingInvoices.description),
              isNull(saasBillingInvoices.expiresAt),
            ),
          )
          .limit(1);

        // Owner ruling 18.08.2026 — price, billing period and snapshot all come from the ONE tariff
        // this period is sold under (`purchasedTariffId`), never from a mix of the current and the
        // scheduled one. The tariff is picked here, in JS, by the same rule every other billing
        // path uses, instead of a join that silently decided it a second way.
        const [subscription] = await tx
          .select({
            organizationId: saasBillingSubscriptions.organizationId,
            saasBillingAccountId: saasBillingSubscriptions.saasBillingAccountId,
            tariffId: saasBillingSubscriptions.tariffId,
            pendingTariffId: saasBillingSubscriptions.pendingTariffId,
            paidAdditionalSeats: saasBillingSubscriptions.paidAdditionalSeats,
          })
          .from(saasBillingSubscriptions)
          .where(
            and(
              eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
              eq(saasBillingSubscriptions.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!subscription) throw new Error('saas_billing_subscription_not_found');
        const [tariff] = await tx
          .select({
            tariffId: saasTariffs.id,
            tariffName: saasTariffs.name,
            amountMinor: saasTariffs.priceMinor,
            additionalSeatPriceMinor: saasTariffs.additionalSeatPriceMinor,
            currency: saasTariffs.currency,
            tariffBillingPeriod: saasTariffs.billingPeriod,
          })
          .from(saasTariffs)
          .where(eq(saasTariffs.id, purchasedTariffId(subscription)))
          .limit(1);
        if (!tariff) throw new Error('saas_billing_subscription_not_found');
        if (tariff.amountMinor === null || tariff.currency === null) {
          throw new Error('saas_billing_tariff_not_billable');
        }
        if (subscription.paidAdditionalSeats > 0 && tariff.additionalSeatPriceMinor === null) {
          throw new Error('saas_billing_additional_seat_price_missing');
        }
        const amountMinor =
          tariff.amountMinor + subscription.paidAdditionalSeats * (tariff.additionalSeatPriceMinor ?? 0);

        if (existingRenewal) {
          // Same rule, one step further: the draft raised earlier for THIS period describes the
          // tariff that was being purchased then. If the clinic has since scheduled (or cancelled)
          // a change, that draft now names the wrong tariff — and `saas_billing_invoices_period_uidx`
          // forbids a second row for the period, so it is refreshed in place rather than left to
          // send the clinic to a checkout for a tariff it will not get. Only while it is still an
          // unclaimed draft: once the provider holds an order (`providerInvoiceRef`) or the invoice
          // left `draft`, the order is real and rewriting our copy of it would lie about it.
          if (
            existingRenewal.tariffId === tariff.tariffId &&
            existingRenewal.amountMinor === amountMinor
          ) {
            return { invoice: toSaasBillingInvoice(existingRenewal), created: false };
          }
          if (existingRenewal.status !== 'draft' || existingRenewal.providerInvoiceRef !== null) {
            return { invoice: toSaasBillingInvoice(existingRenewal), created: false };
          }
          // The amount is NOT passed in: the seam derives it from this subscription's tariff row, so
          // the money column stays outside the tenant role's reach. A fresh tariff snapshot also
          // drops the fiscal receipt snapshot stored inside it (`withReceiptSnapshot`): a receipt for
          // the old amount must not survive the refresh.
          const applied = await refreshSaasBillingInvoicePurchasedTariff(
            tx,
            existingRenewal.id,
            input.organizationId,
            tariff.tariffId,
          );
          // Same failure as the previous direct UPDATE returning no row: the draft was claimed (or
          // removed) between the read and the write, so nothing was refreshed.
          if (!applied) throw new Error('saas_billing_invoice_refresh_failed');
          const [refreshed] = await tx
            .select()
            .from(saasBillingInvoices)
            .where(eq(saasBillingInvoices.id, existingRenewal.id))
            .limit(1);
          if (!refreshed) throw new Error('saas_billing_invoice_refresh_failed');
          return { invoice: toSaasBillingInvoice(refreshed), created: false };
        }

        const tariffSnapshot = await readTariffSnapshotForPeriod(tx, tariff.tariffId);
        return insertSaasBillingInvoiceIdempotent(tx, {
          organizationId: subscription.organizationId,
          saasBillingAccountId: subscription.saasBillingAccountId,
          saasBillingSubscriptionId: input.saasBillingSubscriptionId,
          tariffId: tariff.tariffId,
          tariffName: tariff.tariffName,
          invoiceKind: 'tariff_period',
          additionalSeatQuantity: subscription.paidAdditionalSeats,
          amountMinor,
          currency: tariff.currency,
          tariffBillingPeriod: tariff.tariffBillingPeriod,
          tariffSnapshot,
          servicePeriodStartsAt: input.servicePeriodStartsAt,
          servicePeriodEndsAt: input.servicePeriodEndsAt,
          status: 'draft',
          providerId: input.providerId,
          providerIdempotencyKey: input.providerIdempotencyKey,
        });
      });
    },

    async createProratedTariffUpgradeInvoice(input) {
      return getDrizzle().transaction(async (tx) => {
        const [subscription] = await tx
          .select({
            id: saasBillingSubscriptions.id,
            organizationId: saasBillingSubscriptions.organizationId,
            saasBillingAccountId: saasBillingSubscriptions.saasBillingAccountId,
            tariffId: saasBillingSubscriptions.tariffId,
            currentPeriodStartsAt: saasBillingSubscriptions.currentPeriodStartsAt,
            currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
            tariffSnapshot: saasBillingSubscriptions.tariffSnapshot,
            paidAdditionalSeats: saasBillingSubscriptions.paidAdditionalSeats,
          })
          .from(saasBillingSubscriptions)
          .where(
            and(
              eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
              eq(saasBillingSubscriptions.organizationId, input.organizationId),
              eq(saasBillingSubscriptions.source, 'paid_subscription'),
            ),
          )
          .limit(1)
          .for('update');
        if (!subscription) throw new Error('saas_billing_subscription_not_found');
        if (!subscription.currentPeriodStartsAt || !subscription.currentPeriodEndsAt) {
          throw new Error('saas_billing_no_active_paid_subscription');
        }

        const [openInvoice] = await tx
          .select()
          .from(saasBillingInvoices)
          .where(
            and(
              eq(saasBillingInvoices.saasBillingSubscriptionId, subscription.id),
              eq(saasBillingInvoices.tariffId, input.targetTariffId),
              eq(saasBillingInvoices.description, SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION),
              inArray(saasBillingInvoices.status, ['draft', 'pending']),
            ),
          )
          .orderBy(desc(saasBillingInvoices.createdAt))
          .limit(1);
        if (openInvoice) {
          return { outcome: 'checkout', invoice: toSaasBillingInvoice(openInvoice), created: false };
        }

        const [targetTariff] = await tx
          .select({
            id: saasTariffs.id,
            name: saasTariffs.name,
            priceMinor: saasTariffs.priceMinor,
            currency: saasTariffs.currency,
            billingPeriod: saasTariffs.billingPeriod,
            additionalSeatPriceMinor: saasTariffs.additionalSeatPriceMinor,
          })
          .from(saasTariffs)
          .where(and(eq(saasTariffs.id, input.targetTariffId), eq(saasTariffs.isActive, true)))
          .limit(1);
        if (!targetTariff || targetTariff.priceMinor === null || targetTariff.currency === null) {
          throw new Error('saas_billing_tariff_not_billable');
        }
        const currentTariff = paidPeriodSnapshotPrice(subscription.tariffSnapshot);
        if (
          currentTariff.currency !== targetTariff.currency ||
          currentTariff.billingPeriod !== targetTariff.billingPeriod
        ) {
          throw new Error('saas_billing_tariff_upgrade_proration_unavailable');
        }
        if (targetTariff.priceMinor <= currentTariff.priceMinor) return { outcome: 'scheduled' };
        const currentPeriodAdjustmentMinor = proratedTariffUpgradeAmountMinor({
          currentPriceMinor: currentTariff.priceMinor,
          targetPriceMinor: targetTariff.priceMinor,
          periodStartsAt: subscription.currentPeriodStartsAt,
          periodEndsAt: subscription.currentPeriodEndsAt,
          asOf: input.asOf,
        });
        if (currentPeriodAdjustmentMinor === 0) {
          throw new Error('saas_billing_upgrade_no_remaining_period');
        }
        if (subscription.paidAdditionalSeats > 0 && targetTariff.additionalSeatPriceMinor === null) {
          throw new Error('saas_billing_additional_seat_price_missing');
        }
        const [paidFuturePeriod] = await tx
          .select({
            amountMinor: saasBillingInvoices.amountMinor,
            currency: saasBillingInvoices.currency,
            tariffBillingPeriod: saasBillingInvoices.tariffBillingPeriod,
          })
          .from(saasBillingInvoices)
          .where(
            and(
              eq(saasBillingInvoices.saasBillingSubscriptionId, subscription.id),
              eq(saasBillingInvoices.invoiceKind, 'tariff_period'),
              isNull(saasBillingInvoices.description),
              eq(saasBillingInvoices.status, 'paid'),
              eq(saasBillingInvoices.servicePeriodStartsAt, subscription.currentPeriodEndsAt),
            ),
          )
          .limit(1);
        const targetFuturePeriodAmountMinor =
          targetTariff.priceMinor +
          subscription.paidAdditionalSeats * (targetTariff.additionalSeatPriceMinor ?? 0);
        if (
          paidFuturePeriod &&
          (paidFuturePeriod.currency !== targetTariff.currency ||
            paidFuturePeriod.tariffBillingPeriod !== targetTariff.billingPeriod ||
            paidFuturePeriod.amountMinor > targetFuturePeriodAmountMinor)
        ) {
          throw new Error('saas_billing_tariff_upgrade_proration_unavailable');
        }
        const futurePeriodAdjustmentMinor = paidFuturePeriod
          ? targetFuturePeriodAmountMinor - paidFuturePeriod.amountMinor
          : 0;
        const amountMinor = currentPeriodAdjustmentMinor + futurePeriodAdjustmentMinor;
        const targetTariffSnapshot = await readTariffSnapshotForPeriod(tx, targetTariff.id);

        const result = await insertSaasBillingInvoiceIdempotent(tx, {
          organizationId: subscription.organizationId,
          saasBillingAccountId: subscription.saasBillingAccountId,
          saasBillingSubscriptionId: subscription.id,
          tariffId: targetTariff.id,
          tariffName: targetTariff.name,
          invoiceKind: 'tariff_period',
          additionalSeatQuantity: 0,
          description: SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION,
          amountMinor,
          currency: targetTariff.currency,
          tariffBillingPeriod: targetTariff.billingPeriod,
          tariffSnapshot: {
            ...targetTariffSnapshot,
            upgrade_future_period_adjustment_minor: futurePeriodAdjustmentMinor,
          },
          servicePeriodStartsAt: input.asOf,
          servicePeriodEndsAt: subscription.currentPeriodEndsAt,
          status: 'draft',
          providerId: input.providerId,
          providerIdempotencyKey: input.providerIdempotencyKey,
        });
        return { outcome: 'checkout' as const, ...result };
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

    async attachSaasBillingInvoiceReceiptSnapshot(input) {
      const [current] = await getDrizzle()
        .select({ tariffSnapshot: saasBillingInvoices.tariffSnapshot })
        .from(saasBillingInvoices)
        .where(eq(saasBillingInvoices.id, input.saasBillingInvoiceId))
        .limit(1);
      if (!current) throw new Error('saas_billing_invoice_not_found');
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({
          tariffSnapshot: withReceiptSnapshot(current.tariffSnapshot, input.receipt),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(saasBillingInvoices.id, input.saasBillingInvoiceId))
        .returning();
      if (!row) throw new Error('saas_billing_invoice_not_found');
      return toSaasBillingInvoice(row);
    },

    async claimSaasBillingInvoiceProviderIntent(saasBillingInvoiceId) {
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({ status: 'pending', updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(saasBillingInvoices.id, saasBillingInvoiceId),
            eq(saasBillingInvoices.status, 'draft'),
            isNull(saasBillingInvoices.providerInvoiceRef),
          ),
        )
        .returning({ id: saasBillingInvoices.id });
      return Boolean(row);
    },

    async releaseSaasBillingInvoiceProviderIntent(input) {
      await getDrizzle()
        .update(saasBillingInvoices)
        .set({
          status: 'draft',
          updatedAt: new Date().toISOString(),
          ...(input.rotateProviderIdempotencyKeyTo
            ? { providerIdempotencyKey: input.rotateProviderIdempotencyKeyTo }
            : {}),
        })
        .where(
          and(
            eq(saasBillingInvoices.id, input.saasBillingInvoiceId),
            eq(saasBillingInvoices.status, 'pending'),
            isNull(saasBillingInvoices.providerInvoiceRef),
          ),
        );
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

    async captureSaasBillingPaymentSucceeded(input) {
      return getDrizzle().transaction(async (tx) => {
        const event = sanitizeSaasBillingProviderEventEnvelope(input.event);
        await tx.insert(saasBillingProviderEvents).values({
          organizationId: input.organizationId, saasBillingInvoiceId: input.saasBillingInvoiceId,
          providerId: event.providerId, providerEventId: event.providerEventId, eventType: event.type,
          rawPayload: event,
        }).onConflictDoNothing({ target: [saasBillingProviderEvents.providerId, saasBillingProviderEvents.providerEventId] });
        // Resolve the owning subscription before taking either row lock, then always take the
        // locks subscription -> invoice. Refund confirmation follows the same order below.
        const [invoiceIdentity] = await tx.select({
          id: saasBillingInvoices.id,
          saasBillingSubscriptionId: saasBillingInvoices.saasBillingSubscriptionId,
        }).from(saasBillingInvoices).where(and(
          eq(saasBillingInvoices.id, input.saasBillingInvoiceId), eq(saasBillingInvoices.organizationId, input.organizationId),
        )).limit(1);
        if (!invoiceIdentity) return { captured: false, duplicate: true };
        const [subscription] = await tx.select().from(saasBillingSubscriptions).where(and(
          eq(saasBillingSubscriptions.id, invoiceIdentity.saasBillingSubscriptionId),
          eq(saasBillingSubscriptions.organizationId, input.organizationId),
        )).limit(1).for('update');
        if (!subscription) throw new Error('saas_billing_subscription_not_found');
        const [invoice] = await tx.select().from(saasBillingInvoices).where(and(
          eq(saasBillingInvoices.id, invoiceIdentity.id), eq(saasBillingInvoices.organizationId, input.organizationId),
        )).limit(1).for('update');
        if (!invoice || invoice.status === 'void' || invoice.status === 'failed') {
          return { captured: false, duplicate: true };
        }
        const wasPaid = invoice.status === 'paid';
        if (!wasPaid) {
          await tx.update(saasBillingInvoices).set({ status: 'paid', paidAt: input.paidAt, updatedAt: new Date().toISOString() })
            .where(eq(saasBillingInvoices.id, invoice.id));
        }
        // The subscription lock serializes separately delivered seat captures before allowance
        // changes, including replays that carry a different provider event id.
        if (input.savedPaymentMethodId && invoice.invoiceKind === 'tariff_period') {
          await tx.update(saasBillingSubscriptions).set({ savedPaymentMethodId: input.savedPaymentMethodId, updatedAt: new Date().toISOString() })
            .where(and(eq(saasBillingSubscriptions.id, invoice.saasBillingSubscriptionId), eq(saasBillingSubscriptions.organizationId, input.organizationId)));
        }
        if (invoice.invoiceKind === 'seat_overage') {
          if (!wasPaid) {
            await tx.update(saasBillingSubscriptions).set({
              paidAdditionalSeats: sql`${saasBillingSubscriptions.paidAdditionalSeats} + ${invoice.additionalSeatQuantity}`,
              updatedAt: new Date().toISOString(),
            }).where(eq(saasBillingSubscriptions.id, subscription.id));
          }
        } else if (
          invoice.description === SAAS_BILLING_TARIFF_UPGRADE_DESCRIPTION &&
          !wasPaid &&
          invoice.servicePeriodEndsAt === subscription.currentPeriodEndsAt
        ) {
          const tariffSnapshot =
            invoice.tariffSnapshot ?? (await readTariffSnapshotForPeriod(tx, invoice.tariffId));
          const targetTariff = paidPeriodSnapshotPrice(tariffSnapshot);
          const additionalSeatPriceMinor = paidPeriodSnapshotAdditionalSeatPrice(tariffSnapshot);
          if (subscription.paidAdditionalSeats > 0 && additionalSeatPriceMinor === null) {
            throw new Error('saas_billing_additional_seat_price_missing');
          }
          await tx
            .update(saasBillingInvoices)
            .set({
              tariffId: invoice.tariffId,
              tariffName: invoice.tariffName,
              currency: targetTariff.currency,
              tariffBillingPeriod: targetTariff.billingPeriod,
              tariffSnapshot,
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(saasBillingInvoices.saasBillingSubscriptionId, subscription.id),
                eq(saasBillingInvoices.invoiceKind, 'tariff_period'),
                isNull(saasBillingInvoices.description),
                eq(saasBillingInvoices.status, 'paid'),
                eq(saasBillingInvoices.servicePeriodStartsAt, subscription.currentPeriodEndsAt),
              ),
            );
          await tx
            .update(saasBillingSubscriptions)
            .set({
              tariffId: invoice.tariffId,
              pendingTariffId: null,
              tariffSnapshot,
              status: 'active',
              lifecycleState: 'active',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(saasBillingSubscriptions.id, subscription.id));
          await applyPaidSaasBillingTariff(tx, invoice.id, input.organizationId);
        } else if (invoice.servicePeriodStartsAt <= input.paidAt) {
          await promotePaidInvoice(tx, invoice, input.organizationId);
        }
        await tx.update(saasBillingProviderEvents).set({ processedAt: new Date().toISOString() }).where(and(
          eq(saasBillingProviderEvents.providerId, event.providerId), eq(saasBillingProviderEvents.providerEventId, event.providerEventId),
        ));
        return { captured: !wasPaid, duplicate: wasPaid };
      });
    },

    // B0.3 (#1057): runs under the bootstrap principal, before the organization is known — the
    // plain table SELECT this used to be is unreachable there (only `app_clinic_billing` can read
    // `saas_billing_invoices`, and the bootstrap connection never becomes it). Read through the
    // narrow SECURITY DEFINER resolver instead; it returns only the four fields this lookup needs.
    async findSaasBillingInvoiceByProviderRef({ providerId, providerInvoiceRef }) {
      const result = await runWebappNamedRoot<{
          id: string;
          organization_id: string;
          amount_minor: number;
          currency: string;
        }>(
        getWebappSqlDb(),
        'app.resolve_saas_billing_invoice_for_webhook(text,text)',
        [providerId, providerInvoiceRef],
        sql`SELECT * FROM app.resolve_saas_billing_invoice_for_webhook(${providerId}::text, ${providerInvoiceRef}::text)`,
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            organizationId: row.organization_id,
            amountMinor: row.amount_minor,
            currency: row.currency,
          }
        : null;
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
      return getDrizzle().transaction(async (tx) => {
        const tariffSnapshot = await readTariffSnapshotForPeriod(tx, authority.tariffId);

        return insertSaasBillingInvoiceIdempotent(tx, {
        organizationId: authority.organizationId,
        saasBillingAccountId: authority.saasBillingAccountId,
        saasBillingSubscriptionId: input.saasBillingSubscriptionId,
        tariffId: authority.tariffId,
        tariffName: authority.tariffName,
        invoiceKind: input.invoiceKind,
        additionalSeatQuantity: input.additionalSeatQuantity,
        description: input.description,
        amountMinor: input.amountMinor,
        currency: input.currency,
        tariffBillingPeriod: authority.tariffBillingPeriod,
        tariffSnapshot,
        servicePeriodStartsAt: input.servicePeriodStartsAt,
        servicePeriodEndsAt: input.servicePeriodEndsAt,
        expiresAt: input.expiresAt,
        status: 'draft',
        providerId: input.providerId,
        providerIdempotencyKey: input.providerIdempotencyKey,
        });
      });
    },

    async createSeatOverageInvoiceIfNeeded(input) {
      return getDrizzle().transaction((tx) =>
        transactionQuotaPort.withinLock(
          tx,
          { organizationId: input.organizationId, mechanic: 'clinic_team' },
          async (quota) => {

        const [subscription] = await tx
          .select()
          .from(saasBillingSubscriptions)
          .where(
            and(
              eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
              eq(saasBillingSubscriptions.organizationId, input.organizationId),
              eq(saasBillingSubscriptions.source, 'paid_subscription'),
            ),
          )
          .limit(1)
          .for('update');
        if (!subscription) throw new Error('saas_billing_subscription_not_found');

        const [existing] = await tx
          .select()
          .from(saasBillingInvoices)
          .where(
            and(
              eq(saasBillingInvoices.providerId, input.providerId),
              eq(saasBillingInvoices.providerIdempotencyKey, input.providerIdempotencyKey),
            ),
          )
          .limit(1)
          .for('update');
        const decision = await quota.resolveClinicTeamAvailability();
        if (decision.allowed) return { outcome: 'seat_available' as const };
        if (decision.code === 'seat_limit_reached') {
          return { outcome: 'seat_overage_unavailable' as const };
        }

        const effectiveTariffResult = await tx.execute(sql`
          SELECT
            tariff.id::text AS tariff_id,
            tariff.name AS tariff_name,
            tariff.additional_seat_price_minor,
            tariff.currency,
            tariff.billing_period,
            to_jsonb(tariff) AS tariff_snapshot
          FROM public.be_organizations AS organization
          JOIN LATERAL app.saas_billing_effective_tariff_for_current_org(
            organization.id,
            organization.tariff_id
          ) AS tariff ON true
          WHERE organization.id = ${input.organizationId}::uuid
        `);
        const tariff = effectiveTariffResult.rows[0] as
          | {
              tariff_id: string;
              tariff_name: string;
              additional_seat_price_minor: number | null;
              currency: string | null;
              billing_period: string;
              tariff_snapshot: Record<string, unknown>;
            }
          | undefined;
        if (!tariff) return { outcome: 'seat_overage_unavailable' as const };

        if (
          input.confirmedAmountMinor !== decision.priceMinor ||
          input.confirmedCurrency !== decision.currency
        ) {
          return {
            outcome: 'price_changed' as const,
            priceMinor: decision.priceMinor,
            currency: decision.currency,
          };
        }
        if (existing) {
          return {
            outcome: 'invoice' as const,
            invoice: toSaasBillingInvoice(existing),
            created: false,
          };
        }

        const inserted = await insertSaasBillingInvoiceIdempotent(tx, {
          organizationId: input.organizationId,
          saasBillingAccountId: subscription.saasBillingAccountId,
          saasBillingSubscriptionId: subscription.id,
          tariffId: tariff.tariff_id,
          tariffName: tariff.tariff_name,
          invoiceKind: 'seat_overage',
          additionalSeatQuantity: 1,
          description: 'Дополнительное место специалиста сверх тарифа',
          amountMinor: decision.priceMinor,
          currency: decision.currency,
          tariffBillingPeriod: tariff.billing_period,
          tariffSnapshot: tariff.tariff_snapshot,
          servicePeriodStartsAt: input.servicePeriodStartsAt,
          servicePeriodEndsAt: input.servicePeriodEndsAt,
          expiresAt: input.servicePeriodEndsAt,
          status: 'draft',
          providerId: input.providerId,
          providerIdempotencyKey: input.providerIdempotencyKey,
        });
        return { outcome: 'invoice' as const, ...inserted };
          },
        ),
      );
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

        // Решение владельца 18.08 (L-11): «она выбирает платный тариф — ИДЕТ ОПЛАЧИВАТЬ И ПОТОМ
        // ПОЛУЧАЕТ ДОСТУП». Поэтому первый выбор больше НЕ пишет `be_organizations.tariff_id`
        // (миграция 0024) — там теперь только действующий тариф. Выбранный, но ещё не оплаченный,
        // живёт в собственной строке подписки `pending_payment`, и счёт выставляется по нему:
        // иначе клиника выбрала бы тариф и осталась без пути к оплате.
        const [chosen] = await tx
          .select({ tariffId: saasBillingSubscriptions.tariffId })
          .from(saasBillingSubscriptions)
          .where(
            and(
              eq(saasBillingSubscriptions.organizationId, organizationId),
              eq(saasBillingSubscriptions.source, 'paid_subscription'),
            ),
          )
          .limit(1);
        const subscriptionTariffId = organization.tariffId ?? chosen?.tariffId ?? null;
        if (!subscriptionTariffId) throw new Error('saas_billing_no_tariff_assigned');

        const [tariff] = await tx
          .select({ id: saasTariffs.id, billingPeriod: saasTariffs.billingPeriod, additionalSeatPriceMinor: saasTariffs.additionalSeatPriceMinor, currency: saasTariffs.currency })
          .from(saasTariffs)
          .where(and(eq(saasTariffs.id, subscriptionTariffId), eq(saasTariffs.isActive, true)))
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
            // Keep an existing paid period intact. Its tariff may only change by boundary promotion.
            set: { updatedAt: new Date().toISOString() },
          })
          .returning({
            id: saasBillingSubscriptions.id,
            tariffId: saasBillingSubscriptions.tariffId,
            pendingTariffId: saasBillingSubscriptions.pendingTariffId,
            savedPaymentMethodId: saasBillingSubscriptions.savedPaymentMethodId,
            currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
            currentPeriodStartsAt: saasBillingSubscriptions.currentPeriodStartsAt,
          });
        if (!row) throw new Error('saas_billing_subscription_upsert_failed');

        // Owner ruling 18.08.2026 — one tariff pays for one period: `purchasedTariffId` decides it
        // once, and price, billing period, currency and seat price are all read off THAT row. The
        // amount `createSaasBillingInvoice` writes comes from the same rule, so the free-tariff
        // refusal below weighs exactly the price the clinic would be charged.
        const targetTariffId = purchasedTariffId(row);
        const [targetTariff] = await tx.select({
          priceMinor: saasTariffs.priceMinor,
          billingPeriod: saasTariffs.billingPeriod,
          additionalSeatPriceMinor: saasTariffs.additionalSeatPriceMinor,
          currency: saasTariffs.currency,
        })
          .from(saasTariffs).where(and(eq(saasTariffs.id, targetTariffId), eq(saasTariffs.isActive, true))).limit(1);
        if (!targetTariff) throw new Error('saas_billing_tariff_not_billable');
        return {
          saasBillingSubscriptionId: row.id,
          currentTariffId: row.tariffId,
          purchasedTariffPriceMinor: targetTariff.priceMinor,
          tariffId: targetTariffId,
          billingPeriod: targetTariff.billingPeriod,
          savedPaymentMethodId: row.savedPaymentMethodId,
          additionalSeatPriceMinor: targetTariff.additionalSeatPriceMinor,
          currency: targetTariff.currency,
          currentPeriodEndsAt: row.currentPeriodEndsAt,
          currentPeriodStartsAt: row.currentPeriodStartsAt,
        };
      });
    },

    async listSaasBillingSubscriptionsDueForRenewal({ asOf, limit }) {
      const rows = await getDrizzle()
        .select({
          saasBillingSubscriptionId: saasBillingSubscriptions.id,
          organizationId: saasBillingSubscriptions.organizationId,
          tariffId: saasBillingSubscriptions.tariffId,
          pendingTariffId: saasBillingSubscriptions.pendingTariffId,
          currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
          savedPaymentMethodId: saasBillingSubscriptions.savedPaymentMethodId,
          autopayConsentedAt: saasBillingSubscriptions.autopayConsentedAt,
          autopayRevokedAt: saasBillingSubscriptions.autopayRevokedAt,
        })
        .from(saasBillingSubscriptions)
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
      if (rows.length === 0) return [];
      // Owner ruling 18.08.2026 — the tick charges for the tariff the next period will actually run
      // on, so the period length it computes comes from `purchasedTariffId` too, by the same rule
      // (and the same JS function) the invoice itself uses. A subscription whose purchased tariff
      // row is gone is skipped here exactly as the previous inner join skipped it.
      const purchasedIds = [...new Set(rows.map((row) => purchasedTariffId(row)))];
      const tariffRows = await getDrizzle()
        .select({ id: saasTariffs.id, billingPeriod: saasTariffs.billingPeriod })
        .from(saasTariffs)
        .where(inArray(saasTariffs.id, purchasedIds));
      const billingPeriodById = new Map(tariffRows.map((tariff) => [tariff.id, tariff.billingPeriod]));
      return rows.flatMap((row) => {
        const tariffId = purchasedTariffId(row);
        const billingPeriod = billingPeriodById.get(tariffId);
        if (billingPeriod === undefined) return [];
        return [
          {
            ...row,
            tariffId,
            billingPeriod,
            // `IS NOT NULL` filtered above; the column type stays nullable at the schema level.
            currentPeriodEndsAt: row.currentPeriodEndsAt as string,
          },
        ];
      });
    },

    async createSaasBillingRenewalInvoiceIfAbsent(input) {
      return getDrizzle().transaction(async (tx) => {
        const [subscription] = await tx
          .select({
            tariffId: saasBillingSubscriptions.tariffId,
            pendingTariffId: saasBillingSubscriptions.pendingTariffId,
            saasBillingAccountId: saasBillingSubscriptions.saasBillingAccountId,
            paidAdditionalSeats: saasBillingSubscriptions.paidAdditionalSeats,
          })
          .from(saasBillingSubscriptions)
          .where(
            and(
              eq(saasBillingSubscriptions.id, input.saasBillingSubscriptionId),
              eq(saasBillingSubscriptions.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!subscription) throw new Error('saas_billing_subscription_not_found');
        const invoiceTariffId = purchasedTariffId(subscription);
        const [authority] = await tx
          .select({
            tariffId: saasTariffs.id,
            tariffName: saasTariffs.name,
            amountMinor: saasTariffs.priceMinor,
            additionalSeatPriceMinor: saasTariffs.additionalSeatPriceMinor,
            currency: saasTariffs.currency,
            tariffBillingPeriod: saasTariffs.billingPeriod,
          })
          .from(saasTariffs)
          .where(and(eq(saasTariffs.id, invoiceTariffId), eq(saasTariffs.isActive, true)))
          .limit(1);
        if (!authority) throw new Error('saas_billing_subscription_not_found');
        if (authority.amountMinor === null || authority.currency === null) {
          throw new Error('saas_billing_tariff_not_billable');
        }
        if (subscription.paidAdditionalSeats > 0 && authority.additionalSeatPriceMinor === null) {
          throw new Error('saas_billing_additional_seat_price_missing');
        }
        const additionalSeatQuantity = subscription.paidAdditionalSeats;
        const amountMinor = authority.amountMinor + additionalSeatQuantity * (authority.additionalSeatPriceMinor ?? 0);

        const tariffSnapshot = await readTariffSnapshotForPeriod(tx, authority.tariffId);
        const [inserted] = await tx
          .insert(saasBillingInvoices)
          .values({
            organizationId: input.organizationId,
            saasBillingAccountId: subscription.saasBillingAccountId,
            saasBillingSubscriptionId: input.saasBillingSubscriptionId,
            tariffId: authority.tariffId,
            tariffName: authority.tariffName,
            invoiceKind: 'tariff_period',
            additionalSeatQuantity,
            amountMinor,
            currency: authority.currency,
            tariffBillingPeriod: authority.tariffBillingPeriod,
            tariffSnapshot,
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
            where: sql`${saasBillingInvoices.invoiceKind} = 'tariff_period'`,
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

    async promoteDueSaasBillingPaidInvoice({ organizationId, saasBillingSubscriptionId, asOf }) {
      return getDrizzle().transaction(async (tx) => {
        const [subscription] = await tx.select().from(saasBillingSubscriptions).where(and(
          eq(saasBillingSubscriptions.id, saasBillingSubscriptionId), eq(saasBillingSubscriptions.organizationId, organizationId),
        )).limit(1).for('update');
        if (!subscription?.currentPeriodEndsAt) return false;
        const [invoice] = await tx.select().from(saasBillingInvoices).where(and(
          eq(saasBillingInvoices.organizationId, organizationId),
          eq(saasBillingInvoices.saasBillingSubscriptionId, saasBillingSubscriptionId),
          eq(saasBillingInvoices.invoiceKind, 'tariff_period'),
          eq(saasBillingInvoices.status, 'paid'),
          eq(saasBillingInvoices.servicePeriodStartsAt, subscription.currentPeriodEndsAt),
          lte(saasBillingInvoices.servicePeriodStartsAt, asOf),
        )).limit(1).for('update');
        return invoice ? promotePaidInvoice(tx, invoice, organizationId) : false;
      });
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
        if (invoice.invoiceKind === 'seat_overage' && input.amountMinor !== invoice.amountMinor) {
          return { outcome: 'seat_overage_partial_refund_forbidden' as const };
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
      const result = await runWebappNamedRoot<{
          id: string;
          organization_id: string;
          saas_billing_invoice_id: string;
          amount_minor: number;
          currency: string;
          status: string;
          provider_id: string;
          provider_refund_ref: string | null;
          provider_idempotency_key: string;
          confirmed_at: Date | string | null;
          created_at: Date | string;
          updated_at: Date | string;
        }>(
        getWebappSqlDb(),
        'app.resolve_saas_billing_refund_for_webhook(text,text)',
        [providerId, providerRefundRef],
        sql`SELECT * FROM app.resolve_saas_billing_refund_for_webhook(${providerId}::text, ${providerRefundRef}::text)`,
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            organizationId: row.organization_id,
            saasBillingInvoiceId: row.saas_billing_invoice_id,
            amountMinor: row.amount_minor,
            currency: row.currency,
            status: row.status as SaasBillingRefund['status'],
            providerId: row.provider_id,
            providerRefundRef: row.provider_refund_ref,
            providerIdempotencyKey: row.provider_idempotency_key,
            confirmedAt: row.confirmed_at === null ? null : toIsoStringSafe(row.confirmed_at),
            createdAt: toIsoStringSafe(row.created_at),
            updatedAt: toIsoStringSafe(row.updated_at),
          }
        : null;
    },

    async confirmSaasBillingRefund({ saasBillingRefundId, organizationId, status, confirmedAt }) {
      return getDrizzle().transaction(async (tx) => {
        const [refundIdentity] = await tx.select({
          id: saasBillingRefunds.id,
          saasBillingInvoiceId: saasBillingRefunds.saasBillingInvoiceId,
        }).from(saasBillingRefunds).where(and(
          eq(saasBillingRefunds.id, saasBillingRefundId),
          eq(saasBillingRefunds.organizationId, organizationId),
        )).limit(1);
        if (!refundIdentity) throw new Error('saas_billing_refund_not_found');
        const [invoiceIdentity] = await tx.select({
          id: saasBillingInvoices.id,
          saasBillingSubscriptionId: saasBillingInvoices.saasBillingSubscriptionId,
        }).from(saasBillingInvoices).where(eq(saasBillingInvoices.id, refundIdentity.saasBillingInvoiceId)).limit(1);
        if (!invoiceIdentity) throw new Error('saas_billing_invoice_not_found');
        const [subscription] = await tx.select().from(saasBillingSubscriptions).where(eq(saasBillingSubscriptions.id, invoiceIdentity.saasBillingSubscriptionId)).limit(1).for('update');
        if (!subscription) throw new Error('saas_billing_subscription_not_found');
        const [invoice] = await tx.select().from(saasBillingInvoices).where(eq(saasBillingInvoices.id, invoiceIdentity.id)).limit(1).for('update');
        if (!invoice) throw new Error('saas_billing_invoice_not_found');
        const [refund] = await tx.select().from(saasBillingRefunds).where(eq(saasBillingRefunds.id, refundIdentity.id)).limit(1).for('update');
        if (!refund) throw new Error('saas_billing_refund_not_found');
        if (status === 'succeeded' && invoice.invoiceKind === 'seat_overage' && refund.amountMinor !== invoice.amountMinor) {
          throw new Error('saas_billing_seat_overage_partial_refund_forbidden');
        }
        const [row] = await tx.update(saasBillingRefunds).set({ status, confirmedAt, updatedAt: new Date().toISOString() })
          .where(and(eq(saasBillingRefunds.id, refund.id), eq(saasBillingRefunds.status, 'pending'))).returning();
        if (!row) return toSaasBillingRefund(refund);
        if (status === 'succeeded' && invoice.invoiceKind === 'seat_overage') {
          await tx.update(saasBillingSubscriptions).set({
            paidAdditionalSeats: sql`greatest(${saasBillingSubscriptions.paidAdditionalSeats} - ${invoice.additionalSeatQuantity}, 0)`,
            updatedAt: new Date().toISOString(),
          }).where(eq(saasBillingSubscriptions.id, subscription.id));
        }
        return toSaasBillingRefund(row);
      });
    },

    async grantSaasBillingAutopayConsent({ organizationId, consentText, consentedAt }) {
      const [row] = await getDrizzle()
        .update(saasBillingSubscriptions)
        .set({
          autopayConsentedAt: consentedAt,
          autopayConsentText: consentText,
          autopayRevokedAt: null,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(saasBillingSubscriptions.organizationId, organizationId),
            eq(saasBillingSubscriptions.source, 'paid_subscription'),
          ),
        )
        .returning({ id: saasBillingSubscriptions.id });
      return row ? ({ outcome: 'granted' as const }) : ({ outcome: 'no_subscription' as const });
    },

    async revokeSaasBillingAutopayConsent({ organizationId, revokedAt }) {
      const [row] = await getDrizzle()
        .update(saasBillingSubscriptions)
        .set({ autopayRevokedAt: revokedAt, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(saasBillingSubscriptions.organizationId, organizationId),
            eq(saasBillingSubscriptions.source, 'paid_subscription'),
          ),
        )
        .returning({ id: saasBillingSubscriptions.id });
      return row ? ({ outcome: 'revoked' as const }) : ({ outcome: 'no_subscription' as const });
    },

    async saveSaasBillingSubscriptionPaymentMethod(input) {
      const [row] = await getDrizzle()
        .update(saasBillingSubscriptions)
        .set({
          savedPaymentMethodId: input.savedPaymentMethodId,
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

    async markSaasBillingInvoiceFailed({ saasBillingInvoiceId, organizationId }) {
      // Same CAS shape as capture: only a `draft`/`pending` invoice can move
      // to `failed` — an already-`paid` row (a late failure notification for a charge that in fact
      // went through) or a `void` one must never be overwritten.
      const [row] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({ status: 'failed', updatedAt: new Date().toISOString() })
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

    async prepareSaasBillingFailedInvoiceForManualCheckout(input) {
      const [reopened] = await getDrizzle()
        .update(saasBillingInvoices)
        .set({
          status: 'draft',
          providerId: input.providerId,
          providerIdempotencyKey: input.providerIdempotencyKey,
          providerInvoiceRef: null,
          providerCheckoutUrl: null,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(saasBillingInvoices.id, input.saasBillingInvoiceId),
            eq(saasBillingInvoices.organizationId, input.organizationId),
            inArray(saasBillingInvoices.status, ['failed', 'void']),
          ),
        )
        .returning();
      if (reopened) return toSaasBillingInvoice(reopened);

      const [current] = await getDrizzle()
        .select()
        .from(saasBillingInvoices)
        .where(
          and(
            eq(saasBillingInvoices.id, input.saasBillingInvoiceId),
            eq(saasBillingInvoices.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      if (!current) throw new Error('saas_billing_invoice_not_found');
      return toSaasBillingInvoice(current);
    },
  };
}
