import type { SaasBillingOverview as SaasBillingOverviewData } from '@/modules/saas-billing/ports';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
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
import { Badge } from '@/shared/ui/doctor/primitives/badge';

const SUBSCRIPTION_STATUS_LABELS = {
  pending_payment: 'Ожидает оплаты',
  active: 'Активна',
  expired: 'Истекла',
  cancelled: 'Отменена',
} as const;

const SUBSCRIPTION_SOURCE_LABELS = {
  manual: 'Назначена вручную',
  paid_subscription: 'Платная подписка',
} as const;

const LIFECYCLE_LABELS = {
  active: 'Активна',
  grace: 'Льготный период',
  read_only: 'Только чтение',
  blocked: 'Заблокирована',
} as const;

const INVOICE_STATUS_LABELS = {
  draft: 'Черновик',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
  void: 'Аннулирован',
} as const;

const INVOICE_KIND_LABELS = {
  tariff_period: 'Тарифный период',
  seat_overage: 'Дополнительные места',
} as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatAmount(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${new Intl.NumberFormat('ru-RU').format(amountMinor / 100)} ${currency}`;
  }
}

function formatPeriod(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt || !endsAt) return null;
  return `${formatDate(startsAt)} — ${formatDate(endsAt)}`;
}

export function SaasBillingOverview({
  billing,
  showProviderEvents = false,
}: {
  billing: SaasBillingOverviewData;
  showProviderEvents?: boolean;
}) {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Биллинг</DoctorSectionTitle>
      </DoctorSectionHeader>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Подписки</h3>
        {billing.subscriptions.length === 0 ? (
          <DoctorEmptyState size="xs">Данных о подписках пока нет.</DoctorEmptyState>
        ) : (
          <ul aria-label="Подписки" className={doctorDnaFlatListClass}>
            {billing.subscriptions.map((subscription) => {
              const period = formatPeriod(
                subscription.currentPeriodStartsAt,
                subscription.currentPeriodEndsAt,
              );
              return (
                <li
                  key={subscription.id}
                  className={`${doctorDnaFlatListRowClass} items-start justify-between gap-3`}
                >
                  <span>
                    <span className={doctorDnaFlatListPrimaryClass}>
                      {SUBSCRIPTION_SOURCE_LABELS[subscription.source]}
                    </span>
                    <span className={doctorDnaFlatListMetaClass}>
                      {period ? `Период: ${period}` : 'Период не задан'}
                      {subscription.providerId ? ` · ${subscription.providerId}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    <Badge variant="outline">
                      {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                    </Badge>
                    <Badge variant="secondary">
                      {LIFECYCLE_LABELS[subscription.lifecycleState]}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Счета</h3>
        {billing.invoices.length === 0 ? (
          <DoctorEmptyState size="xs">Счетов пока нет.</DoctorEmptyState>
        ) : (
          <ul aria-label="Счета" className={doctorDnaFlatListClass}>
            {billing.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className={`${doctorDnaFlatListRowClass} items-start justify-between gap-3`}
              >
                <span>
                  <span className={doctorDnaFlatListPrimaryClass}>
                    {INVOICE_KIND_LABELS[invoice.invoiceKind]}
                  </span>
                  <span className={doctorDnaFlatListMetaClass}>
                    {invoice.invoiceKind === 'seat_overage'
                      ? `${invoice.additionalSeatQuantity} ${invoice.additionalSeatQuantity === 1 ? 'место' : 'места'}`
                      : invoice.tariffName}
                    {' · '}
                    {formatDate(invoice.servicePeriodStartsAt)} — {formatDate(invoice.servicePeriodEndsAt)}
                    {' · '}
                    {invoice.providerId}
                  </span>
                  {/* Плательщик обязан видеть, откуда в счёте выросшая сумма: долг за место с
                      прошлого периода входит сюда строкой (решение владельца 19.08). */}
                  {invoice.carriedDebtMinor > 0 ? (
                    <span className={doctorDnaFlatListMetaClass}>
                      Включён долг за места с прошлого периода:{' '}
                      {formatAmount(invoice.carriedDebtMinor, invoice.currency)}
                    </span>
                  ) : null}
                </span>
                <span className="text-right">
                  <span className="block text-sm font-medium text-foreground">
                    {formatAmount(invoice.amountMinor, invoice.currency)}
                  </span>
                  <Badge variant={invoice.status === 'failed' ? 'destructive' : 'outline'}>
                    {invoice.status === 'void' && invoice.supersededByInvoiceId
                      ? 'Перевыставлен'
                      : INVOICE_STATUS_LABELS[invoice.status]}
                  </Badge>
                  {(invoice.status === 'draft' || invoice.status === 'pending') && invoice.providerCheckoutUrl ? (
                    <a className="mt-1 block text-sm text-primary underline" href={invoice.providerCheckoutUrl}>
                      Оплатить
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showProviderEvents ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">События провайдера</h3>
          {billing.providerEvents.length === 0 ? (
            <DoctorEmptyState size="xs">Событий провайдера пока нет.</DoctorEmptyState>
          ) : (
            <ul aria-label="События провайдера" className={doctorDnaFlatListClass}>
              {billing.providerEvents.map((event) => (
                <li
                  key={event.id}
                  className={`${doctorDnaFlatListRowClass} items-start justify-between gap-3`}
                >
                  <span>
                    <span className={doctorDnaFlatListPrimaryClass}>{event.eventType}</span>
                    <span className={doctorDnaFlatListMetaClass}>
                      {event.providerId} · {event.providerEventId} · {formatDate(event.createdAt)}
                    </span>
                  </span>
                  <Badge variant={event.processedAt ? 'secondary' : 'outline'}>
                    {event.processedAt ? 'Обработано' : 'Ожидает обработки'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </DoctorSection>
  );
}
