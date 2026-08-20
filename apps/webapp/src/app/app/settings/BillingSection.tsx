import { Badge } from '@/shared/ui/doctor/primitives/badge';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import type { OrgMechanic } from '@/modules/org-entitlements/types';
import type { OrgQuotaProjection } from '@/modules/org-entitlements/types';
import type { SaasBillingOverview } from '@/modules/saas-billing/ports';
import { SaasBillingOverview as SaasBillingOverviewSection } from '@/shared/ui/doctor/SaasBillingOverview';
import { PayTariffButton, type ClinicTariffChangeState } from './PayTariffButton';
import { AutopayToggleButton } from './AutopayToggleButton';

export type BillingMechanicRow = {
  mechanic: OrgMechanic;
  label: string;
  enabled: boolean;
};

/** §5a stage 6.1 — bytes are the only non-count unit today; everything else is a plain number. */
function formatQuotaValue(value: number, unit: OrgQuotaProjection['quota']['unit']): string {
  if (unit !== 'bytes') return String(value);
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

const THRESHOLD_LABEL: Record<OrgQuotaProjection['threshold'], string> = {
  below_warning: '',
  warning: 'Приближается к пределу',
  reached: 'Предел достигнут',
};

type Props = {
  /** `null` when the organization genuinely has no tariff assigned (own tariff, not the resolver's default). */
  tariffName: string | null;
  /** Human sentence from `describeCommercialAccessState` — never the raw enum. */
  commercialStateLabel: string;
  /** Every canonical mechanic (`MECHANICS`), resolved through `resolveOrgEntitlements`/`entitlementsFromSnapshot`. */
  mechanics: BillingMechanicRow[];
  /**
   * §5a stage 6.1 — "использовано из включённого" per number (patients, branches, file storage,
   * specialist seats), from `resolveOwnOrgQuotaProjections`. A mechanic without a configured
   * numeric limit or without a real usage figure simply does not appear here — never a synthetic 0.
   */
  quotaUsage: Array<OrgQuotaProjection & { label: string }>;
  /** Real rows from `saas_billing_*`; empty arrays mean no billing data, never synthetic zeroes. */
  billing: SaasBillingOverview;
  tariffChange: ClinicTariffChangeState;
};

/**
 * Read-only «Тариф и биллинг» tab. Defect #2 2026-07-25: this used to always render a hardcoded
 * "connect a tariff" sentence regardless of what the organization actually has. No tariff-change
 * UI here by design — that stays with the platform administrator.
 */
export function BillingSection({
  tariffName,
  commercialStateLabel,
  mechanics,
  quotaUsage,
  billing,
  tariffChange,
}: Props) {
  // Решение владельца 18.08 (L-11): выбранный, но не оплаченный тариф не действует, поэтому
  // `tariffName` (действующий тариф из снимка прав) здесь пуст. Имя показываем из самого выбора —
  // иначе клиника не видит, что именно она выбрала и за что ей платить.
  const chosenUnpaidTariffName = tariffChange.awaitingFirstPayment
    ? tariffChange.choices.find((choice) => choice.id === tariffChange.currentTariffId)?.name ?? null
    : null;
  const needsFirstTariffChoice = tariffChange.currentTariffId === null && tariffChange.choices.length > 0;
  return (
    <>
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Тариф и биллинг</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Тариф</span>
          <span className="text-right font-medium text-foreground">
            {tariffName ?? chosenUnpaidTariffName ?? 'Тариф не назначен'}
          </span>
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
        {/* Выбор тарифа и оплата живут в одном элементе, поэтому он рендерится всегда: клинику без
            действующего тарифа нельзя оставить на экране, где не выбрать и не оплатить. */}
        <PayTariffButton tariffChange={tariffChange} billingEmail={billing.billingEmail} />
        {tariffName !== null && (
          <AutopayToggleButton
            subscription={
              billing.subscriptions.find((row) => row.source === 'paid_subscription') ?? null
            }
          />
        )}

        {quotaUsage.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Использовано из включённого</p>
            <ul aria-label="Числа тарифа" className={doctorDnaFlatListClass}>
              {quotaUsage.map((row) => (
                <li
                  key={row.mechanic}
                  className={`${doctorDnaFlatListRowClass} justify-between gap-2`}
                >
                  <span className={doctorDnaFlatListPrimaryClass}>{row.label}</span>
                  <span className={doctorDnaFlatListMetaClass}>
                    {formatQuotaValue(row.usage, row.quota.unit)} из{' '}
                    {formatQuotaValue(row.quota.limit, row.quota.unit)}
                    {THRESHOLD_LABEL[row.threshold] && (
                      <Badge
                        variant={row.threshold === 'reached' ? 'destructive' : 'outline'}
                        className="ml-2"
                      >
                        {THRESHOLD_LABEL[row.threshold]}
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Что доступно клинике</p>
          <ul aria-label="Механики тарифа" className={doctorDnaFlatListClass}>
            {mechanics.map((row) => (
              <li
                key={row.mechanic}
                className={`${doctorDnaFlatListRowClass} justify-between gap-2`}
              >
                <span className={doctorDnaFlatListPrimaryClass}>{row.label}</span>
                <span className={doctorDnaFlatListMetaClass}>
                  <Badge variant={row.enabled ? 'secondary' : 'outline'}>
                    {row.enabled ? 'Включено' : 'Недоступно'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </DoctorSection>
      <SaasBillingOverviewSection billing={billing} />
    </>
  );
}
