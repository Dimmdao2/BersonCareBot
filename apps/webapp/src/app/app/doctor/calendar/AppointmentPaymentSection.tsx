'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { sendPaymentLinkToPatientChat } from '../sendPaymentLinkToPatientChat';
import { localQrCodeDataUri } from './localQrCode';

type Summary = {
  prepaymentQuote: { amountMinor: number; currency: string } | null;
  payment: { amountMinor: number; status: string } | null;
};
type Response = {
  summary?: Summary;
  error?: string;
  totalMinor?: number | null;
  manualPaidMinor?: number;
  /** Tariff mechanic `payments`. Absent (legacy shape) is treated as not entitled. */
  paymentsEntitled?: boolean;
  /** Configured provider behind the existing invoice/pay-link contract. */
  onlinePaymentAvailable?: boolean;
  /** The patient is `linked` to the portal, so the in-app conversation actually reaches them. */
  patientChatAvailable?: boolean;
};

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
  patientUserId,
}: {
  apiBase: string;
  appointmentId: string;
  /** Needed only for the chat send; omitting it hides that option. */
  patientUserId?: string | null;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [totalMinor, setTotalMinor] = useState<number | null>(null);
  const [manualPaidMinor, setManualPaidMinor] = useState(0);
  const [entitled, setEntitled] = useState(false);
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [chatAvailable, setChatAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatSent, setChatSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const requestVersion = useRef(0);

  const load = useCallback(
    async (targetAppointmentId: string, version: number) => {
      const response = await fetch(
        `${apiBase}/appointments/${encodeURIComponent(targetAppointmentId)}/payment`,
      );
      const json = (await response.json()) as Response;
      if (!response.ok || !json.summary) throw new Error(json.error ?? 'not_found');
      if (version !== requestVersion.current) return;
      setSummary(json.summary);
      setTotalMinor(json.totalMinor ?? null);
      setManualPaidMinor(json.manualPaidMinor ?? 0);
      setEntitled(json.paymentsEntitled === true);
      setOnlineAvailable(json.onlinePaymentAvailable === true);
      setChatAvailable(json.patientChatAvailable === true);
    },
    [apiBase],
  );

  useEffect(() => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    // A payment identity belongs to one appointment: clear it before starting the next read.
    setSummary(null);
    setTotalMinor(null);
    setManualPaidMinor(0);
    setEntitled(false);
    setOnlineAvailable(false);
    setChatAvailable(false);
    setError(null);
    setLink(null);
    setCollectOpen(false);
    setCopied(false);
    setChatSent(false);
    void load(appointmentId, version).catch((cause: unknown) => {
      if (version === requestVersion.current) {
        setError(cause instanceof Error ? cause.message : 'not_found');
      }
    });
  }, [appointmentId, load]);

  const run = (action: 'cash' | 'link') =>
    startTransition(async () => {
      const version = requestVersion.current;
      const targetAppointmentId = appointmentId;
      setError(null);
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
        await load(targetAppointmentId, version);
      } catch (cause) {
        if (version === requestVersion.current) {
          setError(cause instanceof Error ? cause.message : 'request_failed');
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
      setError(null);
      const ok = await sendPaymentLinkToPatientChat({
        patientUserId,
        subjectRef: `appointment:${appointmentId}`,
        link,
      }).catch(() => false);
      if (ok) setChatSent(true);
      else setError('chat_send_failed');
    });

  const captured = summary?.payment?.status === 'succeeded' ? summary.payment.amountMinor : 0;
  const paid = captured + manualPaidMinor;
  const quote = summary?.prepaymentQuote?.amountMinor ?? null;
  const isSettled = totalMinor !== null && paid >= totalMinor;
  const remaining = totalMinor === null ? null : Math.max(0, totalMinor - paid);
  const canCollect = remaining !== null && remaining > 0;

  // Owner acceptance MONEY-06: the block exists only for a clinic whose tariff carries payments.
  // Until the read resolves there is nothing proven, so nothing is drawn.
  if (!entitled) return null;

  return (
    <section className="space-y-2 border-t border-border pt-3 text-sm" aria-label="Оплата записи">
      {isSettled ? (
        <p className="font-medium">Оплачено: {money(paid)}</p>
      ) : paid > 0 && totalMinor !== null ? (
        <p>
          Частично оплачено: {money(paid)} из {money(totalMinor)} · осталось {money(remaining ?? 0)}
        </p>
      ) : quote ? (
        <p>Не оплачено · предоплата {money(quote, summary?.prepaymentQuote?.currency)}</p>
      ) : (
        <p>Не оплачено</p>
      )}
      {totalMinor === null ? (
        <p className="text-muted-foreground">Стоимость записи не определена.</p>
      ) : null}
      {error && !collectOpen ? (
        <p className="text-destructive" role="alert">
          {errorLabel(error)}
        </p>
      ) : null}
      {canCollect ? (
        <Button type="button" size="sm" onClick={() => setCollectOpen(true)}>
          Принять оплату
        </Button>
      ) : null}

      <DoctorModal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="Приём оплаты"
        size="sm"
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-medium">К оплате: {money(remaining ?? 0)}</p>
          {error ? (
            <p className="text-destructive" role="alert">
              {errorLabel(error)}
            </p>
          ) : null}
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
          {onlineAvailable ? (
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
                    {chatAvailable && patientUserId ? (
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
