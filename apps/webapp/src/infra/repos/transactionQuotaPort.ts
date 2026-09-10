import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { beOrganizationMembers, beOrganizations } from '../../../db/schema/bookingEngine';
import { organizationMemberInvites } from '../../../db/schema/organizationMemberInvites';
import { saasBillingSubscriptions } from '../../../db/schema/saasBilling';
import {
  saasOrgEntitlementOverrides,
  saasStoragePackagePeriodPrices,
  saasStoragePackages,
} from '../../../db/schema/saasEntitlements';
import { fileQuotaWithPurchasedStorage } from '@/modules/org-entitlements/service';
import type { TariffQuota } from '@/modules/org-entitlements/types';
import { billableAdditionalSeats } from '@/modules/saas-billing/proration';
import { decideSeatOverage, type SeatOverageOffer } from '@/modules/saas-billing/seatOverage';
import {
  decideStoragePackagePurchase,
  decideStoragePackageRelease,
  type StoragePackagePeriodPricing,
  type StoragePackagePurchaseOffer,
  type StoragePackageReleaseDecision,
} from '@/modules/saas-billing/storagePackage';

export type StockQuotaMechanic = 'branches' | 'files';
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

/**
 * Байты докупленного пакета объёма — читаются под тем же замком и в той же транзакции, что и сама
 * проверка записи, чтобы покупка и загрузка не увидели разный потолок. Ссылка на каталог, а не
 * скопированное число (см. `saas_billing_subscriptions.paid_storage_package_id`).
 */
async function readPurchasedStorageBytes(
  tx: WebappSqlExecutor,
  organizationId: string,
): Promise<number> {
  const [row] = await tx
    .select({ bytes: saasStoragePackages.bytes })
    .from(saasBillingSubscriptions)
    .innerJoin(
      saasStoragePackages,
      eq(saasStoragePackages.id, saasBillingSubscriptions.paidStoragePackageId),
    )
    .where(
      and(
        eq(saasBillingSubscriptions.organizationId, organizationId),
        eq(saasBillingSubscriptions.source, 'paid_subscription'),
      ),
    )
    .limit(1);
  return Number(row?.bytes ?? 0);
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
  const configured = override?.quota ?? tariff?.quotas[mechanic];
  return {
    tariffId: organization?.tariffId ?? null,
    // Потолок БЕЗ докупленного пакета — то, что останется, если пакет не продлить. Отдельного
    // чтения для этого нет: и «сколько можно занять сейчас», и «сколько останется без пакета»
    // приходят из одного и того же `configured`, поэтому разойтись им негде.
    configuredQuota: configured,
    // Владелец 10.09.2026: докупленный пакет поднимает потолок объёма. Складывает его с тарифом ТА
    // ЖЕ функция, что и экран «использовано из включённого» — второго правила сложения нет.
    quota:
      mechanic === 'files'
        ? fileQuotaWithPurchasedStorage(
            configured as TariffQuota | undefined,
            await readPurchasedStorageBytes(tx, organizationId),
          )
        : configured,
  };
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
    .select({
      value: saasBillingSubscriptions.paidAdditionalSeats,
      currentPeriodStartsAt: saasBillingSubscriptions.currentPeriodStartsAt,
      currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
    })
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
    currentPeriodStartsAt: subscription?.currentPeriodStartsAt ?? null,
    currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
  };
}

/**
 * Вход двери продажи объёма — тот же приём, что у `readClinicTeamContext` выше: здесь только сбор
 * данных, решение принимает `modules/saas-billing/storagePackage.ts`.
 *
 * Цена пакета берётся за ПЕРИОД ПОДПИСКИ организации, а не «за месяц»: докупка живёт внутри
 * периода основного тарифа и кончается вместе с ним, поэтому у годовой подписки она стоит годовую
 * цену пакета. Нет строки в матрице для этой пары — пакет за этот период не продаётся, и дверь
 * ответит `not_sold`, а не посчитает цену «примерно».
 */
async function readStoragePackageContext(tx: WebappSqlExecutor, organizationId: string) {
  const [organization] = await tx
    .select({ tariffId: beOrganizations.tariffId })
    .from(beOrganizations)
    .where(eq(beOrganizations.id, organizationId))
    .limit(1);
  const tariff = await readEffectiveTariff(tx, organizationId, organization?.tariffId ?? null);
  const [subscription] = await tx
    .select({
      paidStoragePackageId: saasBillingSubscriptions.paidStoragePackageId,
      billingPeriodCode: saasBillingSubscriptions.billingPeriodCode,
      currentPeriodStartsAt: saasBillingSubscriptions.currentPeriodStartsAt,
      currentPeriodEndsAt: saasBillingSubscriptions.currentPeriodEndsAt,
    })
    .from(saasBillingSubscriptions)
    .where(
      and(
        eq(saasBillingSubscriptions.organizationId, organizationId),
        eq(saasBillingSubscriptions.source, 'paid_subscription'),
      ),
    )
    .limit(1);

  // Читается ВЕСЬ каталог, а не только запрошенный пакет: тот же снимок отвечает и на «почём этот»,
  // и на «что вообще можно купить», поэтому цена на экране и цена в счёте не могут разъехаться —
  // они из одного чтения под одним замком. Снятые с продажи строки приходят тоже: у клиники может
  // действовать пакет, который платформа уже не продаёт, и его размер всё равно нужен для расчёта
  // доплаты за переход.
  const rows = await tx
    .select({
      packageId: saasStoragePackages.id,
      name: saasStoragePackages.name,
      bytes: saasStoragePackages.bytes,
      isActive: saasStoragePackages.isActive,
      currency: saasStoragePackages.currency,
      sortOrder: saasStoragePackages.sortOrder,
      priceMinor: saasStoragePackagePeriodPrices.priceMinor,
    })
    .from(saasStoragePackages)
    .leftJoin(
      saasStoragePackagePeriodPrices,
      and(
        eq(saasStoragePackagePeriodPrices.packageId, saasStoragePackages.id),
        eq(saasStoragePackagePeriodPrices.billingPeriodCode, subscription?.billingPeriodCode ?? ''),
      ),
    )
    .where(
      or(
        eq(saasStoragePackages.isActive, true),
        subscription?.paidStoragePackageId
          ? eq(saasStoragePackages.id, subscription.paidStoragePackageId)
          : sql`false`,
      ),
    )
    .orderBy(saasStoragePackages.sortOrder, saasStoragePackages.bytes);
  const packages = rows.map((row) => ({
    name: row.name,
    sortOrder: row.sortOrder,
    pricing: {
      packageId: row.packageId,
      bytes: Number(row.bytes),
      priceMinor: row.priceMinor ?? null,
      currency: row.currency,
      isActive: row.isActive,
    } satisfies StoragePackagePeriodPricing,
  }));
  const byId = new Map(packages.map((row) => [row.pricing.packageId, row.pricing]));

  return {
    packages,
    current: subscription?.paidStoragePackageId
      ? (byId.get(subscription.paidStoragePackageId) ?? null)
      : null,
    packageById: byId,
    tariffCurrency: tariff?.currency ?? null,
    currentPeriodStartsAt: subscription?.currentPeriodStartsAt ?? null,
    currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
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
        assertStockAvailable(countUsage: () => Promise<number>, increment?: number): Promise<void>;
        resolveClinicTeamAvailability(input?: {
          excludedPendingEmail?: string;
        }): Promise<SeatOverageOffer>;
        resolveBillableAdditionalSeats(paidAdditionalSeats: number): Promise<number>;
        resolveStoragePackagePurchase(
          targetPackageId: string,
        ): Promise<StoragePackagePurchaseOffer>;
        resolveStoragePackageOffers(): Promise<{
          currentPackageId: string | null;
          currentPeriodEndsAt: string | null;
          packages: {
            packageId: string;
            name: string;
            bytes: number;
            isActive: boolean;
            offer: StoragePackagePurchaseOffer;
          }[];
        }>;
        resolveStoragePackageRelease(): Promise<StoragePackageReleaseDecision>;
      }) => Promise<T>,
    ): Promise<T> {
      const lockKey =
        input.mechanic === 'clinic_team'
          ? `clinic_invite_seats:${input.organizationId}`
          : `saas_quota:${input.mechanic}:${input.organizationId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
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
        /**
         * ЕДИНСТВЕННЫЙ вход к решению «можно ли продать место и почём» — и дверь приглашения, и
         * дверь покупки идут сюда, под тем же замком организации. Само решение живёт в
         * `modules/saas-billing/seatOverage.ts`; здесь только сбор входных данных.
         *
         * Настроенного срока счёта здесь больше нет: Р-19 отменил «счёт живёт длительность от
         * выставления» вместе с перевыставлением целиком — у счёта за место остался один срок,
         * конец периода, а дальше работает перенос долга (Р-18). Часового пояса здесь тоже нет:
         * в действующей редакции Р-15 суток в расчёте нет, все моменты абсолютные.
         */
        async resolveClinicTeamAvailability(options = {}) {
          const context = await readClinicTeamContext(tx, input.organizationId);
          return decideSeatOverage({
            ...context,
            used: await countClinicTeamUsage(
              tx,
              input.organizationId,
              options.excludedPendingEmail,
            ),
            asOf: new Date().toISOString(),
          });
        },
        /**
         * How many paid seats the NEXT period actually bills. Same lock and same usage count as
         * the purchase door above, so a seat bought and a seat billed can never be counted by two
         * different rules. `paidAdditionalSeats` is passed in by the caller, which already holds
         * the subscription row `FOR UPDATE`.
         */
        async resolveBillableAdditionalSeats(paidAdditionalSeats) {
          const context = await readClinicTeamContext(tx, input.organizationId);
          return billableAdditionalSeats({
            includedSeats: context.includedSeats,
            paidAdditionalSeats,
            activeSeatsUsed: await countClinicTeamUsage(tx, input.organizationId, undefined),
          });
        },
        /**
         * ЕДИНСТВЕННЫЙ вход к решению «можно ли продать объём и почём» — и экран цены, и дверь
         * покупки идут сюда, под замком той же механики `files`, под которым считается занятое
         * место. Само решение живёт в `modules/saas-billing/storagePackage.ts`; здесь только сбор
         * входных данных, как у мест.
         */
        async resolveStoragePackagePurchase(targetPackageId) {
          const context = await readStoragePackageContext(tx, input.organizationId);
          const target = context.packageById.get(targetPackageId);
          // Пакета нет в каталоге вовсе — продавать нечего; отдельного исхода у двери для этого
          // нет, потому что для покупателя «нет такого пакета» и «не продаётся» неразличимы.
          if (!target) return { outcome: 'not_sold' as const };
          return decideStoragePackagePurchase({
            current: context.current,
            target,
            tariffCurrency: context.tariffCurrency,
            currentPeriodStartsAt: context.currentPeriodStartsAt,
            currentPeriodEndsAt: context.currentPeriodEndsAt,
            asOf: new Date().toISOString(),
          });
        },
        /**
         * Витрина: КАЖДЫЙ пакет каталога со своим предложением, посчитанным ТОЙ ЖЕ дверью и в том
         * же чтении, что и цена в счёте. Отдельного «расчёта для экрана» не существует — именно
         * поэтому показанная цена и списанная сумма не могут разойтись.
         */
        async resolveStoragePackageOffers() {
          const context = await readStoragePackageContext(tx, input.organizationId);
          const asOf = new Date().toISOString();
          return {
            currentPackageId: context.current?.packageId ?? null,
            currentPeriodEndsAt: context.currentPeriodEndsAt,
            packages: context.packages.map((row) => ({
              packageId: row.pricing.packageId,
              name: row.name,
              bytes: row.pricing.bytes,
              isActive: row.pricing.isActive,
              offer: decideStoragePackagePurchase({
                current: context.current,
                target: row.pricing,
                tariffCurrency: context.tariffCurrency,
                currentPeriodStartsAt: context.currentPeriodStartsAt,
                currentPeriodEndsAt: context.currentPeriodEndsAt,
                asOf,
              }),
            })),
          };
        },
        /**
         * ЕДИНСТВЕННЫЙ вход к решению «можно ли сейчас отказаться от пакета» — под тем же замком
         * механики `files`, что и покупка и загрузка файла. Владелец 10.09: «пока он места не
         * освободит, этого не может произойти — отказ на отключение доппакета». Занятое берётся
         * ровно там же, откуда его берёт экран «использовано из включённого», — из общего шва
         * учёта (владелец 10.09: «всё что загружено в аккаунт», «никаких разделений при подсчёте
         * нигде быть не должно»), а не из отдельного подсчёта «для отказа».
         */
        async resolveStoragePackageRelease() {
          const context = await readStoragePackageContext(tx, input.organizationId);
          const quota = await readQuotaContext(tx, input.organizationId, 'files');
          const usage = await tx.execute(sql`
            SELECT organization_id::text AS organization_id, files_used
            FROM app.read_current_org_tariff_transition_usage()
          `);
          const usageRow = usage.rows[0] as
            | { organization_id: string; files_used: number | string }
            | undefined;
          // Шов выводит организацию из принципала сам; расхождение означает, что решение считают
          // не про ту клинику, и молчать об этом нельзя.
          if (!usageRow || usageRow.organization_id !== input.organizationId) {
            throw new Error('own_tariff_transition_usage_context_denied');
          }
          const limitWithoutPackage = parseStockQuota(quota.configuredQuota);
          return decideStoragePackageRelease({
            current: context.current,
            limitWithoutPackageBytes:
              limitWithoutPackage?.kind === 'numeric' ? limitWithoutPackage.limit : null,
            usedBytes: Number(usageRow.files_used ?? 0),
            currentPeriodEndsAt: context.currentPeriodEndsAt,
          });
        },
      });
    },
  };
}

/** One transaction-aware quota resolver for every atomic stock and clinic-team writer. */
export const transactionQuotaPort = createTransactionQuotaPort();
