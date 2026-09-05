'use client';

import Image from 'next/image';
import toast from 'react-hot-toast';
import { useCallback, useRef, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import type { CalendarAppointmentPaymentView } from '@/modules/booking-calendar/types';
import { sendPaymentLinkToPatientChat } from '../sendPaymentLinkToPatientChat';
import { localQrCodeDataUri } from './localQrCode';

type Response = { ok?: boolean; payment?: CalendarAppointmentPaymentView; error?: string };

const money = (amountMinor: number, currency = 'RUB') =>
  (amountMinor / 100).toLocaleString('ru-RU', { style: 'currency', currency });

function errorLabel(error: string) {
  if (error === 'payments_disabled') return 'Приём платежей выключен для клиники.';
  if (error === 'payment_provider_unavailable' || error === 'payment_link_unavailable') {
    return 'Платёжный провайдер не настроен.';
  }
  if (error === 'appointment_amount_unavailable') return 'Стоимость записи не определена.';
  if (error === 'already_paid') return 'Запись уже оплачена.';
  if (error === 'chat_send_failed') return 'Не удалось отправить ссылку в чат пациента.';
  return 'Не удалось выполнить действие.';
}

export function AppointmentPaymentSection({
  apiBase,
  appointmentId,
  view,
  patientUserId,
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
}) {
  const [current, setCurrent] = useState(view);
  const [link, setLink] = useState<string | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatSent, setChatSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const requestVersion = useRef(0);

  const reload = useCallback(
    async (targetAppointmentId: string, version: number) => {
      const response = await fetch(
        `${apiBase}/appointments/${encodeURIComponent(targetAppointmentId)}/payment`,
      );
      const json = (await response.json()) as Response;
      if (!response.ok || !json.payment) throw new Error(json.error ?? 'not_found');
      if (version !== requestVersion.current) return;
      setCurrent(json.payment);
    },
    [apiBase],
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
          setLink(json.paymentLink);
          setCopied(false);
          setChatSent(false);
        }
        if (action === 'cash') setCollectOpen(false);
        await reload(targetAppointmentId, version);
      } catch (cause) {
        if (version === requestVersion.current) {
          toast.error(errorLabel(cause instanceof Error ? cause.message : 'request_failed'));
        }
      }
    });

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
      else toast.error(errorLabel('chat_send_failed'));
    });

  const captured = current.payment?.status === 'succeeded' ? current.payment.amountMinor : 0;
  const paid = captured + current.manualPaidMinor;
  const totalMinor = current.totalMinor;
  const quote = current.prepaymentQuote?.amountMinor ?? null;
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
      : quote
        ? `Не оплачено · предоплата ${money(quote, current.prepaymentQuote?.currency)}`
        : 'Не оплачено';

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
        size="sm"
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-medium">К оплате: {money(remaining ?? 0)}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            disabled={pending}
            onClick={() => run('cash')}
          >
            Оплачено наличными
          </Button>
          {current.onlinePaymentAvailable ? (
            <>
              <Button
                type="button"
                size="sm"
                className="self-start"
                disabled={pending}
                onClick={() => run('link')}
              >
                Выставить счёт
              </Button>
              {link ? (
                <div className="flex flex-col gap-2">
                  <a
                    className="break-all text-primary underline"
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link}
                  </a>
                  <Image
                    width={144}
                    height={144}
                    alt="QR-код платёжной ссылки"
                    src={localQrCodeDataUri(link)}
                    unoptimized
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={copyLink}
                    >
                      {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
                    </Button>
                    {current.patientChatAvailable && patientUserId ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={sendLinkToChat}
                      >
                        {chatSent ? 'Отправлено в чат' : 'Отправить в чат'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </DoctorModal>
    </section>
  );
}
