'use client';

import Image from 'next/image';
import toast from 'react-hot-toast';
import { CircleCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorModal, DoctorModalFooter } from '@/shared/ui/doctor/DoctorModal';
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

type Response = { ok?: boolean; payment?: CalendarAppointmentPaymentView; error?: string };

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
      mod100 >= 11 && mod100 <= 14 ? 'дней' : mod10 === 1 ? 'день' : mod10 >= 2 && mod10 <= 4 ? 'дня' : 'дней';
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
  if (error === 'payments_disabled') return 'Приём платежей выключен для клиники.';
  if (error === 'payment_provider_unavailable' || error === 'payment_link_unavailable') {
    return 'Платёжный провайдер не настроен.';
  }
  if (error === 'appointment_amount_unavailable') return 'Стоимость записи не определена.';
  if (error === 'already_paid') return 'Запись уже оплачена.';
  if (error === 'chat_send_failed')
    return `Не удалось отправить ссылку в чат ${patientSingularLabel.toLowerCase()}.`;
  return 'Не удалось выполнить действие.';
}

export function AppointmentPaymentSection({
  apiBase,
  appointmentId,
  view,
  patientUserId,
  patientName,
  appointmentWhen,
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
  /** Часовой пояс клиники — срок оплаты показывается в нём, а не в поясе браузера врача. */
  timeZone: string;
  onPaymentChange?: (payment: CalendarAppointmentPaymentView) => void;
}) {
  const { patientSingularLabel } = useDoctorPatientTerms();
  const [current, setCurrent] = useState(view);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
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
    },
    [apiBase, applyPayment],
  );

  const run = (action: 'cash' | 'link') =>
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
            body: JSON.stringify({ action }),
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
  const canCollect = remaining !== null && remaining > 0;
  const paymentSummary = isSettled
    ? current.manualPaidMinor > 0 && captured === 0
      ? `Оплачено наличными: ${money(paid)}`
      : captured > 0 && current.manualPaidMinor === 0
        ? `Оплачено онлайн: ${money(paid)}`
        : `Оплачено: ${money(paid)}`
    : paid > 0 && totalMinor !== null
      ? `Частично оплачено: ${money(paid)} из ${money(totalMinor)} · осталось ${money(remaining ?? 0)}`
      : prepaymentDueMinor
        ? `Не оплачено · предоплата ${money(prepaymentDueMinor, current.prepayment?.currency)}`
        : 'Не оплачено';

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
  const deadlineMs = deadlineMsRaw !== null && Number.isFinite(deadlineMsRaw) ? deadlineMsRaw : null;
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
    <section className="space-y-2 border-t border-border pt-3 text-sm" aria-label="Оплата записи">
      <div className="flex items-center justify-between gap-3">
        <p className={isSettled ? 'font-medium' : undefined}>{paymentSummary}</p>
        {canCollect ? (
          <Button type="button" size="sm" className="shrink-0" onClick={() => setCollectOpen(true)}>
            Принять оплату
          </Button>
        ) : null}
      </div>
      {totalMinor === null ? (
        <p className="text-muted-foreground">Стоимость записи не определена.</p>
      ) : null}
      <DoctorModal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="Приём оплаты"
        titleSubject={patientName}
        size="sm"
        nested
      >
        <div className="flex flex-col gap-4">
          <p className={doctorSecondaryListTextClass}>{appointmentWhen}</p>
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
              <div className="space-y-2 py-2">
                <p className={doctorBodyTextClass}>К оплате</p>
                <p className={doctorPaymentAmountClass}>{money(remaining ?? 0)}</p>
              </div>
              {/*
                PAY-APPT-05/06: счёт выставляется на требуемую предоплату, поэтому её сумма стоит
                рядом с кнопкой — показанное и созданное намерение обязаны совпадать.
              */}
              {current.onlinePaymentAvailable &&
              prepaymentDueMinor !== null &&
              prepaymentDueMinor !== remaining ? (
                <p className="text-muted-foreground">
                  Счёт на предоплату: {money(prepaymentDueMinor, current.prepayment?.currency)}
                </p>
              ) : null}
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
                disabled={pending}
                onClick={() => run('link')}
              >
                Выставить счёт
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={pending} onClick={() => run('cash')}>
              Оплачено наличными
            </Button>
          </DoctorModalFooter>
        ) : null}
      </DoctorModal>
    </section>
  );
}
