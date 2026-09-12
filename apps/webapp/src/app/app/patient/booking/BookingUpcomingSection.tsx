'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/shared/ui/patient/primitives/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/ui/patient/primitives/collapsible';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import {
  formatBookingDateTimeMediumRu,
  parseBusinessInstant,
} from '@/shared/lib/formatBusinessDateTime';
import { resolveAppointmentTimeZone } from '@/shared/lib/appointmentZoneOffset';
import {
  classifyPaymentIntentStatus,
  classifyPrepaymentBookingStatus,
  type BookingPaymentStatusOk,
} from '@/shared/lib/paymentStatusView';
import { AppointmentZoneOffsetWarning } from '@/shared/ui/patient/AppointmentZoneOffsetWarning';
import { usePatientTerms } from '@/shared/ui/patient/organization/PatientOrganizationContext';
import { PatientModal } from '@/shared/ui/patient/PatientModal';
import { PaymentLinkQrCode } from '@/shared/ui/patient/PaymentLinkQrCode';
import { CabinetBookingActions } from '@/app/app/patient/cabinet/CabinetBookingActions';
import {
  bookingProvenancePrefix,
  nativeBookingSubtitle,
} from '@/app/app/patient/cabinet/patientBookingLabels';
import { cn } from '@/lib/utils';
import { AppointmentReminderPreference } from './AppointmentReminderPreference';
import {
  patientActionTextClass,
  patientBodyTextClass,
  patientCaptionTextClass,
  patientCompactActionClass,
  patientInlineLinkClass,
  patientListItemClass,
  patientModalPortalPrimaryCtaClass,
  patientMutedTextClass,
  patientSecondaryActionClass,
  patientSectionTitleClass,
  patientSurfaceWarningClass,
} from '@/shared/ui/patient/patientVisual';

/** Тон секции «Предстоящие записи» — без фиксированной высоты. */
const bookingReminderSectionSurfaceClass = cn(
  'flex flex-col gap-3 overflow-hidden rounded-[var(--patient-card-radius-mobile)] border border-[var(--patient-action-warning-border)]',
  'bg-[linear-gradient(135deg,#fffaf0_0%,#fff7df_100%)]',
  'p-4 md:rounded-[var(--patient-card-radius-desktop)] md:p-[18px]',
);

/**
 * Тело успеха берём ОБЩИМ типом маршрута, а не локальным описанием: аудит S9 показал, во что
 * обходится своя копия формы — экран молча остаётся без суммы и кнопки, а `typecheck` при этом
 * зелёный. Здесь `Partial`, потому что это сетевой ответ, а не значение из нашего кода.
 */
type PaymentStatusResponse = Partial<BookingPaymentStatusOk> & { ok?: boolean };

type PaymentView = {
  loaded: boolean;
  failedToLoad: boolean;
  amountMinor: number | null;
  currency: string;
  checkoutUrl: string | null;
  paymentDeadlineAt: string | null;
  intentStatus: string | null;
  appointmentStatus: string | null;
};

const EMPTY_PAYMENT_VIEW: PaymentView = {
  loaded: false,
  failedToLoad: false,
  amountMinor: null,
  currency: 'RUB',
  checkoutUrl: null,
  paymentDeadlineAt: null,
  intentStatus: null,
  appointmentStatus: null,
};

export type BookingAppointmentDetails = {
  appointmentId: string;
  specialistName: string | null;
  branchTitle: string | null;
  serviceTitle: string | null;
};

type Props = {
  bookings: PatientBookingRecord[];
  appointmentDetails: BookingAppointmentDetails[];
  addressHref: string;
  /** IANA-таймзона отображения (`system_settings.app_display_timezone`). */
  appDisplayTimeZone: string;
};

function statusToBadgeVariant(
  status: PatientBookingRecord['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'cancelled' || status === 'failed_sync' || status === 'cancel_failed')
    return 'destructive';
  if (status === 'awaiting_payment' || status === 'rescheduled' || status === 'cancelling')
    return 'secondary';
  return 'outline';
}

function statusLabel(status: PatientBookingRecord['status']): string {
  if (status === 'creating') return 'Создаётся';
  if (status === 'awaiting_payment') return 'Ожидает оплаты';
  if (status === 'confirmed') return 'Подтверждена';
  if (status === 'cancelled') return 'Отменена';
  if (status === 'cancelling') return 'Отмена…';
  if (status === 'cancel_failed') return 'Не удалось отменить';
  if (status === 'rescheduled') return 'Перенесена';
  if (status === 'completed') return 'Завершена';
  if (status === 'no_show') return 'Неявка';
  return 'Ошибка синхронизации';
}

function showManageLink(status: PatientBookingRecord['status']): boolean {
  return status === 'confirmed' || status === 'rescheduled' || status === 'creating';
}

function payHref(bookingId: string): string {
  return `/app/patient/booking/pay?bookingId=${encodeURIComponent(bookingId)}`;
}

function formatMoney(amountMinor: number, currency = 'RUB'): string {
  return (amountMinor / 100).toLocaleString('ru-RU', { style: 'currency', currency });
}

function formatRemaining(msLeft: number): string {
  const totalMinutes = Math.max(1, Math.ceil(msLeft / 60_000));
  if (totalMinutes >= 24 * 60) return `${Math.ceil(totalMinutes / (24 * 60))} дн.`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  return `${totalMinutes} мин`;
}

function useBookingPayment(bookingId: string, active: boolean, displayTimeZone: string) {
  const [payment, setPayment] = useState<PaymentView>(EMPTY_PAYMENT_VIEW);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active || payment.loaded || payment.failedToLoad) return;
    let current = true;
    void fetch(`/api/booking/payment-status?bookingId=${encodeURIComponent(bookingId)}`)
      .then(async (response) => {
        const json = (await response.json()) as PaymentStatusResponse;
        if (!response.ok || !json.ok) throw new Error('payment_status_unavailable');
        if (!current) return;
        setPayment({
          loaded: true,
          failedToLoad: false,
          amountMinor: json.amountMinor ?? null,
          currency: json.currency ?? 'RUB',
          checkoutUrl: json.checkoutUrl ?? null,
          paymentDeadlineAt: json.paymentDeadlineAt ?? null,
          intentStatus: json.intentStatus ?? null,
          appointmentStatus: json.appointmentStatus ?? null,
        });
      })
      .catch(() => {
        if (current) setPayment({ ...EMPTY_PAYMENT_VIEW, failedToLoad: true });
      });
    return () => {
      current = false;
    };
  }, [active, bookingId, payment.failedToLoad, payment.loaded]);

  const intentView = classifyPaymentIntentStatus(payment.intentStatus);
  const bookingView = classifyPrepaymentBookingStatus(payment.appointmentStatus);
  // Срок разбираем ТЕМ ЖЕ парсером, которым его рисуем ниже (`formatBookingDateTimeMediumRu`):
  // Postgres отдаёт `timestamptz` как «2026-09-12 03:59:00.309689+03» — пробел и короткое смещение.
  // На строгом ISO-разборе это молча даёт NaN, и тогда истёкший счёт остаётся с живой кнопкой
  // (ровно этот дефект нашли живьём в модалке врача, S6.5).
  const deadlineMs = payment.paymentDeadlineAt
    ? parseBusinessInstant(payment.paymentDeadlineAt, displayTimeZone).getTime()
    : Number.NaN;
  const hasDeadline = Number.isFinite(deadlineMs);
  const deadlinePassed = hasDeadline && deadlineMs <= nowMs;
  const settledElsewhere = payment.loaded && intentView === 'pending' && bookingView === 'settled';
  const expired =
    payment.loaded &&
    intentView === 'pending' &&
    (bookingView === 'cancelled' || (bookingView === 'awaiting' && deadlinePassed));
  const payable =
    payment.loaded && intentView === 'pending' && bookingView === 'awaiting' && !deadlinePassed;
  const succeeded = payment.loaded && intentView === 'succeeded';
  const failed = payment.loaded && intentView === 'failed';

  useEffect(() => {
    if (!payable || !hasDeadline) return;
    const timeout = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.max(0, deadlineMs - Date.now()),
    );
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [deadlineMs, hasDeadline, payable]);

  return {
    payment,
    expired,
    payable,
    succeeded,
    failed,
    settledElsewhere,
    remainingMs: hasDeadline ? Math.max(0, deadlineMs - nowMs) : null,
  };
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className={patientMutedTextClass}>{label}</dt>
      <dd className={patientBodyTextClass}>{children}</dd>
    </div>
  );
}

function BookingCard({
  row,
  details,
  addressHref,
  appDisplayTimeZone,
}: {
  row: PatientBookingRecord;
  details: BookingAppointmentDetails | null;
  addressHref: string;
  appDisplayTimeZone: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const terms = usePatientTerms();
  const cardButtonRef = useRef<HTMLButtonElement>(null);
  const hasNativeActions = Boolean(row.canonicalAppointmentId);
  const branchTimeZone = row.canonicalInPersonContext?.timezone;
  const displayTimeZone = resolveAppointmentTimeZone(branchTimeZone, appDisplayTimeZone);
  const paymentState = useBookingPayment(
    row.id,
    row.status === 'awaiting_payment' || panelOpen,
    displayTimeZone,
  );
  const { payment } = paymentState;
  const amountLabel =
    payment.amountMinor === null ? null : formatMoney(payment.amountMinor, payment.currency);
  const serviceTitle =
    details?.serviceTitle ??
    row.canonicalInPersonContext?.serviceTitle ??
    row.serviceTitleSnapshot ??
    nativeBookingSubtitle(row, terms);
  const branchTitle =
    details?.branchTitle ??
    row.canonicalInPersonContext?.branchTitle ??
    row.branchTitleSnapshot ??
    row.city;
  const totalMinor =
    row.canonicalInPersonContext?.priceMinor ?? row.priceMinorSnapshot ?? payment.amountMinor;
  const paymentReason = paymentState.expired
    ? payment.appointmentStatus &&
      classifyPrepaymentBookingStatus(payment.appointmentStatus) === 'cancelled'
      ? 'Запись отменена, оплатить её нельзя'
      : 'Срок оплаты истёк'
    : paymentState.failed
      ? 'Счёт больше недоступен'
      : paymentState.settledElsewhere
        ? 'Оплата не требуется'
        : paymentState.succeeded
          ? 'Оплачено'
          : null;

  const paymentSummary =
    row.status === 'awaiting_payment' ? (
      payment.failedToLoad ? (
        <p className={cn(patientCaptionTextClass, 'patient-text-danger')}>
          Не удалось проверить статус оплаты
        </p>
      ) : !payment.loaded ? (
        <p className={patientCaptionTextClass}>Проверяем статус оплаты…</p>
      ) : paymentState.payable ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={patientActionTextClass}>Не оплачено</span>
          {amountLabel ? <span className={patientBodyTextClass}>{amountLabel}</span> : null}
          {paymentState.remainingMs !== null ? (
            <span className={patientCaptionTextClass}>
              осталось {formatRemaining(paymentState.remainingMs)}
            </span>
          ) : null}
        </div>
      ) : paymentReason ? (
        <p className={cn(patientActionTextClass, paymentState.expired && 'patient-text-danger')}>
          {paymentReason}
        </p>
      ) : null
    ) : null;

  return (
    <>
      <article
        data-booking-id={row.id}
        data-booking-status={row.status}
        className={cn(
          row.status === 'awaiting_payment' ? patientSurfaceWarningClass : patientListItemClass,
          'relative flex flex-col gap-3 overflow-hidden sm:flex-row sm:items-start sm:justify-between',
        )}
      >
        <button
          ref={cardButtonRef}
          type="button"
          className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--patient-color-primary)]"
          aria-label={`Открыть детали записи ${formatBookingDateTimeMediumRu(row.slotStart, displayTimeZone)}`}
          onClick={() => setPanelOpen(true)}
        />
        <div className="pointer-events-none relative z-10 min-w-0 flex-1">
          <p className={cn('flex items-center gap-1.5', patientActionTextClass)}>
            <span>{formatBookingDateTimeMediumRu(row.slotStart, displayTimeZone)}</span>
            <AppointmentZoneOffsetWarning iso={row.slotStart} branchTimeZone={branchTimeZone} />
          </p>
          <p className={cn(patientCaptionTextClass, 'truncate')}>
            {bookingProvenancePrefix(row)}
            {nativeBookingSubtitle(row, terms)}
          </p>
          {paymentSummary ? <div className="mt-2">{paymentSummary}</div> : null}
        </div>
        <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant={statusToBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
          {row.status === 'awaiting_payment' && paymentState.payable ? (
            <Link href={payHref(row.id)} className={cn(patientCompactActionClass, 'h-10')}>
              Оплатить
            </Link>
          ) : null}
          {hasNativeActions && showManageLink(row.status) ? (
            <CabinetBookingActions row={row} />
          ) : null}
          {row.canonicalAppointmentId && row.status === 'confirmed' ? (
            <AppointmentReminderPreference appointmentId={row.canonicalAppointmentId} />
          ) : null}
        </div>
      </article>

      <PatientModal
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        returnFocusRef={cardButtonRef}
        title="Детали записи"
        titleSubject={formatBookingDateTimeMediumRu(row.slotStart, displayTimeZone)}
        size="md"
      >
        <div className="flex flex-col gap-5">
          <dl className="flex flex-col gap-3">
            <DetailRow label="Когда">
              <span className="inline-flex items-center gap-1.5">
                {formatBookingDateTimeMediumRu(row.slotStart, displayTimeZone)}
                <AppointmentZoneOffsetWarning iso={row.slotStart} branchTimeZone={branchTimeZone} />
              </span>
            </DetailRow>
            <DetailRow label="Формат">{row.bookingType === 'online' ? 'Онлайн' : 'Очно'}</DetailRow>
            <DetailRow label="Услуга">{serviceTitle}</DetailRow>
            <DetailRow label="Специалист">
              {details?.specialistName?.trim() || 'Не назначен'}
            </DetailRow>
            {row.bookingType === 'in_person' ? (
              <DetailRow label="Адрес">
                <span className="flex flex-col items-start gap-1">
                  {branchTitle ? <span>{branchTitle}</span> : null}
                  <Link href={addressHref} className={patientInlineLinkClass}>
                    Адрес и карта
                  </Link>
                </span>
              </DetailRow>
            ) : null}
            <DetailRow label="Стоимость">
              {totalMinor === null ? 'Не указана' : formatMoney(totalMinor)}
            </DetailRow>
            <DetailRow label="Оплата">
              {paymentReason ?? (paymentState.payable ? 'Ожидает оплаты' : statusLabel(row.status))}
            </DetailRow>
          </dl>

          {paymentState.payable ? (
            <section
              aria-label="Оплата записи"
              className="flex flex-col gap-3 border-t border-[var(--patient-border)] pt-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={patientActionTextClass}>К оплате</p>
                {amountLabel ? <p className={patientActionTextClass}>{amountLabel}</p> : null}
              </div>
              {payment.paymentDeadlineAt && paymentState.remainingMs !== null ? (
                <div>
                  <p className={patientBodyTextClass}>
                    Оплатить до{' '}
                    {formatBookingDateTimeMediumRu(payment.paymentDeadlineAt, displayTimeZone)}
                  </p>
                  <p className={patientMutedTextClass}>
                    Осталось {formatRemaining(paymentState.remainingMs)}
                  </p>
                </div>
              ) : null}
              {payment.checkoutUrl ? (
                <>
                  <a
                    href={payment.checkoutUrl}
                    className={cn(patientMutedTextClass, 'break-all underline')}
                  >
                    {payment.checkoutUrl}
                  </a>
                  <a href={payment.checkoutUrl} className={patientModalPortalPrimaryCtaClass}>
                    Оплатить
                  </a>
                  <div className="hidden md:block">
                    <PaymentLinkQrCode url={payment.checkoutUrl} />
                  </div>
                  <Collapsible className="md:hidden">
                    <CollapsibleTrigger
                      className={cn(patientSecondaryActionClass, 'justify-between')}
                    >
                      Показать QR
                      <ChevronDown
                        className="size-4 transition-transform group-data-[open]/collapsible:rotate-180"
                        aria-hidden
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <PaymentLinkQrCode url={payment.checkoutUrl} />
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : null}
            </section>
          ) : null}

          {hasNativeActions && showManageLink(row.status) ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--patient-border)] pt-4">
              <CabinetBookingActions row={row} />
            </div>
          ) : null}
        </div>
      </PatientModal>
    </>
  );
}

export function BookingUpcomingSection({
  bookings,
  appointmentDetails,
  addressHref,
  appDisplayTimeZone,
}: Props) {
  if (bookings.length === 0) return null;
  const detailsByAppointmentId = new Map(
    appointmentDetails.map((details) => [details.appointmentId, details]),
  );

  return (
    <div className={bookingReminderSectionSurfaceClass}>
      <h3 className={patientSectionTitleClass}>Предстоящие записи</h3>
      <div className="flex flex-col gap-2">
        {bookings.map((row) => (
          <BookingCard
            key={row.id}
            row={row}
            details={
              row.canonicalAppointmentId
                ? (detailsByAppointmentId.get(row.canonicalAppointmentId) ?? null)
                : null
            }
            addressHref={addressHref}
            appDisplayTimeZone={appDisplayTimeZone}
          />
        ))}
      </div>
    </div>
  );
}
