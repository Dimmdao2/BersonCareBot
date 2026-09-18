'use client';

import Image from 'next/image';
import toast from 'react-hot-toast';
import { CircleCheck, CreditCard, ReceiptText, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import {
  doctorBodyTextClass,
  doctorPaymentAmountClass,
  doctorSecondaryListTextClass,
} from '@/shared/ui/doctor/doctorVisual';
import type { CalendarAppointmentPaymentView } from '@/modules/booking-calendar/types';
import { sendPaymentLinkToPatientChat } from '../sendPaymentLinkToPatientChat';
import { localQrCodeDataUri } from './localQrCode';
import { parseBusinessInstant } from '@/shared/lib/formatBusinessDateTime';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { notificationText } from '@/shared/notifications/notificationText';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
import type { PaymentHistoryEventRecord } from '@/modules/payments/types';
import type { PatientPayment } from '@/modules/patient-payments/ports';

type PaymentDetails = {
  onlineHistory: PaymentHistoryEventRecord[];
  manualPayments: PatientPayment[];
};

type Response = {
  ok?: boolean;
  payment?: CalendarAppointmentPaymentView;
  details?: PaymentDetails;
  error?: string;
};

type CollectionMode = 'full' | 'prepayment' | 'partial';

const money = (amountMinor: number, currency = 'RUB') =>
  (amountMinor / 100).toLocaleString('ru-RU', { style: 'currency', currency });

/** Сколько осталось до срока, словами: «18 минут», «2 часа 05 минут», «3 дня». */
function formatRemaining(msLeft: number): string {
  const totalMinutes = Math.ceil(msLeft / 60_000);
  if (totalMinutes >= 60 * 24) {
    const days = Math.ceil(totalMinutes / (60 * 24));
    const mod100 = days % 100;
    const mod10 = days % 10;
    const word =
      mod100 >= 11 && mod100 <= 14
        ? 'дней'
        : mod10 === 1
          ? 'день'
          : mod10 >= 2 && mod10 <= 4
            ? 'дня'
            : 'дней';
    return `${days} ${word}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} ч ${String(minutes).padStart(2, '0')} мин`;
  const mod100 = minutes % 100;
  const mod10 = minutes % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'минут'
      : mod10 === 1
        ? 'минута'
        : mod10 >= 2 && mod10 <= 4
          ? 'минуты'
          : 'минут';
  return `${minutes} ${word}`;
}

function errorLabel(error: string, patientSingularLabel: string) {
  if (error === 'chat_send_failed')
    return `Не удалось отправить ссылку в чат ${patientSingularLabel.toLowerCase()}.`;
  return errorCodeText(error, notificationText.bookingManualLifecycleActionFailed);
}

export function AppointmentPaymentSection({
  apiBase,
  appointmentId,
  view,
  patientUserId,
  patientName,
  appointmentWhen,
  serviceName,
  specialistName,
  branchName,
  durationMinutes,
  showSpecialist,
  cancelled,
  timeZone,
  onPaymentChange,
}: {
  apiBase: string;
  appointmentId: string;
  /**
   * APPT-DETAIL-11: сводка приходит вместе с деталями записи, поэтому блок верен с первого
   * рендера. Повторное чтение остаётся только за платёжной мутацией — она меняет эти суммы.
   */
  view: CalendarAppointmentPaymentView;
  /** Needed only for the chat send; omitting it hides that option. */
  patientUserId?: string | null;
  patientName: string;
  appointmentWhen: string;
  serviceName: string;
  specialistName: string | null;
  branchName: string;
  durationMinutes: number;
  showSpecialist: boolean;
  cancelled: boolean;
  /** Часовой пояс клиники — срок оплаты показывается в нём, а не в поясе браузера врача. */
  timeZone: string;
  onPaymentChange?: (payment: CalendarAppointmentPaymentView) => void;
}) {
  const { patientSingularLabel } = useDoctorPatientTerms();
  const [current, setCurrent] = useState(view);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>('full');
  const [partialRubles, setPartialRubles] = useState('');
  const [retainCommission, setRetainCommission] = useState(false);
  const [retainPrepayment, setRetainPrepayment] = useState(false);
  const [customRetention, setCustomRetention] = useState(false);
  const [retentionRubles, setRetentionRubles] = useState('');
  const [refundMethod, setRefundMethod] = useState<'auto' | 'cash'>('cash');
  const [copied, setCopied] = useState(false);
  const [chatSent, setChatSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const requestVersion = useRef(0);
  const currentRef = useRef(view);
  const onPaymentChangeRef = useRef(onPaymentChange);

  useEffect(() => {
    onPaymentChangeRef.current = onPaymentChange;
  }, [onPaymentChange]);

  useEffect(() => {
    currentRef.current = view;
    setCurrent(view);
    setCreatedLink(null);
    setCopied(false);
    setChatSent(false);
  }, [appointmentId, view]);

  const applyPayment = useCallback((payment: CalendarAppointmentPaymentView) => {
    const changed = JSON.stringify(currentRef.current) !== JSON.stringify(payment);
    currentRef.current = payment;
    setCurrent(payment);
    if (changed) onPaymentChangeRef.current?.(payment);
  }, []);

  const reload = useCallback(
    async (targetAppointmentId: string, version: number) => {
      const response = await fetch(
        `${apiBase}/appointments/${encodeURIComponent(targetAppointmentId)}/payment`,
      );
      const json = (await response.json()) as Response;
      if (!response.ok || !json.payment) throw new Error(json.error ?? 'not_found');
      if (version !== requestVersion.current) return;
      applyPayment(json.payment);
      if (json.details) setDetails(json.details);
    },
    [apiBase, applyPayment],
  );

  const run = (
    action: 'cash' | 'link',
    amountMinor: number,
    purpose: CollectionMode,
  ) =>
    startTransition(async () => {
      const version = requestVersion.current + 1;
      requestVersion.current = version;
      const targetAppointmentId = appointmentId;
      try {
        const response = await fetch(
          `${apiBase}/appointments/${encodeURIComponent(targetAppointmentId)}/payment`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, amountMinor, purpose }),
          },
        );
        const json = (await response.json()) as {
          ok?: boolean;
          error?: string;
          paymentLink?: string;
        };
        if (!response.ok || !json.ok) throw new Error(json.error ?? 'request_failed');
        if (version !== requestVersion.current) return;
        if (json.paymentLink) {
          setCreatedLink(json.paymentLink);
          setCopied(false);
          setChatSent(false);
        }
        if (action === 'cash') setCollectOpen(false);
        await reload(targetAppointmentId, version);
      } catch (cause) {
        if (version === requestVersion.current) {
          toast.error(
            errorLabel(
              cause instanceof Error ? cause.message : 'request_failed',
              patientSingularLabel,
            ),
          );
        }
      }
    });

  const runRefund = (amountMinor: number) =>
    startTransition(async () => {
      const version = requestVersion.current + 1;
      requestVersion.current = version;
      try {
        const response = await fetch(
          `${apiBase}/appointments/${encodeURIComponent(appointmentId)}/payment`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'refund', method: refundMethod, amountMinor }),
          },
        );
        const json = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !json.ok) throw new Error(json.error ?? 'request_failed');
        setRefundOpen(false);
        await reload(appointmentId, version);
      } catch (cause) {
        toast.error(
          errorLabel(
            cause instanceof Error ? cause.message : 'request_failed',
            patientSingularLabel,
          ),
        );
      }
    });

  const link = createdLink ?? current.prepayment?.checkoutUrl ?? null;

  const copyLink = () =>
    startTransition(async () => {
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    });

  const sendLinkToChat = () =>
    startTransition(async () => {
      if (!link || !patientUserId) return;
      const ok = await sendPaymentLinkToPatientChat({
        patientUserId,
        subjectRef: `appointment:${appointmentId}`,
        link,
      }).catch(() => false);
      if (ok) setChatSent(true);
      else toast.error(errorLabel('chat_send_failed', patientSingularLabel));
    });

  const captured = current.payment?.status === 'captured' ? current.payment.amountMinor : 0;
  const paid = captured + current.manualPaidMinor;
  const totalMinor = current.totalMinor;
  // PAY-APPT-06: показываем ТРЕБУЕМУЮ предоплату из снимка записи — то же число, на которое
  // выставляется счёт. Живого пересчёта из каталога здесь больше нет: он расходился со снимком
  // после врачебного переопределения цены и после сдвига прайса услуги.
  const prepaymentDueMinor =
    current.prepayment && current.prepayment.requiredMinor > current.prepayment.paidMinor
      ? current.prepayment.requiredMinor - current.prepayment.paidMinor
      : null;
  const isSettled = totalMinor !== null && paid >= totalMinor;
  const remaining = totalMinor === null ? null : Math.max(0, totalMinor - paid);
  const canCollect = !cancelled && remaining !== null && remaining > 0;
  const prepaymentConfigured = Boolean(
    current.prepayment &&
      current.prepayment.mode !== 'disabled' &&
      current.prepayment.requiredMinor > 0,
  );
  const prepaymentPaidMinor = current.prepayment?.paidMinor ?? 0;
  const hasPaymentDetails = current.hasPaymentActivity || paid > 0 || prepaymentPaidMinor > 0;

  // S6.3/S6.4: срок оплаты — не украшение, а то, что делит экран надвое. Пока он не вышел, врач
  // показывает ссылку и QR; как только вышел, бронь уже отменена фоновым тиком, и показывать
  // мёртвую ссылку нельзя — по ней пациент заплатит за отданное другому время.
  const deadlineAt = current.prepayment?.deadlineAt ?? null;
  // Разбор — общим `parseBusinessInstant`, а НЕ `DateTime.fromISO`. Срок приезжает из
  // `be_appointments.payment_deadline_at`, колонка объявлена `mode: 'string'`, и наружу уходит
  // постгресовая форма с пробелом и коротким смещением: «2026-09-12 03:59:00.309689+03».
  // `fromISO` на ней даёт Invalid DateTime, `toMillis()` — NaN, и весь блок срока молча исчезал:
  // живая проверка S6.5 показала модалку врача со ссылкой и QR, но БЕЗ «Оплатить до» и отсчёта,
  // а вместе с ним не мог наступить и `invoiceExpired` — истёкший счёт продолжал бы показывать
  // ссылку. Аудит S6 этого не поймал, потому что читал код, а не экран.
  const deadlineMsRaw = deadlineAt ? parseBusinessInstant(deadlineAt, timeZone).getTime() : null;
  const deadlineMs =
    deadlineMsRaw !== null && Number.isFinite(deadlineMsRaw) ? deadlineMsRaw : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!collectOpen || deadlineMs === null || !Number.isFinite(deadlineMs)) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [collectOpen, deadlineMs]);

  const hasDeadline = deadlineMs !== null && Number.isFinite(deadlineMs);
  const deadlinePassed = hasDeadline && deadlineMs <= nowMs;
  /** Счёт истёк только пока он не оплачен: оплаченная запись срок уже пережила. */
  const invoiceExpired = deadlinePassed && !isSettled;
  const invoiceAlive = Boolean(link) && !invoiceExpired;
  const deadlineLabel = hasDeadline
    ? DateTime.fromMillis(deadlineMs).setZone(timeZone).setLocale('ru').toFormat('d MMMM, HH:mm')
    : null;
  const canSendLink = invoiceAlive && current.patientChatAvailable && Boolean(patientUserId);

  const selectedAmountMinor = (() => {
    if (collectionMode === 'prepayment') return prepaymentDueMinor ?? 0;
    if (collectionMode === 'partial') {
      const rubles = Number(partialRubles.replace(',', '.'));
      return Number.isFinite(rubles) ? Math.round(rubles * 100) : 0;
    }
    return remaining ?? 0;
  })();
  const selectedAmountValid =
    selectedAmountMinor > 0 && remaining !== null && selectedAmountMinor <= remaining;
  const prepaymentStatus = !prepaymentConfigured
    ? null
    : prepaymentPaidMinor >= (current.prepayment?.requiredMinor ?? 0)
      ? 'Внесена'
      : deadlinePassed
        ? 'Просрочена'
        : 'Ожидается';
  const refundableOnlineMinor = Math.max(
    0,
    captured -
      (details?.onlineHistory ?? [])
        .filter((event) => event.eventType === 'refund_succeeded')
        .reduce((sum, event) => sum + (event.amountMinor ?? 0), 0),
  );
  const refundableSourceMinor = refundMethod === 'auto' ? refundableOnlineMinor : paid;
  const customRetentionMinor = customRetention
    ? Math.max(0, Math.round(Number(retentionRubles.replace(',', '.')) * 100) || 0)
    : retainPrepayment
      ? Math.min(prepaymentPaidMinor, refundableSourceMinor)
      : 0;
  const refundAmountMinor = Math.max(0, refundableSourceMinor - customRetentionMinor);

  useEffect(() => {
    if (!collectOpen || isSettled) return;
    const refresh = () => {
      const version = requestVersion.current;
      void reload(appointmentId, version).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [appointmentId, collectOpen, isSettled, reload]);

  // Owner acceptance MONEY-06: the block exists only for a clinic whose tariff carries payments.
  if (!current.paymentsEntitled) return null;

  return (
    <section className="space-y-4 text-sm" aria-label="Оплата записи">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <p className={doctorSecondaryListTextClass}>Предоплата</p>
          {prepaymentStatus ? (
            <Badge
              variant="secondary"
              className={
                prepaymentStatus === 'Внесена'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
                  : prepaymentStatus === 'Просрочена'
                    ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border border-slate-500/25 bg-slate-500/10 text-slate-700'
              }
            >
              {prepaymentStatus}
            </Badge>
          ) : null}
        </div>
        <p className={doctorBodyTextClass}>
          {prepaymentConfigured
            ? prepaymentPaidMinor > 0 &&
              prepaymentPaidMinor < (current.prepayment?.requiredMinor ?? 0)
              ? `${money(prepaymentPaidMinor, current.prepayment?.currency)} из ${money(
                  current.prepayment?.requiredMinor ?? 0,
                  current.prepayment?.currency,
                )}`
              : money(
                  current.prepayment?.requiredMinor ?? 0,
                  current.prepayment?.currency,
                )
            : 'Без предоплаты'}
        </p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className={doctorSecondaryListTextClass}>Стоимость</p>
            {isSettled ? (
              <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-800">
                Оплачена
              </Badge>
            ) : null}
          </div>
          <p className={doctorBodyTextClass}>
            {totalMinor === null ? 'Не указана' : money(totalMinor)}
          </p>
        </div>
        {hasPaymentDetails ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              setDetailsOpen(true);
              void reload(appointmentId, requestVersion.current).catch(() => undefined);
            }}
          >
            Детали
          </Button>
        ) : canCollect ? (
          <Button type="button" size="sm" className="shrink-0" onClick={() => setCollectOpen(true)}>
            Принять оплату
          </Button>
        ) : null}
      </div>

      <DoctorModal
        variant="panel"
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title={
          <DoctorModalStackedTitle
            label="Приём оплаты"
            patientName={patientName}
            patientVariant="context"
          />
        }
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <p className="text-lg font-semibold">{appointmentWhen}</p>
            <p className={doctorSecondaryListTextClass}>
              Запись на {serviceName}
              {showSpecialist && specialistName ? ` к специалисту ${specialistName}` : ''},
              длительность {durationMinutes} мин. в филиал {branchName}
            </p>
          </div>
          {isSettled ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 py-6 text-center text-emerald-700">
              <CircleCheck className="size-12" aria-hidden />
              <div className="space-y-1">
                <p className={doctorBodyTextClass}>Оплачено</p>
                <p className={doctorPaymentAmountClass}>{money(paid)}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Сумма оплаты">
                {(
                  [
                    ['full', 'Полная стоимость'],
                    ...(prepaymentConfigured && prepaymentDueMinor
                      ? ([['prepayment', 'Предоплата']] as const)
                      : []),
                    ['partial', 'Частичная оплата'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-2 py-2 text-xs"
                  >
                    <input
                      type="radio"
                      name="appointment-payment-mode"
                      value={value}
                      checked={collectionMode === value}
                      onChange={() => setCollectionMode(value)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2 py-2">
                <p className={doctorBodyTextClass}>К оплате</p>
                {collectionMode === 'partial' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={partialRubles}
                      onChange={(event) => setPartialRubles(event.target.value)}
                      className="h-12 text-xl font-semibold"
                      aria-label="Сумма частичной оплаты"
                    />
                    <span className="text-lg font-semibold">₽</span>
                  </div>
                ) : (
                  <p className={doctorPaymentAmountClass}>{money(selectedAmountMinor)}</p>
                )}
              </div>
              {invoiceExpired ? (
                <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="font-medium text-destructive">Оплата не поступила</p>
                  <p className={doctorSecondaryListTextClass}>
                    Бронирование отменено, время освобождено.
                  </p>
                </div>
              ) : invoiceAlive && link ? (
                <div className="flex flex-col gap-3">
                  {deadlineLabel ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-lg font-semibold">Оплатить до {deadlineLabel}</p>
                      <p className={doctorSecondaryListTextClass}>
                        Осталось {formatRemaining(Math.max(0, (deadlineMs ?? 0) - nowMs))}
                      </p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="cursor-copy break-all rounded-lg border border-border bg-muted/20 p-3 text-left text-sm text-primary"
                    onClick={copyLink}
                  >
                    {link}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={copyLink}
                  >
                    {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
                  </Button>
                  <Image
                    width={288}
                    height={288}
                    alt="QR-код платёжной ссылки"
                    src={localQrCodeDataUri(link)}
                    className="mx-auto h-auto w-full max-w-72"
                    unoptimized
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
        {!isSettled && canCollect ? (
          <DoctorModalFooter>
            {/*
              S6.1/S6.2: пока счёт жив, выставлять второй незачем — кнопка уходит. На её месте
              появляется отправка ссылки, но только если у пациента есть подтверждённый канал;
              иначе врач показывает ссылку и QR с экрана. Истёк счёт — кнопка возвращается.
            */}
            {invoiceAlive ? (
              canSendLink ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={sendLinkToChat}
                >
                  {chatSent ? 'Ссылка отправлена' : 'Отправить ссылку'}
                </Button>
              ) : null
            ) : current.onlinePaymentAvailable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || !selectedAmountValid}
                onClick={() => run('link', selectedAmountMinor, collectionMode)}
              >
                Выставить счёт
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={pending || !selectedAmountValid}
              onClick={() => run('cash', selectedAmountMinor, collectionMode)}
            >
              Оплачено наличными
            </Button>
          </DoctorModalFooter>
        ) : null}
      </DoctorModal>

      <DoctorModal
        variant="panel"
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title={
          <DoctorModalStackedTitle
            label="Детали оплаты"
            patientName={patientName}
            patientVariant="context"
          />
        }
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-lg font-semibold">{appointmentWhen}</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {[...(details?.manualPayments ?? [])]
              .map((payment) => ({
                id: `manual:${payment.id}`,
                at: payment.createdAt,
                amountMinor: payment.amountMinor,
                currency: payment.currency,
                title:
                  payment.status === 'refunded'
                    ? 'Возврат наличными'
                    : payment.comment?.includes('Предоплата')
                      ? 'Предоплата'
                      : 'Оплата',
                method: 'Наличными',
                refunded: payment.status === 'refunded',
              }))
              .concat(
                (details?.onlineHistory ?? [])
                  .filter((event) =>
                    ['payment_captured', 'refund_succeeded', 'intent_succeeded'].includes(
                      event.eventType,
                    ),
                  )
                  .map((event) => ({
                    id: `online:${event.id}`,
                    at: event.occurredAt,
                    amountMinor: event.amountMinor ?? 0,
                    currency: event.currency ?? 'RUB',
                    title:
                      event.eventType === 'refund_succeeded'
                        ? 'Возврат'
                        : event.amountMinor != null && event.amountMinor >= (totalMinor ?? Infinity)
                          ? 'Оплата'
                          : 'Предоплата',
                    method: event.providerId ? `Онлайн · ${event.providerId}` : 'Онлайн',
                    refunded: event.eventType === 'refund_succeeded',
                  })),
              )
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
              .map((movement) => (
                <div key={movement.id} className="flex items-start gap-3 p-3">
                  <ReceiptText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{movement.title}</p>
                    <p className={doctorSecondaryListTextClass}>
                      {movement.method} ·{' '}
                      {DateTime.fromISO(movement.at).setLocale('ru').toFormat('d MMMM yyyy, HH:mm')}
                    </p>
                  </div>
                  <p className={movement.refunded ? 'font-semibold text-destructive' : 'font-semibold'}>
                    {movement.refunded ? '−' : '+'}
                    {money(movement.amountMinor, movement.currency)}
                  </p>
                </div>
              ))}
            {!details ||
            ((details.manualPayments?.length ?? 0) === 0 &&
              (details.onlineHistory?.length ?? 0) === 0) ? (
              <p className="p-3 text-muted-foreground">Движений средств нет.</p>
            ) : null}
          </div>
        </div>
        <DoctorModalFooter>
          {paid > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRefundMethod(refundableOnlineMinor > 0 ? 'auto' : 'cash');
                setRefundOpen(true);
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Сделать возврат
            </Button>
          ) : null}
          {canCollect ? (
            <Button
              type="button"
              onClick={() => {
                setDetailsOpen(false);
                setCollectOpen(true);
              }}
            >
              Принять оплату
            </Button>
          ) : null}
        </DoctorModalFooter>
      </DoctorModal>

      <DoctorModal
        variant="panel"
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Возврат"
        size="sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Способ возврата">
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
              <input
                type="radio"
                name="appointment-refund-method"
                checked={refundMethod === 'cash'}
                onChange={() => setRefundMethod('cash')}
                className="size-4 accent-primary"
              />
              Наличными
            </label>
            {refundableOnlineMinor > 0 ? (
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
                <input
                  type="radio"
                  name="appointment-refund-method"
                  checked={refundMethod === 'auto'}
                  onChange={() => setRefundMethod('auto')}
                  className="size-4 accent-primary"
                />
                <CreditCard className="size-4" aria-hidden />
                Автовозврат
              </label>
            ) : null}
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={retainCommission}
              onCheckedChange={(checked) => setRetainCommission(checked === true)}
              disabled
            />
            <span>Удержать комиссию</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={retainPrepayment}
              onCheckedChange={(checked) => {
                setRetainPrepayment(checked === true);
                if (checked !== true) setCustomRetention(false);
              }}
            />
            <span>Удержать предоплату</span>
          </label>
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={customRetention}
              onCheckedChange={(checked) => setCustomRetention(checked === true)}
              disabled={!retainPrepayment}
            />
            <span className="flex-1">Указать сумму</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={retentionRubles}
              onChange={(event) => setRetentionRubles(event.target.value)}
              disabled={!retainPrepayment || !customRetention}
              className="w-32"
              aria-label="Сумма удержания"
            />
          </div>
          <p className="text-lg font-semibold">Сумма к возврату: {money(refundAmountMinor)}</p>
        </div>
        <DoctorModalFooter>
          <Button
            type="button"
            disabled={pending || refundAmountMinor <= 0}
            onClick={() => runRefund(refundAmountMinor)}
          >
            Оформить
          </Button>
        </DoctorModalFooter>
      </DoctorModal>
    </section>
  );
}
