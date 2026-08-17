import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { beOrganizationMembers, beOrganizations } from '../../../db/schema/bookingEngine';
import { organizationMemberInvites } from '../../../db/schema/organizationMemberInvites';
import { saasBillingSubscriptions } from '../../../db/schema/saasBilling';
import { saasOrgEntitlementOverrides } from '../../../db/schema/saasEntitlements';

export type StockQuotaMechanic = 'patient_count' | 'branches' | 'files';
export type TransactionQuotaMechanic = StockQuotaMechanic | 'clinic_team';

export class StockQuotaReachedError extends Error {
  readonly mechanic: StockQuotaMechanic;

  constructor(mechanic: StockQuotaMechanic) {
    super(`saas_quota_reached:${mechanic}`);
    this.mechanic = mechanic;
  }
}

type StockQuota = { kind: 'numeric' | 'unlimited'; limit: number | null };

type EffectiveTariffRow = {
  quotas: Record<string, unknown>;
  included_seats: number | null;
  additional_seat_price_minor: number | null;
  currency: string | null;
};

export type StockQuotaDecision = 'allowed' | 'reached';

export type ClinicTeamQuotaDecision =
  | { allowed: true }
  | { allowed: false; code: 'seat_limit_reached' }
  | {
      allowed: false;
      code: 'seat_overage_confirmation_required';
      priceMinor: number;
      currency: string;
    };

function parseStockQuota(value: unknown): StockQuota | null {
  if (!value || typeof value !== 'object') return null;
  const quota = value as Record<string, unknown>;
  if (quota.kind !== 'numeric' && quota.kind !== 'unlimited') return null;
  return { kind: quota.kind, limit: typeof quota.limit === 'number' ? quota.limit : null };
}

/**
 * Pure decision shared by every numeric stock write after its transaction-scoped recount.
 *
 * Owner 18.08 (L-1): «ЛИБО ЛИМИТ ЛИБО БЕЗ ЛИМИТА для всех таких механик с лимитом». A ceiling
 * exists only where the tariff named a number; everything else — no quota key at all, an explicit
 * `unlimited`, or a row carrying no number — is «без лимита» and allows the write. Only a real
 * number refuses, and it refuses at exactly that number (so `limit: 0` permits nothing).
 */
export function decideStockQuota(input: {
  quota: unknown;
  used: number;
  increment: number;
}): StockQuotaDecision {
  const quota = parseStockQuota(input.quota);
  const limit = quota?.kind === 'numeric' ? quota.limit : null;
  if (limit === null) return 'allowed';
  return input.used + input.increment > limit ? 'reached' : 'allowed';
}

/** Pure decision shared by the transaction-scoped clinic-team seat recount. */
export function decideClinicTeamQuota(input: {
  includedSeats: number | null;
  paidAdditionalSeats: number;
  used: number;
  additionalSeatPriceMinor: number | null;
  currency: string | null;
}): ClinicTeamQuotaDecision {
  if (input.includedSeats === null) {
    return { allowed: false, code: 'seat_limit_reached' };
  }
  const limit = input.includedSeats + input.paidAdditionalSeats;
  if (input.used < limit) return { allowed: true };
  if (input.additionalSeatPriceMinor === null || input.currency === null) {
    return { allowed: false, code: 'seat_limit_reached' };
  }
  return {
    allowed: false,
    code: 'seat_overage_confirmation_required',
    priceMinor: input.additionalSeatPriceMinor,
    currency: input.currency,
  };
}

async function readEffectiveTariff(
  tx: WebappSqlExecutor,
  organizationId: string,
  tariffId: string | null,
): Promise<EffectiveTariffRow | null> {
  if (!tariffId) return null;
  const result = await tx.execute(sql`
    SELECT quotas, included_seats, additional_seat_price_minor, currency
    FROM app.saas_billing_effective_tariff_for_current_org(
      ${organizationId}::uuid,
      ${tariffId}::uuid
    )
  `);
  return (result.rows[0] as EffectiveTariffRow | undefined) ?? null;
}

async function readQuotaContext(tx: WebappSqlExecutor, organizationId: string, mechanic: string) {
  const [organization] = await tx
    .select({ tariffId: beOrganizations.tariffId })
    .from(beOrganizations)
    .where(eq(beOrganizations.id, organizationId))
    .limit(1);
  const [override] = await tx
    .select({ quota: saasOrgEntitlementOverrides.quota })
    .from(saasOrgEntitlementOverrides)
    .where(
      and(
        eq(saasOrgEntitlementOverrides.organizationId, organizationId),
        eq(saasOrgEntitlementOverrides.mechanic, mechanic),
        or(
          isNull(saasOrgEntitlementOverrides.expiresAt),
          gt(saasOrgEntitlementOverrides.expiresAt, sql`now()`),
        ),
      ),
    )
    .limit(1);
  const tariff = await readEffectiveTariff(tx, organizationId, organization?.tariffId ?? null);
  return { tariffId: organization?.tariffId ?? null, quota: override?.quota ?? tariff?.quotas[mechanic] };
}

async function readClinicTeamContext(tx: WebappSqlExecutor, organizationId: string) {
  const [organization] = await tx
    .select({ tariffId: beOrganizations.tariffId })
    .from(beOrganizations)
    .where(eq(beOrganizations.id, organizationId))
    .limit(1);
  const tariff = await readEffectiveTariff(tx, organizationId, organization?.tariffId ?? null);
  const [override] = await tx
    .select({ value: saasOrgEntitlementOverrides.seatLimitOverride })
    .from(saasOrgEntitlementOverrides)
    .where(
      and(
        eq(saasOrgEntitlementOverrides.organizationId, organizationId),
        eq(saasOrgEntitlementOverrides.mechanic, 'clinic_team'),
        or(
          isNull(saasOrgEntitlementOverrides.expiresAt),
          gt(saasOrgEntitlementOverrides.expiresAt, sql`now()`),
        ),
      ),
    )
    .limit(1);
  const [subscription] = await tx
    .select({ value: saasBillingSubscriptions.paidAdditionalSeats })
    .from(saasBillingSubscriptions)
    .where(
      and(
        eq(saasBillingSubscriptions.organizationId, organizationId),
        eq(saasBillingSubscriptions.source, 'paid_subscription'),
      ),
    )
    .limit(1);
  return {
    includedSeats: override?.value ?? tariff?.included_seats ?? null,
    paidAdditionalSeats: subscription?.value ?? 0,
    additionalSeatPriceMinor: tariff?.additional_seat_price_minor ?? null,
    currency: tariff?.currency ?? null,
  };
}

async function countClinicTeamUsage(
  tx: WebappSqlExecutor,
  organizationId: string,
  excludedPendingEmail: string | undefined,
): Promise<number> {
  const [activeSeats] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(beOrganizationMembers)
    .where(
      and(
        eq(beOrganizationMembers.organizationId, organizationId),
        eq(beOrganizationMembers.status, 'active'),
        sql`${beOrganizationMembers.specialistId} is not null`,
      ),
    );
  const [pendingInvites] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(organizationMemberInvites)
    .where(
      and(
        eq(organizationMemberInvites.organizationId, organizationId),
        eq(organizationMemberInvites.invitedRole, 'doctor'),
        eq(organizationMemberInvites.status, 'pending'),
        gt(organizationMemberInvites.expiresAt, sql`now()`),
        ...(excludedPendingEmail
          ? [ne(organizationMemberInvites.invitedEmail, excludedPendingEmail)]
          : []),
      ),
    );
  const [acceptedInvites] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(organizationMemberInvites)
    .innerJoin(
      beOrganizationMembers,
      eq(beOrganizationMembers.id, organizationMemberInvites.acceptedMembershipId),
    )
    .where(
      and(
        eq(organizationMemberInvites.organizationId, organizationId),
        eq(organizationMemberInvites.invitedRole, 'doctor'),
        eq(organizationMemberInvites.status, 'accepted'),
        eq(beOrganizationMembers.status, 'active'),
        isNull(beOrganizationMembers.specialistId),
      ),
    );
  return (
    Number(activeSeats?.value ?? 0) +
    Number(pendingInvites?.value ?? 0) +
    Number(acceptedInvites?.value ?? 0)
  );
}

export function createTransactionQuotaPort() {
  return {
    async withinLock<T>(
      tx: WebappSqlExecutor,
      input: { organizationId: string; mechanic: TransactionQuotaMechanic },
      execute: (scope: {
        assertStockAvailable(
          countUsage: () => Promise<number>,
          increment?: number,
        ): Promise<void>;
        resolveClinicTeamAvailability(input?: {
          excludedPendingEmail?: string;
        }): Promise<ClinicTeamQuotaDecision>;
      }) => Promise<T>,
    ): Promise<T> {
      const lockKey = input.mechanic === 'clinic_team'
        ? `clinic_invite_seats:${input.organizationId}`
        : `saas_quota:${input.mechanic}:${input.organizationId}`;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      return execute({
        async assertStockAvailable(countUsage, increment = 1) {
          const context = await readQuotaContext(tx, input.organizationId, input.mechanic);
          if (!context.tariffId) {
            throw new StockQuotaReachedError(input.mechanic as StockQuotaMechanic);
          }
          const decision = decideStockQuota({
            quota: context.quota,
            used: await countUsage(),
            increment,
          });
          if (decision === 'reached') {
            throw new StockQuotaReachedError(input.mechanic as StockQuotaMechanic);
          }
        },
        async resolveClinicTeamAvailability(options = {}) {
          const context = await readClinicTeamContext(tx, input.organizationId);
          return decideClinicTeamQuota({
            ...context,
            used: await countClinicTeamUsage(tx, input.organizationId, options.excludedPendingEmail),
          });
        },
      });
    },
  };
}

/** One transaction-aware quota resolver for every atomic stock and clinic-team writer. */
export const transactionQuotaPort = createTransactionQuotaPort();
