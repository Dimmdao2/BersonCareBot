import Link from 'next/link';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { cn } from '@/lib/utils';
import {
  DoctorSection,
  DoctorSectionActions,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import type { OrgQuotaProjection, TariffQuotaMap } from '@/modules/org-entitlements/types';
import type { SaasBillingOverview } from '@/modules/saas-billing/ports';
import { SaasBillingOverview as SaasBillingOverviewSection } from '@/shared/ui/doctor/SaasBillingOverview';
import type { ClinicTariffChangeState } from './PayTariffButton';
import { AutopayToggleButton } from './AutopayToggleButton';
import { CancelSubscriptionButton } from './CancelSubscriptionButton';
import { StorageSpaceBlock, type ClinicStorageOffers } from './StorageSpaceBlock';
import { formatQuotaValue, QUOTA_THRESHOLD_LABEL } from './billingQuotaFormat';
import { TariffDetailsModal } from './TariffDetailsModal';

type Props = {
  /** `null` when the organization genuinely has no tariff assigned (own tariff, not the resolver's default). */
  tariffName: string | null;
  /** Human sentence from `describeCommercialAccessState` — never the raw enum. */
  commercialStateLabel: string;
  /**
   * §5a stage 6.1 — "использовано из включённого" per number (patients, branches, file storage,
   * specialist seats), from `resolveOwnOrgQuotaProjections`. A mechanic without a configured
   * numeric limit or without a real usage figure simply does not appear here — never a synthetic 0.
   */
  quotaUsage: Array<OrgQuotaProjection & { label: string }>;
  /** Real rows from `saas_billing_*`; empty arrays mean no billing data, never synthetic zeroes. */
  billing: SaasBillingOverview;
  tariffChange: ClinicTariffChangeState;
  tariffDetails: {
    mechanics: Record<string, boolean>;
    quotas: TariffQuotaMap;
    includedSeats: number | null;
  } | null;
  /**
   * Витрина докупки объёма — тот же состав, что отдаёт `GET /api/clinic/billing`, включая
   * котировку у каждой продаваемой цены. Цены без подписи здесь нет по построению.
   */
  storage: ClinicStorageOffers;
};

/**
 * Read-only «Тариф и биллинг» account block. Defect #2 2026-07-25: this used to always render a hardcoded
 * "connect a tariff" sentence regardless of what the organization actually has. No tariff-change
 * UI here by design — that stays with the platform administrator.
 */
export function BillingSection({
  tariffName,
  commercialStateLabel,
  quotaUsage,
  billing,
  tariffChange,
  tariffDetails,
  storage,
}: Props) {
  // Объём файлов уезжает из общего списка чисел в свой блок ниже: там у него полоса заполнения,
  // купленный пакет и обе кнопки. Оставить строку и здесь означало бы показать одно и то же число
  // дважды на одной вкладке — и однажды разойтись с самим собой.
  const storageFill = quotaUsage.find((row) => row.mechanic === 'files') ?? null;
  const otherQuotaUsage = quotaUsage.filter((row) => row.mechanic !== 'files');
  const paidSubscription =
    billing.subscriptions.find((row) => row.source === 'paid_subscription') ?? null;
  // Решение владельца 18.08 (L-11): выбранный, но не оплаченный тариф не действует, поэтому
  // `tariffName` (действующий тариф из снимка прав) здесь пуст. Имя показываем из самого выбора —
  // иначе клиника не видит, что именно она выбрала и за что ей платить.
  const chosenUnpaidTariffName = tariffChange.awaitingFirstPayment
    ? (tariffChange.choices.find((choice) => choice.id === tariffChange.currentTariffId)?.name ??
      null)
    : null;
  const needsFirstTariffChoice =
    tariffChange.currentTariffId === null && tariffChange.choices.length > 0;
  const displayedTariffName = tariffName ?? chosenUnpaidTariffName ?? 'Тариф не назначен';
  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Тариф и биллинг</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Тариф</span>
          <span className="text-right font-medium text-foreground">{displayedTariffName}</span>
        </div>
        {/* Состояние доступа. Пока выбранный тариф не оплачен, `commercialStateLabel` сказал бы
            «Тариф не назначен … выберите тариф в админке» — это отправило бы клинику к
            администратору платформы вместо кассы. Счёт здесь ещё не выставлен: его создаёт кнопка
            оплаты ниже, поэтому обещать выставленный счёт нельзя. */}
        <p className="text-sm text-muted-foreground">
          {chosenUnpaidTariffName
            ? 'Тариф выбран, но не оплачен — доступ откроется после оплаты.'
            : needsFirstTariffChoice
              ? 'Выберите тариф ниже и оплатите его — доступ откроется после оплаты.'
              : commercialStateLabel}
        </p>
        <DoctorSectionActions>
          {tariffDetails ? (
            <TariffDetailsModal tariffName={displayedTariffName} details={tariffDetails} />
          ) : null}
          <Link
            href="/app/settings/tariffs"
            className={cn(
              buttonVariants({ size: 'sm', variant: 'outline' }),
              'h-9 w-fit rounded-[var(--doctor-button-radius,8px)] bg-[var(--doctor-page-gap-background,var(--bc-canvas,#f2f2f0))]',
            )}
          >
            Изменить тариф
          </Link>
        </DoctorSectionActions>
        {tariffName !== null && (
          <>
            <AutopayToggleButton subscription={paidSubscription} />
            <CancelSubscriptionButton subscription={paidSubscription} />
          </>
        )}

        {otherQuotaUsage.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Использовано из включённого</p>
            <ul aria-label="Числа тарифа" className={doctorDnaFlatListClass}>
              {otherQuotaUsage.map((row) => (
                <li
                  key={row.mechanic}
                  className={`${doctorDnaFlatListRowClass} justify-between gap-2`}
                >
                  <span className={doctorDnaFlatListPrimaryClass}>{row.label}</span>
                  <span className={doctorDnaFlatListMetaClass}>
                    {formatQuotaValue(row.usage, row.quota.unit)} из{' '}
                    {formatQuotaValue(row.quota.limit, row.quota.unit)}
                    {QUOTA_THRESHOLD_LABEL[row.threshold] && (
                      <Badge
                        variant={row.threshold === 'reached' ? 'destructive' : 'outline'}
                        className="ml-2"
                      >
                        {QUOTA_THRESHOLD_LABEL[row.threshold]}
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Владелец 10.09: докупка места «должна быть у всех» — блок не различает композиции и
            рендерится всегда, в отличие от строк про места специалистов. */}
        <StorageSpaceBlock
          fill={storageFill}
          offers={storage}
          releaseScheduled={paidSubscription?.storagePackageCancelAtPeriodEnd ?? false}
        />
      </DoctorSection>
      <SaasBillingOverviewSection billing={billing} />
    </>
  );
}
